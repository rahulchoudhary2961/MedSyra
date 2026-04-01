const pool = require("../config/db");

const PHONE_NORMALIZE_SQL = "regexp_replace(phone, '[^0-9]', '', 'g')";

const listPatients = async ({ organizationId, search, status, limit, offset }) => {
  const values = [organizationId];
  const conditions = ["p.organization_id = $1", "p.is_active = true"];

  if (search) {
    values.push(`%${search}%`);
    const idx = values.length;
    conditions.push(`(p.full_name ILIKE $${idx} OR p.email ILIKE $${idx} OR p.phone ILIKE $${idx})`);
  }

  if (status) {
    values.push(status);
    conditions.push(`p.status = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const query = `
    SELECT p.id, p.full_name, p.age, p.gender, p.phone, p.email, p.blood_type, p.emergency_contact,
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
  const query = `
    INSERT INTO patients (
      organization_id, full_name, age, gender, phone, email,
      blood_type, emergency_contact, address, status, last_visit_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING id, full_name, age, gender, phone, email, blood_type, emergency_contact,
              address, status, last_visit_at, created_at, updated_at
  `;

  const values = [
    organizationId,
    payload.fullName,
    payload.age,
    payload.gender,
    payload.phone,
    payload.email,
    payload.bloodType,
    payload.emergencyContact,
    payload.address,
    payload.status || "active",
    payload.lastVisitAt || null
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
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
    SELECT p.id, p.full_name, p.age, p.gender, p.phone, p.email, p.blood_type, p.emergency_contact,
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
      mr.record_date::text AS record_date,
      mr.record_type,
      mr.status,
      mr.diagnosis,
      mr.prescription,
      mr.follow_up_date,
      mr.follow_up_reminder_status,
      mr.follow_up_reminder_sent_at,
      mr.notes
    FROM medical_records mr
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

  const [patient, appointmentsRes, medicalRecordsRes, invoicesRes, summaryRes] = await Promise.all([
    patientPromise,
    appointmentsPromise,
    medicalRecordsPromise,
    invoicesPromise,
    summaryPromise
  ]);

  return {
    patient,
    visits: appointmentsRes.rows,
    medicalRecords: medicalRecordsRes.rows,
    invoices: invoicesRes.rows,
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
    RETURNING id, full_name, age, gender, phone, email, blood_type, emergency_contact,
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
