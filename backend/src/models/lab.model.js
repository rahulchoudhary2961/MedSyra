const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const mapLabTest = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    price: Number(row.price || 0),
    turnaround_hours: row.turnaround_hours === null || row.turnaround_hours === undefined
      ? null
      : Number(row.turnaround_hours)
  };
};

const normalizeOrderItems = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    ...item,
    price: Number(item.price || 0)
  }));
};

const mapLabOrder = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    items: normalizeOrderItems(row.items)
  };
};

const getNextOrderNumber = async (db, organizationId) => {
  await db.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [organizationId]);

  const result = await db.query(
    `
      SELECT order_number
      FROM lab_orders
      WHERE organization_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [organizationId]
  );

  const lastNumber = result.rows[0]?.order_number || "LAB-0000";
  const numeric = Number.parseInt(String(lastNumber).split("-")[1], 10) || 0;
  return `LAB-${String(numeric + 1).padStart(4, "0")}`;
};

const listLabTests = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["organization_id = $1"];

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(name ILIKE $${idx} OR department ILIKE $${idx} OR code ILIKE $${idx})`);
  }

  if (query.active !== undefined) {
    values.push(query.active === "true");
    conditions.push(`is_active = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    SELECT
      id,
      organization_id,
      code,
      name,
      department,
      price,
      turnaround_hours,
      instructions,
      is_active,
      created_at,
      updated_at
    FROM lab_tests
    WHERE ${whereClause}
    ORDER BY is_active DESC, name ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM lab_tests
    WHERE ${whereClause}
  `;

  const [rowsRes, countRes] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapLabTest),
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const getLabTestById = async (organizationId, id) => {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        organization_id,
        code,
        name,
        department,
        price,
        turnaround_hours,
        instructions,
        is_active,
        created_at,
        updated_at
      FROM lab_tests
      WHERE organization_id = $1 AND id = $2
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapLabTest(rows[0] || null);
};

const createLabTest = async (organizationId, payload) => {
  const { rows } = await pool.query(
    `
      INSERT INTO lab_tests (
        organization_id,
        code,
        name,
        department,
        price,
        turnaround_hours,
        instructions,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `,
    [
      organizationId,
      payload.code || null,
      payload.name,
      payload.department || null,
      payload.price,
      payload.turnaroundHours ?? null,
      payload.instructions || null,
      payload.isActive ?? true
    ]
  );

  return getLabTestById(organizationId, rows[0].id);
};

const updateLabTest = async (organizationId, id, payload) => {
  const columnMap = {
    code: "code",
    name: "name",
    department: "department",
    price: "price",
    turnaroundHours: "turnaround_hours",
    instructions: "instructions",
    isActive: "is_active"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getLabTestById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const { rows } = await pool.query(
    `
      UPDATE lab_tests
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING id
    `,
    values
  );

  if (!rows[0]) {
    return null;
  }

  return getLabTestById(organizationId, id);
};

const getLabOrderByIdWithDb = async (db, organizationId, id) => {
  const { rows } = await db.query(
    `
      SELECT
        lo.id,
        lo.organization_id,
        lo.order_number,
        lo.patient_id,
        p.patient_code,
        p.full_name AS patient_name,
        p.phone,
        lo.doctor_id,
        d.full_name AS doctor_name,
        lo.appointment_id,
        lo.ordered_by_user_id,
        ordered_by.full_name AS ordered_by_name,
        lo.status,
        lo.ordered_date::text AS ordered_date,
        lo.due_date::text AS due_date,
        lo.notes,
        lo.report_file_url,
        lo.sample_collected_at,
        lo.processing_started_at,
        lo.report_ready_at,
        lo.completed_at,
        lo.created_at,
        lo.updated_at,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', loi.id,
              'lab_test_id', loi.lab_test_id,
              'test_name', loi.test_name,
              'price', loi.price,
              'result_summary', loi.result_summary
            )
            ORDER BY loi.created_at ASC
          ) FILTER (WHERE loi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM lab_orders lo
      JOIN patients p
        ON p.id = lo.patient_id
       AND p.organization_id = lo.organization_id
      LEFT JOIN doctors d
        ON d.id = lo.doctor_id
       AND d.organization_id = lo.organization_id
      LEFT JOIN users ordered_by
        ON ordered_by.id = lo.ordered_by_user_id
       AND ordered_by.organization_id = lo.organization_id
      LEFT JOIN lab_order_items loi
        ON loi.lab_order_id = lo.id
      WHERE lo.organization_id = $1
        AND lo.id = $2
      GROUP BY
        lo.id,
        p.patient_code,
        p.full_name,
        p.phone,
        d.full_name,
        ordered_by.full_name
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapLabOrder(rows[0] || null);
};

const getLabOrderById = async (organizationId, id) => getLabOrderByIdWithDb(pool, organizationId, id);

const listLabOrders = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["lo.organization_id = $1"];

  if (query.status) {
    values.push(query.status);
    conditions.push(`lo.status = $${values.length}`);
  }

  if (query.patientId) {
    values.push(query.patientId);
    conditions.push(`lo.patient_id = $${values.length}`);
  }

  if (query.doctorId) {
    values.push(query.doctorId);
    conditions.push(`lo.doctor_id = $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(
      `(lo.order_number ILIKE $${idx} OR p.full_name ILIKE $${idx} OR p.patient_code ILIKE $${idx} OR EXISTS (
        SELECT 1
        FROM lab_order_items search_items
        WHERE search_items.lab_order_id = lo.id
          AND search_items.test_name ILIKE $${idx}
      ))`
    );
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    SELECT
      lo.id,
      lo.organization_id,
      lo.order_number,
      lo.patient_id,
      p.patient_code,
      p.full_name AS patient_name,
      p.phone,
      lo.doctor_id,
      d.full_name AS doctor_name,
      lo.appointment_id,
      lo.ordered_by_user_id,
      ordered_by.full_name AS ordered_by_name,
      lo.status,
      lo.ordered_date::text AS ordered_date,
      lo.due_date::text AS due_date,
      lo.notes,
      lo.report_file_url,
      lo.sample_collected_at,
      lo.processing_started_at,
      lo.report_ready_at,
      lo.completed_at,
      lo.created_at,
      lo.updated_at,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'id', loi.id,
            'lab_test_id', loi.lab_test_id,
            'test_name', loi.test_name,
            'price', loi.price,
            'result_summary', loi.result_summary
          )
          ORDER BY loi.created_at ASC
        ) FILTER (WHERE loi.id IS NOT NULL),
        '[]'::json
      ) AS items
    FROM lab_orders lo
    JOIN patients p
      ON p.id = lo.patient_id
     AND p.organization_id = lo.organization_id
    LEFT JOIN doctors d
      ON d.id = lo.doctor_id
     AND d.organization_id = lo.organization_id
    LEFT JOIN users ordered_by
      ON ordered_by.id = lo.ordered_by_user_id
     AND ordered_by.organization_id = lo.organization_id
    LEFT JOIN lab_order_items loi
      ON loi.lab_order_id = lo.id
    WHERE ${whereClause}
    GROUP BY
      lo.id,
      p.patient_code,
      p.full_name,
      p.phone,
      d.full_name,
      ordered_by.full_name
    ORDER BY lo.ordered_date DESC, lo.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM lab_orders lo
    JOIN patients p
      ON p.id = lo.patient_id
     AND p.organization_id = lo.organization_id
    WHERE ${whereClause}
  `;

  const [rowsRes, countRes] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapLabOrder),
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const createLabOrder = async (organizationId, payload) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderNumber = await getNextOrderNumber(client, organizationId);
    const orderResult = await client.query(
      `
        INSERT INTO lab_orders (
          organization_id,
          branch_id,
          order_number,
          patient_id,
          doctor_id,
          appointment_id,
          ordered_by_user_id,
          status,
          ordered_date,
          due_date,
          notes,
          report_file_url,
          sample_collected_at,
          processing_started_at,
          report_ready_at,
          completed_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING id
      `,
      [
        organizationId,
        payload.branchId,
        orderNumber,
        payload.patientId,
        payload.doctorId || null,
        payload.appointmentId || null,
        payload.orderedByUserId || null,
        payload.status || "ordered",
        payload.orderedDate,
        payload.dueDate || null,
        payload.notes || null,
        payload.reportFileUrl || null,
        payload.sampleCollectedAt || null,
        payload.processingStartedAt || null,
        payload.reportReadyAt || null,
        payload.completedAt || null
      ]
    );

    const orderId = orderResult.rows[0].id;
    for (const item of payload.items || []) {
      await client.query(
        `
          INSERT INTO lab_order_items (
            lab_order_id,
            lab_test_id,
            test_name,
            price,
            result_summary
          )
          VALUES ($1,$2,$3,$4,$5)
        `,
        [
          orderId,
          item.labTestId || null,
          item.testName,
          item.price || 0,
          item.resultSummary || null
        ]
      );
    }

    await client.query("COMMIT");
    return getLabOrderByIdWithDb(client, organizationId, orderId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateLabOrder = async (organizationId, id, payload) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const columnMap = {
      patientId: "patient_id",
      doctorId: "doctor_id",
      appointmentId: "appointment_id",
      status: "status",
      orderedDate: "ordered_date",
      dueDate: "due_date",
      notes: "notes",
      reportFileUrl: "report_file_url",
      sampleCollectedAt: "sample_collected_at",
      processingStartedAt: "processing_started_at",
      reportReadyAt: "report_ready_at",
      completedAt: "completed_at"
    };

    const mappedEntries = Object.entries(payload)
      .filter(([key, value]) => columnMap[key] && value !== undefined)
      .map(([key, value]) => [columnMap[key], value]);

    if (mappedEntries.length > 0 || Array.isArray(payload.items)) {
      const setClauses = [];
      const values = [organizationId, id];

      mappedEntries.forEach(([column, value], index) => {
        setClauses.push(`${column} = $${index + 3}`);
        values.push(value);
      });

      const query = `
        UPDATE lab_orders
        SET ${setClauses.length > 0 ? `${setClauses.join(", ")}, ` : ""}updated_at = NOW()
        WHERE organization_id = $1 AND id = $2
        RETURNING id
      `;

      const { rows } = await client.query(query, values);
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }

      if (Array.isArray(payload.items)) {
        await client.query("DELETE FROM lab_order_items WHERE lab_order_id = $1", [id]);
        for (const item of payload.items) {
          await client.query(
            `
              INSERT INTO lab_order_items (
                lab_order_id,
                lab_test_id,
                test_name,
                price,
                result_summary
              )
              VALUES ($1,$2,$3,$4,$5)
            `,
            [
              id,
              item.labTestId || null,
              item.testName,
              item.price || 0,
              item.resultSummary || null
            ]
          );
        }
      }
    }

    await client.query("COMMIT");
    return getLabOrderByIdWithDb(client, organizationId, id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listLabTests,
  getLabTestById,
  createLabTest,
  updateLabTest,
  listLabOrders,
  getLabOrderById,
  createLabOrder,
  updateLabOrder
};
