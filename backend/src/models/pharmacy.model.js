const pool = require("../config/db");
const parsePagination = require("../utils/pagination");
const billingsModel = require("./billings.model");
const ApiError = require("../utils/api-error");

const mapMedicine = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    reorder_level: Number(row.reorder_level || 0),
    current_stock: Number(row.current_stock || 0),
    active_batch_count: Number(row.active_batch_count || 0),
    expiring_batch_count: Number(row.expiring_batch_count || 0)
  };
};

const mapMedicineBatch = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    received_quantity: Number(row.received_quantity || 0),
    available_quantity: Number(row.available_quantity || 0),
    purchase_price: Number(row.purchase_price || 0),
    sale_price: Number(row.sale_price || 0),
    reorder_level: row.reorder_level === undefined ? undefined : Number(row.reorder_level || 0)
  };
};

const mapDispenseItem = (item) => ({
  ...item,
  quantity: Number(item.quantity || 0),
  unit_price: Number(item.unit_price || 0),
  total_amount: Number(item.total_amount || 0)
});

const mapPharmacyDispense = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    items: Array.isArray(row.items) ? row.items.map(mapDispenseItem) : []
  };
};

const getNextDispenseNumber = async (db, organizationId) => {
  await db.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [organizationId]);

  const result = await db.query(
    `
      SELECT dispense_number
      FROM pharmacy_dispenses
      WHERE organization_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [organizationId]
  );

  const lastNumber = result.rows[0]?.dispense_number || "RX-0000";
  const numeric = Number.parseInt(String(lastNumber).split("-")[1], 10) || 0;
  return `RX-${String(numeric + 1).padStart(4, "0")}`;
};

const listMedicines = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["m.organization_id = $1"];

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(m.name ILIKE $${idx} OR m.generic_name ILIKE $${idx} OR m.code ILIKE $${idx})`);
  }

  if (query.active !== undefined) {
    values.push(query.active === "true");
    conditions.push(`m.is_active = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    SELECT
      m.id,
      m.organization_id,
      m.code,
      m.name,
      m.generic_name,
      m.dosage_form,
      m.strength,
      m.unit,
      m.reorder_level,
      m.is_active,
      m.created_at,
      m.updated_at,
      COALESCE(batch_summary.current_stock, 0)::numeric(12,2) AS current_stock,
      COALESCE(batch_summary.active_batch_count, 0)::int AS active_batch_count,
      batch_summary.nearest_expiry_date::text AS nearest_expiry_date,
      COALESCE(batch_summary.expiring_batch_count, 0)::int AS expiring_batch_count
    FROM medicines m
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(mb.available_quantity), 0)::numeric(12,2) AS current_stock,
        COUNT(*) FILTER (WHERE mb.available_quantity > 0)::int AS active_batch_count,
        MIN(mb.expiry_date) FILTER (WHERE mb.available_quantity > 0)::date AS nearest_expiry_date,
        COUNT(*) FILTER (
          WHERE mb.available_quantity > 0
            AND mb.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
        )::int AS expiring_batch_count
      FROM medicine_batches mb
      WHERE mb.organization_id = m.organization_id
        AND mb.medicine_id = m.id
    ) batch_summary ON true
    WHERE ${whereClause}
    ORDER BY m.is_active DESC, m.name ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM medicines m
    WHERE ${whereClause}
  `;

  const [rowsRes, countRes] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapMedicine),
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const getMedicineById = async (organizationId, id) => {
  const { rows } = await pool.query(
    `
      SELECT
        m.id,
        m.organization_id,
        m.code,
        m.name,
        m.generic_name,
        m.dosage_form,
        m.strength,
        m.unit,
        m.reorder_level,
        m.is_active,
        m.created_at,
        m.updated_at,
        COALESCE(batch_summary.current_stock, 0)::numeric(12,2) AS current_stock,
        COALESCE(batch_summary.active_batch_count, 0)::int AS active_batch_count,
        batch_summary.nearest_expiry_date::text AS nearest_expiry_date,
        COALESCE(batch_summary.expiring_batch_count, 0)::int AS expiring_batch_count
      FROM medicines m
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(mb.available_quantity), 0)::numeric(12,2) AS current_stock,
          COUNT(*) FILTER (WHERE mb.available_quantity > 0)::int AS active_batch_count,
          MIN(mb.expiry_date) FILTER (WHERE mb.available_quantity > 0)::date AS nearest_expiry_date,
          COUNT(*) FILTER (
            WHERE mb.available_quantity > 0
              AND mb.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
          )::int AS expiring_batch_count
        FROM medicine_batches mb
        WHERE mb.organization_id = m.organization_id
          AND mb.medicine_id = m.id
      ) batch_summary ON true
      WHERE m.organization_id = $1
        AND m.id = $2
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapMedicine(rows[0] || null);
};

const createMedicine = async (organizationId, payload) => {
  const { rows } = await pool.query(
    `
      INSERT INTO medicines (
        organization_id,
        code,
        name,
        generic_name,
        dosage_form,
        strength,
        unit,
        reorder_level,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `,
    [
      organizationId,
      payload.code || null,
      payload.name,
      payload.genericName || null,
      payload.dosageForm || null,
      payload.strength || null,
      payload.unit || "unit",
      payload.reorderLevel ?? 0,
      payload.isActive ?? true
    ]
  );

  return getMedicineById(organizationId, rows[0].id);
};

const updateMedicine = async (organizationId, id, payload) => {
  const columnMap = {
    code: "code",
    name: "name",
    genericName: "generic_name",
    dosageForm: "dosage_form",
    strength: "strength",
    unit: "unit",
    reorderLevel: "reorder_level",
    isActive: "is_active"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getMedicineById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const { rows } = await pool.query(
    `
      UPDATE medicines
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING id
    `,
    values
  );

  if (!rows[0]) {
    return null;
  }

  return getMedicineById(organizationId, id);
};

const listMedicineBatches = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["mb.organization_id = $1"];

  if (query.medicineId) {
    values.push(query.medicineId);
    conditions.push(`mb.medicine_id = $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(m.name ILIKE $${idx} OR m.code ILIKE $${idx} OR mb.batch_number ILIKE $${idx})`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    SELECT
      mb.id,
      mb.organization_id,
      mb.medicine_id,
      m.code AS medicine_code,
      m.name AS medicine_name,
      m.generic_name,
      m.unit,
      m.reorder_level,
      mb.batch_number,
      mb.manufacturer,
      mb.expiry_date::text AS expiry_date,
      mb.received_quantity,
      mb.available_quantity,
      mb.purchase_price,
      mb.sale_price,
      mb.received_date::text AS received_date,
      mb.created_at,
      mb.updated_at
    FROM medicine_batches mb
    JOIN medicines m
      ON m.id = mb.medicine_id
     AND m.organization_id = mb.organization_id
    WHERE ${whereClause}
    ORDER BY mb.expiry_date ASC, m.name ASC, mb.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM medicine_batches mb
    JOIN medicines m
      ON m.id = mb.medicine_id
     AND m.organization_id = mb.organization_id
    WHERE ${whereClause}
  `;

  const [rowsRes, countRes] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapMedicineBatch),
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const getMedicineBatchByIdWithDb = async (db, organizationId, id, { forUpdate = false } = {}) => {
  const { rows } = await db.query(
    `
      SELECT
        mb.id,
        mb.organization_id,
        mb.medicine_id,
        m.code AS medicine_code,
        m.name AS medicine_name,
        m.generic_name,
        m.unit,
        m.reorder_level,
        mb.batch_number,
        mb.manufacturer,
        mb.expiry_date::text AS expiry_date,
        mb.received_quantity,
        mb.available_quantity,
        mb.purchase_price,
        mb.sale_price,
        mb.received_date::text AS received_date,
        mb.created_at,
        mb.updated_at
      FROM medicine_batches mb
      JOIN medicines m
        ON m.id = mb.medicine_id
       AND m.organization_id = mb.organization_id
      WHERE mb.organization_id = $1
        AND mb.id = $2
      ${forUpdate ? "FOR UPDATE" : ""}
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapMedicineBatch(rows[0] || null);
};

const getMedicineBatchById = async (organizationId, id) => getMedicineBatchByIdWithDb(pool, organizationId, id);

const createMedicineBatch = async (organizationId, payload) => {
  const { rows } = await pool.query(
    `
      INSERT INTO medicine_batches (
        organization_id,
        medicine_id,
        batch_number,
        manufacturer,
        expiry_date,
        received_quantity,
        available_quantity,
        purchase_price,
        sale_price,
        received_date
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `,
    [
      organizationId,
      payload.medicineId,
      payload.batchNumber,
      payload.manufacturer || null,
      payload.expiryDate,
      payload.receivedQuantity,
      payload.availableQuantity ?? payload.receivedQuantity,
      payload.purchasePrice ?? 0,
      payload.salePrice ?? 0,
      payload.receivedDate || null
    ]
  );

  return getMedicineBatchById(organizationId, rows[0].id);
};

const updateMedicineBatch = async (organizationId, id, payload) => {
  const columnMap = {
    batchNumber: "batch_number",
    manufacturer: "manufacturer",
    expiryDate: "expiry_date",
    receivedQuantity: "received_quantity",
    availableQuantity: "available_quantity",
    purchasePrice: "purchase_price",
    salePrice: "sale_price",
    receivedDate: "received_date"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getMedicineBatchById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const { rows } = await pool.query(
    `
      UPDATE medicine_batches
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING id
    `,
    values
  );

  if (!rows[0]) {
    return null;
  }

  return getMedicineBatchById(organizationId, id);
};

const getPharmacyDispenseByIdWithDb = async (db, organizationId, id) => {
  const { rows } = await db.query(
    `
      SELECT
        pd.id,
        pd.organization_id,
        pd.dispense_number,
        pd.patient_id,
        p.patient_code,
        p.full_name AS patient_name,
        p.phone,
        pd.doctor_id,
        d.full_name AS doctor_name,
        pd.appointment_id,
        pd.medical_record_id,
        mr.record_date::text AS medical_record_date,
        mr.record_type AS medical_record_type,
        pd.invoice_id,
        i.invoice_number,
        i.status AS invoice_status,
        pd.dispensed_by_user_id,
        dispensed_by.full_name AS dispensed_by_name,
        pd.status,
        pd.dispensed_date::text AS dispensed_date,
        pd.prescription_snapshot,
        pd.notes,
        pd.created_at,
        pd.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', pdi.id,
              'medicine_id', pdi.medicine_id,
              'medicine_batch_id', pdi.medicine_batch_id,
              'medicine_name', pdi.medicine_name,
              'batch_number', pdi.batch_number,
              'expiry_date', pdi.expiry_date,
              'quantity', pdi.quantity,
              'unit_price', pdi.unit_price,
              'total_amount', pdi.total_amount,
              'directions', pdi.directions
            )
            ORDER BY pdi.created_at ASC
          ) FILTER (WHERE pdi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM pharmacy_dispenses pd
      JOIN patients p
        ON p.id = pd.patient_id
       AND p.organization_id = pd.organization_id
      LEFT JOIN doctors d
        ON d.id = pd.doctor_id
       AND d.organization_id = pd.organization_id
      LEFT JOIN medical_records mr
        ON mr.id = pd.medical_record_id
       AND mr.organization_id = pd.organization_id
      LEFT JOIN invoices i
        ON i.id = pd.invoice_id
       AND i.organization_id = pd.organization_id
      LEFT JOIN users dispensed_by
        ON dispensed_by.id = pd.dispensed_by_user_id
       AND dispensed_by.organization_id = pd.organization_id
      LEFT JOIN pharmacy_dispense_items pdi
        ON pdi.dispense_id = pd.id
      WHERE pd.organization_id = $1
        AND pd.id = $2
      GROUP BY
        pd.id,
        p.patient_code,
        p.full_name,
        p.phone,
        d.full_name,
        mr.record_date,
        mr.record_type,
        i.invoice_number,
        i.status,
        dispensed_by.full_name
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapPharmacyDispense(rows[0] || null);
};

const getPharmacyDispenseById = async (organizationId, id) => getPharmacyDispenseByIdWithDb(pool, organizationId, id);

const listPharmacyDispenses = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["pd.organization_id = $1"];

  if (query.status) {
    values.push(query.status);
    conditions.push(`pd.status = $${values.length}`);
  }

  if (query.patientId) {
    values.push(query.patientId);
    conditions.push(`pd.patient_id = $${values.length}`);
  }

  if (query.doctorId) {
    values.push(query.doctorId);
    conditions.push(`pd.doctor_id = $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(
      `(pd.dispense_number ILIKE $${idx} OR p.full_name ILIKE $${idx} OR p.patient_code ILIKE $${idx} OR EXISTS (
        SELECT 1
        FROM pharmacy_dispense_items search_items
        WHERE search_items.dispense_id = pd.id
          AND search_items.medicine_name ILIKE $${idx}
      ))`
    );
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    SELECT
      pd.id,
      pd.organization_id,
      pd.dispense_number,
      pd.patient_id,
      p.patient_code,
      p.full_name AS patient_name,
      p.phone,
      pd.doctor_id,
      d.full_name AS doctor_name,
      pd.appointment_id,
      pd.medical_record_id,
      mr.record_date::text AS medical_record_date,
      mr.record_type AS medical_record_type,
      pd.invoice_id,
      i.invoice_number,
      i.status AS invoice_status,
      pd.dispensed_by_user_id,
      dispensed_by.full_name AS dispensed_by_name,
      pd.status,
      pd.dispensed_date::text AS dispensed_date,
      pd.prescription_snapshot,
      pd.notes,
      pd.created_at,
      pd.updated_at,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', pdi.id,
            'medicine_id', pdi.medicine_id,
            'medicine_batch_id', pdi.medicine_batch_id,
            'medicine_name', pdi.medicine_name,
            'batch_number', pdi.batch_number,
            'expiry_date', pdi.expiry_date,
            'quantity', pdi.quantity,
            'unit_price', pdi.unit_price,
            'total_amount', pdi.total_amount,
            'directions', pdi.directions
          )
          ORDER BY pdi.created_at ASC
        ) FILTER (WHERE pdi.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM pharmacy_dispenses pd
    JOIN patients p
      ON p.id = pd.patient_id
     AND p.organization_id = pd.organization_id
    LEFT JOIN doctors d
      ON d.id = pd.doctor_id
     AND d.organization_id = pd.organization_id
    LEFT JOIN medical_records mr
      ON mr.id = pd.medical_record_id
     AND mr.organization_id = pd.organization_id
    LEFT JOIN invoices i
      ON i.id = pd.invoice_id
     AND i.organization_id = pd.organization_id
    LEFT JOIN users dispensed_by
      ON dispensed_by.id = pd.dispensed_by_user_id
     AND dispensed_by.organization_id = pd.organization_id
    LEFT JOIN pharmacy_dispense_items pdi
      ON pdi.dispense_id = pd.id
    WHERE ${whereClause}
    GROUP BY
      pd.id,
      p.patient_code,
      p.full_name,
      p.phone,
      d.full_name,
      mr.record_date,
      mr.record_type,
      i.invoice_number,
      i.status,
      dispensed_by.full_name
    ORDER BY pd.dispensed_date DESC, pd.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM pharmacy_dispenses pd
    JOIN patients p
      ON p.id = pd.patient_id
     AND p.organization_id = pd.organization_id
    WHERE ${whereClause}
  `;

  const [rowsRes, countRes] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapPharmacyDispense),
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const createPharmacyDispense = async (organizationId, payload, actor = null) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const dispenseNumber = await getNextDispenseNumber(client, organizationId);
    const dispenseRes = await client.query(
      `
        INSERT INTO pharmacy_dispenses (
          organization_id,
          dispense_number,
          patient_id,
          doctor_id,
          appointment_id,
          medical_record_id,
          invoice_id,
          dispensed_by_user_id,
          status,
          dispensed_date,
          prescription_snapshot,
          notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id
      `,
      [
        organizationId,
        dispenseNumber,
        payload.patientId,
        payload.doctorId || null,
        payload.appointmentId || null,
        payload.medicalRecordId || null,
        null,
        payload.dispensedByUserId || null,
        payload.status || "dispensed",
        payload.dispensedDate,
        payload.prescriptionSnapshot || null,
        payload.notes || null
      ]
    );

    const dispenseId = dispenseRes.rows[0].id;
    const invoiceItems = [];

    for (const item of payload.items || []) {
      const batch = await getMedicineBatchByIdWithDb(client, organizationId, item.medicineBatchId, { forUpdate: true });
      if (!batch) {
        throw new ApiError(404, "Selected medicine batch was not found");
      }

      const quantity = Number(item.quantity);
      if (batch.available_quantity < quantity) {
        throw new ApiError(400, `Insufficient stock for ${batch.medicine_name} batch ${batch.batch_number}`);
      }

      if (batch.expiry_date && batch.expiry_date < payload.dispensedDate) {
        throw new ApiError(400, `Cannot dispense expired batch ${batch.batch_number} for ${batch.medicine_name}`);
      }

      const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : Number(batch.sale_price || 0);
      const totalAmount = Number((unitPrice * quantity).toFixed(2));

      await client.query(
        `
          INSERT INTO pharmacy_dispense_items (
            dispense_id,
            medicine_id,
            medicine_batch_id,
            medicine_name,
            batch_number,
            expiry_date,
            quantity,
            unit_price,
            total_amount,
            directions
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          dispenseId,
          batch.medicine_id,
          batch.id,
          batch.medicine_name,
          batch.batch_number,
          batch.expiry_date || null,
          quantity,
          unitPrice,
          totalAmount,
          item.directions || null
        ]
      );

      await client.query(
        `
          UPDATE medicine_batches
          SET available_quantity = available_quantity - $3,
              updated_at = NOW()
          WHERE organization_id = $1
            AND id = $2
        `,
        [organizationId, batch.id, quantity]
      );

      invoiceItems.push({
        description: `${batch.medicine_name} (${batch.batch_number})`,
        quantity,
        unitPrice,
        totalAmount
      });
    }

    let createdInvoice = null;
    if (payload.createInvoice !== false) {
      createdInvoice = await billingsModel.createInvoiceWithDb(
        client,
        organizationId,
        {
          patientId: payload.patientId,
          doctorId: payload.doctorId || null,
          appointmentId: payload.appointmentId || null,
          issueDate: payload.dispensedDate,
          dueDate: payload.dispensedDate,
          status: "issued",
          currency: payload.currency || "INR",
          notes: payload.invoiceNotes || payload.notes || null,
          items: invoiceItems
        },
        actor,
        {
          pharmacyDispenseId: dispenseId,
          medicalRecordId: payload.medicalRecordId || null
        }
      );

      await client.query(
        `
          UPDATE pharmacy_dispenses
          SET invoice_id = $3,
              updated_at = NOW()
          WHERE organization_id = $1
            AND id = $2
        `,
        [organizationId, dispenseId, createdInvoice.id]
      );
    }

    await client.query("COMMIT");
    return getPharmacyDispenseByIdWithDb(client, organizationId, dispenseId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  listMedicineBatches,
  getMedicineBatchById,
  createMedicineBatch,
  updateMedicineBatch,
  listPharmacyDispenses,
  getPharmacyDispenseById,
  createPharmacyDispense
};
