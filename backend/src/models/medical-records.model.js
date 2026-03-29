const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const listMedicalRecords = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["mr.organization_id = $1"];

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(p.full_name ILIKE $${idx} OR mr.record_type ILIKE $${idx})`);
  }

  if (query.status) {
    values.push(query.status);
    conditions.push(`mr.status = $${values.length}`);
  }

  if (query.patientId) {
    values.push(query.patientId);
    conditions.push(`mr.patient_id = $${values.length}`);
  }

  if (query.doctorId) {
    values.push(query.doctorId);
    conditions.push(`mr.doctor_id = $${values.length}`);
  }

  if (query.appointmentId) {
    values.push(query.appointmentId);
    conditions.push(`mr.appointment_id = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    SELECT
      mr.id,
      mr.appointment_id,
      mr.patient_id,
      p.full_name AS patient_name,
      mr.doctor_id,
      d.full_name AS doctor_name,
      mr.record_type,
      mr.status,
      mr.record_date,
      mr.symptoms,
      mr.diagnosis,
      mr.prescription,
      mr.notes,
      mr.file_url,
      mr.created_at,
      mr.updated_at
    FROM medical_records mr
    LEFT JOIN patients p ON p.id = mr.patient_id AND p.organization_id = mr.organization_id
    LEFT JOIN doctors d ON d.id = mr.doctor_id AND d.organization_id = mr.organization_id
    WHERE ${whereClause}
    ORDER BY mr.record_date DESC, mr.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM medical_records mr
    LEFT JOIN patients p ON p.id = mr.patient_id AND p.organization_id = mr.organization_id
    WHERE ${whereClause}
  `;

  const [result, countResult] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: result.rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / limit) || 1
    }
  };
};

const createMedicalRecord = async (organizationId, payload) => {
  const query = `
    INSERT INTO medical_records (
      organization_id, patient_id, doctor_id, record_type,
      appointment_id, status, record_date, symptoms, diagnosis, prescription, notes, file_url
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id, appointment_id, patient_id, doctor_id, record_type, status,
              record_date, symptoms, diagnosis, prescription, notes, file_url, created_at, updated_at
  `;

  const values = [
    organizationId,
    payload.patientId,
    payload.doctorId,
    payload.recordType,
    payload.appointmentId || null,
    payload.status || "completed",
    payload.recordDate,
    payload.symptoms || null,
    payload.diagnosis || null,
    payload.prescription || null,
    payload.notes || null,
    payload.fileUrl || null
  ];

  const { rows } = await pool.query(query, values);
  return getMedicalRecordById(organizationId, rows[0].id);
};

const getMedicalRecordById = async (organizationId, id) => {
  const query = `
    SELECT
      mr.id,
      mr.appointment_id,
      mr.patient_id,
      p.full_name AS patient_name,
      mr.doctor_id,
      d.full_name AS doctor_name,
      mr.record_type,
      mr.status,
      mr.record_date,
      mr.symptoms,
      mr.diagnosis,
      mr.prescription,
      mr.notes,
      mr.file_url,
      mr.created_at,
      mr.updated_at
    FROM medical_records mr
    LEFT JOIN patients p ON p.id = mr.patient_id AND p.organization_id = mr.organization_id
    LEFT JOIN doctors d ON d.id = mr.doctor_id AND d.organization_id = mr.organization_id
    WHERE mr.organization_id = $1 AND mr.id = $2
  `;

  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

const getMedicalRecordByAppointmentId = async (organizationId, appointmentId) => {
  const query = `
    SELECT id
    FROM medical_records
    WHERE organization_id = $1 AND appointment_id = $2
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [organizationId, appointmentId]);
  if (!rows[0]) {
    return null;
  }

  return getMedicalRecordById(organizationId, rows[0].id);
};

const updateMedicalRecord = async (organizationId, id, payload) => {
  const columnMap = {
    patientId: "patient_id",
    doctorId: "doctor_id",
    recordType: "record_type",
    appointmentId: "appointment_id",
    status: "status",
    recordDate: "record_date",
    symptoms: "symptoms",
    diagnosis: "diagnosis",
    prescription: "prescription",
    notes: "notes",
    fileUrl: "file_url"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getMedicalRecordById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const query = `
    UPDATE medical_records
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE organization_id = $1 AND id = $2
    RETURNING id, appointment_id, patient_id, doctor_id, record_type, status, record_date,
              symptoms, diagnosis, prescription, notes, file_url, created_at, updated_at
  `;

  const { rows } = await pool.query(query, values);
  if (!rows[0]) {
    return null;
  }

  return getMedicalRecordById(organizationId, rows[0].id);
};

const deleteMedicalRecord = async (organizationId, id) => {
  const query = `
    DELETE FROM medical_records
    WHERE organization_id = $1 AND id = $2
    RETURNING id
  `;
  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

module.exports = {
  listMedicalRecords,
  createMedicalRecord,
  getMedicalRecordById,
  getMedicalRecordByAppointmentId,
  updateMedicalRecord,
  deleteMedicalRecord
};
