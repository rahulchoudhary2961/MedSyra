const crypto = require("crypto");
const pool = require("../config/db");

const PHONE_NORMALIZE_SQL = "regexp_replace(phone, '[^0-9]', '', 'g')";

const generatePatientCode = () => {
  const timePart = Date.now().toString(36).toUpperCase();
  const entropyPart = crypto.randomBytes(6).toString("hex").toUpperCase();
  return `PAT-${timePart}-${entropyPart}`;
};

const isPatientCodeConflict = (error) =>
  error?.code === "23505" && String(error?.constraint || "").toLowerCase() === "uq_patients_org_code";

const withPatientCodeRetry = async (client, organizationId, payload, maxAttempts = 3) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.query("BEGIN");

      const patientCode = generatePatientCode();
      const query = `
        INSERT INTO patients (
          organization_id, patient_code, full_name, age, date_of_birth, gender, phone, email,
          blood_type, emergency_contact, address, status, last_visit_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING id, patient_code, full_name, age, date_of_birth, gender, phone, email, blood_type, emergency_contact,
                  address, status, last_visit_at, created_at, updated_at
      `;

      const values = [
        organizationId,
        patientCode,
        payload.fullName,
        payload.age,
        payload.dateOfBirth || null,
        payload.gender,
        payload.phone,
        payload.email,
        payload.bloodType,
        payload.emergencyContact,
        payload.address,
        payload.status || "active",
        payload.lastVisitAt || null
      ];

      const { rows } = await client.query(query, values);
      await client.query("COMMIT");
      return rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      if (isPatientCodeConflict(error) && attempt < maxAttempts) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to generate a unique patient code");
};

const listPatients = async ({ organizationId, search, status, limit, offset }) => {
  const values = [organizationId];
  const conditions = ["p.organization_id = $1", "p.is_active = true"];

  if (search) {
    values.push(`%${search}%`);
    const idx = values.length;
    conditions.push(`(p.patient_code ILIKE $${idx} OR p.full_name ILIKE $${idx} OR p.email ILIKE $${idx} OR p.phone ILIKE $${idx})`);
  }

  if (status) {
    values.push(status);
    conditions.push(`p.status = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const query = `
    SELECT p.id, p.patient_code, p.full_name, p.age, p.date_of_birth, p.gender, p.phone, p.email, p.blood_type, p.emergency_contact,
           p.address, p.status, p.last_visit_at,
           p.created_at, p.updated_at
    FROM patients p
    WHERE ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countQuery = `SELECT COUNT(*)::int AS total FROM patients p WHERE ${whereClause}`;
  const [dataResult, countResult] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, values.length - 2))
  ]);

  return {
    items: dataResult.rows,
    total: countResult.rows[0].total
  };
};

const createPatient = async (organizationId, payload) => {
  const client = await pool.connect();

  try {
    return await withPatientCodeRetry(client, organizationId, payload);
  } finally {
    client.release();
  }
};

const findDuplicatePatient = async (organizationId, { phone, email, excludeId = null }) => {
  const values = [organizationId, phone];
  let emailCondition = "";

  if (email) {
    values.push(email);
    emailCondition = `OR (email IS NOT NULL AND LOWER(email) = LOWER($${values.length}))`;
  }

  let excludeCondition = "";
  if (excludeId) {
    values.push(excludeId);
    excludeCondition = `AND id <> $${values.length}`;
  }

  const query = `
    SELECT id, full_name, phone, email
    FROM patients
    WHERE organization_id = $1
      AND is_active = true
      AND (
        ${PHONE_NORMALIZE_SQL} = regexp_replace($2, '[^0-9]', '', 'g')
        ${emailCondition}
      )
      ${excludeCondition}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const { rows } = await pool.query(query, values);
  return rows[0] || null;
};

const getPatientById = async (organizationId, id) => {
  const query = `
    SELECT p.id, p.patient_code, p.full_name, p.age, p.date_of_birth, p.gender, p.phone, p.email, p.blood_type, p.emergency_contact,
           p.address, p.status, p.last_visit_at,
           p.created_at, p.updated_at
    FROM patients p
    WHERE p.organization_id = $1 AND p.id = $2 AND p.is_active = true
  `;
  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

const getPatientProfile = async (organizationId, id) => {
  const patientPromise = getPatientById(organizationId, id);
  const appointmentsPromise = pool.query(
    `
    SELECT
      a.id,
      a.appointment_date::text AS appointment_date,
      a.appointment_time,
      a.category,
      a.status,
      a.planned_procedures,
      a.notes,
      a.doctor_id,
      d.full_name AS doctor_name
    FROM appointments a
    LEFT JOIN doctors d
      ON d.id = a.doctor_id
     AND d.organization_id = a.organization_id
    WHERE a.organization_id = $1
      AND a.patient_id = $2
    ORDER BY a.appointment_date DESC, a.appointment_time DESC
    `,
    [organizationId, id]
  );
  const medicalRecordsPromise = pool.query(
    `
    SELECT
      mr.id,
      mr.appointment_id,
      mr.patient_id,
      p.full_name AS patient_name,
      mr.doctor_id,
      d.full_name AS doctor_name,
      mr.record_date::text AS record_date,
      mr.record_type,
      mr.status,
      mr.symptoms,
      mr.diagnosis,
      mr.prescription,
      mr.follow_up_date,
      mr.follow_up_reminder_status,
      mr.follow_up_reminder_sent_at,
      mr.notes,
      mr.file_url
    FROM medical_records mr
    JOIN patients p
      ON p.id = mr.patient_id
     AND p.organization_id = mr.organization_id
    LEFT JOIN doctors d
      ON d.id = mr.doctor_id
     AND d.organization_id = mr.organization_id
    WHERE mr.organization_id = $1
      AND mr.patient_id = $2
    ORDER BY mr.record_date DESC, mr.created_at DESC
    `,
    [organizationId, id]
  );
  const invoicesPromise = pool.query(
    `
    SELECT
      i.id,
      i.invoice_number,
      i.total_amount,
      i.balance_amount,
      i.status,
      i.issue_date::text AS issue_date
    FROM invoices i
    WHERE i.organization_id = $1
      AND i.patient_id = $2
    ORDER BY i.issue_date DESC, i.created_at DESC
    `,
    [organizationId, id]
  );
  const labOrdersPromise = pool.query(
    `
    SELECT
      lo.id,
      lo.order_number,
      lo.status,
      lo.ordered_date::text AS ordered_date,
      lo.due_date::text AS due_date,
      lo.report_file_url,
      d.full_name AS doctor_name,
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
    LEFT JOIN doctors d
      ON d.id = lo.doctor_id
     AND d.organization_id = lo.organization_id
    LEFT JOIN lab_order_items loi
      ON loi.lab_order_id = lo.id
    WHERE lo.organization_id = $1
      AND lo.patient_id = $2
    GROUP BY lo.id, d.full_name
    ORDER BY lo.ordered_date DESC, lo.created_at DESC
    `,
    [organizationId, id]
  );
  const pharmacyDispensesPromise = pool.query(
    `
    SELECT
      pd.id,
      pd.dispense_number,
      pd.status,
      pd.dispensed_date::text AS dispensed_date,
      pd.prescription_snapshot,
      pd.notes,
      d.full_name AS doctor_name,
      i.invoice_id,
      i.invoice_number,
      i.invoice_status,
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
    LEFT JOIN doctors d
      ON d.id = pd.doctor_id
     AND d.organization_id = pd.organization_id
    LEFT JOIN LATERAL (
      SELECT
        inv.id AS invoice_id,
        inv.invoice_number,
        inv.status AS invoice_status
      FROM invoices inv
      WHERE inv.id = pd.invoice_id
        AND inv.organization_id = pd.organization_id
      LIMIT 1
    ) i ON true
    LEFT JOIN pharmacy_dispense_items pdi
      ON pdi.dispense_id = pd.id
    WHERE pd.organization_id = $1
      AND pd.patient_id = $2
    GROUP BY pd.id, d.full_name, i.invoice_id, i.invoice_number, i.invoice_status
    ORDER BY pd.dispensed_date DESC, pd.created_at DESC
    `,
    [organizationId, id]
  );
  const summaryPromise = pool.query(
    `
    SELECT
      COUNT(a.id)::int AS total_visits,
      COALESCE(SUM(i.paid_amount), 0)::numeric(12,2) AS total_spent,
      MAX(a.appointment_date)::text AS last_visit_date,
      COALESCE(SUM(i.balance_amount), 0)::numeric(12,2) AS pending_amount
    FROM patients p
    LEFT JOIN appointments a
      ON a.patient_id = p.id
     AND a.organization_id = p.organization_id
    LEFT JOIN invoices i
      ON i.patient_id = p.id
     AND i.organization_id = p.organization_id
    WHERE p.organization_id = $1
      AND p.id = $2
    GROUP BY p.id
    `,
    [organizationId, id]
  );

  const [patient, appointmentsRes, medicalRecordsRes, invoicesRes, labOrdersRes, pharmacyDispensesRes, summaryRes] = await Promise.all([
    patientPromise,
    appointmentsPromise,
    medicalRecordsPromise,
    invoicesPromise,
    labOrdersPromise,
    pharmacyDispensesPromise,
    summaryPromise
  ]);

  return {
    patient,
    visits: appointmentsRes.rows,
    medicalRecords: medicalRecordsRes.rows,
    invoices: invoicesRes.rows,
    labOrders: labOrdersRes.rows.map((row) => ({
      ...row,
      items: Array.isArray(row.items)
        ? row.items.map((item) => ({
            ...item,
            price: Number(item.price || 0)
          }))
        : []
    })),
    pharmacyDispenses: pharmacyDispensesRes.rows.map((row) => ({
      ...row,
      items: Array.isArray(row.items)
        ? row.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
            total_amount: Number(item.total_amount || 0)
          }))
        : []
    })),
    summary: summaryRes.rows[0] || {
      total_visits: 0,
      total_spent: 0,
      last_visit_date: null,
      pending_amount: 0
    }
  };
};

const updatePatient = async (organizationId, id, payload) => {
  const columnMap = {
    fullName: "full_name",
    age: "age",
    dateOfBirth: "date_of_birth",
    gender: "gender",
    phone: "phone",
    email: "email",
    bloodType: "blood_type",
    emergencyContact: "emergency_contact",
    address: "address",
    status: "status",
    lastVisitAt: "last_visit_at"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getPatientById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const query = `
    UPDATE patients
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE organization_id = $1 AND id = $2 AND is_active = true
    RETURNING id, patient_code, full_name, age, date_of_birth, gender, phone, email, blood_type, emergency_contact,
              address, status, last_visit_at, created_at, updated_at
  `;

  const { rows } = await pool.query(query, values);
  return rows[0] || null;
};

const softDeletePatient = async (organizationId, id) => {
  const query = `
    UPDATE patients
    SET is_active = false, updated_at = NOW()
    WHERE organization_id = $1 AND id = $2 AND is_active = true
    RETURNING id
  `;
  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

module.exports = {
  listPatients,
  createPatient,
  findDuplicatePatient,
  getPatientById,
  getPatientProfile,
  updatePatient,
  softDeletePatient
};
