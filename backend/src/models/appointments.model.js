const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const listAppointments = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const values = [organizationId];
  const dataConditions = ["a.organization_id = $1"];
  const countConditions = ["organization_id = $1"];

  if (query.date) {
    values.push(query.date);
    dataConditions.push(`a.appointment_date = $${values.length}`);
    countConditions.push(`appointment_date = $${values.length}`);
  } else {
    if (query.year) {
      values.push(Number(query.year));
      dataConditions.push(`EXTRACT(YEAR FROM a.appointment_date) = $${values.length}`);
      countConditions.push(`EXTRACT(YEAR FROM appointment_date) = $${values.length}`);
    }

    if (query.month) {
      values.push(Number(query.month));
      dataConditions.push(`EXTRACT(MONTH FROM a.appointment_date) = $${values.length}`);
      countConditions.push(`EXTRACT(MONTH FROM appointment_date) = $${values.length}`);
    }

    if (query.day) {
      values.push(Number(query.day));
      dataConditions.push(`EXTRACT(DAY FROM a.appointment_date) = $${values.length}`);
      countConditions.push(`EXTRACT(DAY FROM appointment_date) = $${values.length}`);
    }
  }

  if (query.patientId) {
    values.push(query.patientId);
    dataConditions.push(`a.patient_id = $${values.length}`);
    countConditions.push(`patient_id = $${values.length}`);
  }

  if (query.doctorId) {
    values.push(query.doctorId);
    dataConditions.push(`a.doctor_id = $${values.length}`);
    countConditions.push(`doctor_id = $${values.length}`);
  }

  values.push(limit, offset);
  const dataWhereClause = dataConditions.join(" AND ");
  const countWhereClause = countConditions.join(" AND ");

  const dataQuery = `
    SELECT
      a.id,
      a.title,
      a.patient_id,
      a.patient_name,
      COALESCE(a.patient_id::text, a.patient_identifier) AS patient_identifier,
      a.mobile_number,
      a.email,
      a.doctor_id,
      d.full_name AS doctor_name,
      a.category,
      a.status,
      inv.id AS invoice_id,
      inv.status AS invoice_status,
      a.appointment_date::text AS appointment_date,
      a.appointment_time,
      a.duration_minutes,
      a.planned_procedures,
      a.notes,
      a.created_at,
      a.updated_at
    FROM appointments a
    LEFT JOIN doctors d
      ON d.id = a.doctor_id
     AND d.organization_id = a.organization_id
    LEFT JOIN invoices inv
      ON inv.appointment_id = a.id
     AND inv.organization_id = a.organization_id
    WHERE ${dataWhereClause}
    ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.created_at ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM appointments
    WHERE ${countWhereClause}
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, values),
    pool.query(countQuery, values.slice(0, values.length - 2))
  ]);

  return {
    items: dataResult.rows,
    pagination: {
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / limit) || 1
    }
  };
};

const createAppointment = async (organizationId, payload) => {
  const query = `
    INSERT INTO appointments (
      organization_id,
      title,
      patient_id,
      patient_name,
      patient_identifier,
      mobile_number,
      email,
      doctor_id,
      category,
      status,
      appointment_date,
      appointment_time,
      duration_minutes,
      planned_procedures,
      notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING
      id,
      title,
      patient_id,
      patient_name,
      COALESCE(patient_id::text, patient_identifier) AS patient_identifier,
      mobile_number,
      email,
      doctor_id,
      category,
      status,
      appointment_date::text AS appointment_date,
      appointment_time,
      duration_minutes,
      planned_procedures,
      notes,
      created_at,
      updated_at
  `;

  const values = [
    organizationId,
    payload.patientName,
    payload.patientId,
    payload.patientName,
    payload.patientId,
    payload.mobileNumber || null,
    payload.email || null,
    payload.doctorId || null,
    payload.category,
    payload.status || "pending",
    payload.appointmentDate,
    payload.appointmentTime,
    payload.durationMinutes,
    payload.plannedProcedures || null,
    payload.notes || null
  ];

  const { rows } = await pool.query(query, values);
  return getAppointmentById(organizationId, rows[0].id);
};

const getAppointmentById = async (organizationId, id) => {
  const query = `
    SELECT
      a.id,
      a.title,
      a.patient_id,
      a.patient_name,
      COALESCE(a.patient_id::text, a.patient_identifier) AS patient_identifier,
      a.mobile_number,
      a.email,
      a.doctor_id,
      d.full_name AS doctor_name,
      a.category,
      a.status,
      inv.id AS invoice_id,
      inv.status AS invoice_status,
      a.appointment_date::text AS appointment_date,
      a.appointment_time,
      a.duration_minutes,
      a.planned_procedures,
      a.notes,
      a.created_at,
      a.updated_at
    FROM appointments a
    LEFT JOIN doctors d
      ON d.id = a.doctor_id
     AND d.organization_id = a.organization_id
    LEFT JOIN invoices inv
      ON inv.appointment_id = a.id
     AND inv.organization_id = a.organization_id
    WHERE a.organization_id = $1 AND a.id = $2
  `;
  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

const findDoctorConflicts = async (organizationId, payload, excludeId = null) => {
  const query = `
    SELECT id
    FROM appointments
    WHERE organization_id = $1
      AND doctor_id = $2
      AND appointment_date = $3
      AND status <> 'cancelled'
      AND ($4::uuid IS NULL OR id <> $4::uuid)
      AND (
        (appointment_time, appointment_time + make_interval(mins => duration_minutes))
          OVERLAPS
        ($5::time, $5::time + make_interval(mins => $6::int))
      )
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [
    organizationId,
    payload.doctorId,
    payload.appointmentDate,
    excludeId,
    payload.appointmentTime,
    payload.durationMinutes
  ]);
  return rows[0] || null;
};

const updateAppointment = async (organizationId, id, payload) => {
  const query = `
    UPDATE appointments
    SET
      title = $3,
      patient_id = $4,
      patient_name = $5,
      patient_identifier = $6,
      mobile_number = $7,
      email = $8,
      doctor_id = $9,
      category = $10,
      status = $11,
      appointment_date = $12,
      appointment_time = $13,
      duration_minutes = $14,
      planned_procedures = $15,
      notes = $16,
      updated_at = NOW()
    WHERE organization_id = $1 AND id = $2
    RETURNING
      id,
      title,
      patient_id,
      patient_name,
      COALESCE(patient_id::text, patient_identifier) AS patient_identifier,
      mobile_number,
      email,
      doctor_id,
      category,
      status,
      appointment_date::text AS appointment_date,
      appointment_time,
      duration_minutes,
      planned_procedures,
      notes,
      created_at,
      updated_at
  `;

  const values = [
    organizationId,
    id,
    payload.patientName,
    payload.patientId,
    payload.patientName,
    payload.patientId,
    payload.mobileNumber || null,
    payload.email || null,
    payload.doctorId || null,
    payload.category,
    payload.status || "pending",
    payload.appointmentDate,
    payload.appointmentTime,
    payload.durationMinutes,
    payload.plannedProcedures || null,
    payload.notes || null
  ];

  const { rows } = await pool.query(query, values);
  if (!rows[0]) {
    return null;
  }

  return getAppointmentById(organizationId, rows[0].id);
};

const deleteAppointment = async (organizationId, id) => {
  const query = `
    DELETE FROM appointments
    WHERE organization_id = $1 AND id = $2
    RETURNING id
  `;
  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

const bulkCancelAppointments = async (organizationId, payload) => {
  const values = [organizationId, payload.appointmentDate];
  let doctorClause = "";

  if (payload.doctorId) {
    values.push(payload.doctorId);
    doctorClause = ` AND doctor_id = $${values.length}`;
  }

  const query = `
    UPDATE appointments
    SET status = 'cancelled', updated_at = NOW()
    WHERE organization_id = $1
      AND appointment_date = $2
      AND status NOT IN ('cancelled', 'completed', 'no-show')
      ${doctorClause}
    RETURNING id
  `;
  const { rows } = await pool.query(query, values);
  return rows.length;
};

module.exports = {
  listAppointments,
  createAppointment,
  getAppointmentById,
  findDoctorConflicts,
  updateAppointment,
  deleteAppointment,
  bulkCancelAppointments
};
