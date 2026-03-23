const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const listAppointments = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["a.organization_id = $1"];

  if (query.date) {
    values.push(query.date);
    conditions.push(`a.appointment_date = $${values.length}`);
  }

  if (query.startDate) {
    values.push(query.startDate);
    conditions.push(`a.appointment_date >= $${values.length}`);
  }

  if (query.endDate) {
    values.push(query.endDate);
    conditions.push(`a.appointment_date <= $${values.length}`);
  }

  if (query.doctorId) {
    values.push(query.doctorId);
    conditions.push(`a.doctor_id = $${values.length}`);
  }

  if (query.status) {
    values.push(query.status);
    conditions.push(`a.status = $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(p.full_name ILIKE $${idx} OR p.phone ILIKE $${idx})`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");
  const orderDirection = query.order && query.order.toLowerCase() === "asc" ? "ASC" : "DESC";

  const querySql = `
    SELECT
      a.id,
      a.patient_id,
      p.full_name AS patient_name,
      a.doctor_id,
      d.full_name AS doctor_name,
      a.appointment_date,
      a.appointment_time,
      a.appointment_type,
      a.status,
      a.notes,
      a.fee_amount,
      a.created_at,
      a.updated_at
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id AND p.organization_id = a.organization_id
    LEFT JOIN doctors d ON d.id = a.doctor_id AND d.organization_id = a.organization_id
    WHERE ${whereClause}
    ORDER BY a.appointment_date ${orderDirection}, a.appointment_time ${orderDirection}
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id AND p.organization_id = a.organization_id
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

const getAppointmentById = async (organizationId, id) => {
  const query = `
    SELECT
      a.id,
      a.patient_id,
      p.full_name AS patient_name,
      a.doctor_id,
      d.full_name AS doctor_name,
      a.appointment_date,
      a.appointment_time,
      a.appointment_type,
      a.status,
      a.notes,
      a.fee_amount,
      a.created_at,
      a.updated_at
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id AND p.organization_id = a.organization_id
    LEFT JOIN doctors d ON d.id = a.doctor_id AND d.organization_id = a.organization_id
    WHERE a.organization_id = $1 AND a.id = $2
  `;

  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

const findDoctorSlotConflict = async (organizationId, { doctorId, appointmentDate, appointmentTime, excludeId = null }) => {
  const values = [organizationId, doctorId, appointmentDate, appointmentTime];
  let excludeClause = "";

  if (excludeId) {
    values.push(excludeId);
    excludeClause = `AND id <> $${values.length}`;
  }

  const query = `
    SELECT id
    FROM appointments
    WHERE organization_id = $1
      AND doctor_id = $2
      AND appointment_date = $3
      AND appointment_time = $4
      AND status IN ('pending', 'confirmed')
      ${excludeClause}
    LIMIT 1
  `;

  const { rows } = await pool.query(query, values);
  return rows[0] || null;
};

const createAppointment = async (organizationId, payload) => {
  const query = `
    INSERT INTO appointments (
      organization_id, patient_id, doctor_id, appointment_date,
      appointment_time, appointment_type, status, notes, fee_amount
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id, patient_id, doctor_id, appointment_date, appointment_time,
              appointment_type, status, notes, fee_amount, created_at, updated_at
  `;

  const values = [
    organizationId,
    payload.patientId,
    payload.doctorId,
    payload.appointmentDate,
    payload.appointmentTime,
    payload.appointmentType,
    payload.status || "pending",
    payload.notes || null,
    payload.feeAmount || 0
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
};

const updateAppointment = async (organizationId, id, payload) => {
  const columnMap = {
    patientId: "patient_id",
    doctorId: "doctor_id",
    appointmentDate: "appointment_date",
    appointmentTime: "appointment_time",
    appointmentType: "appointment_type",
    status: "status",
    notes: "notes",
    feeAmount: "fee_amount"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getAppointmentById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const query = `
    UPDATE appointments
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE organization_id = $1 AND id = $2
    RETURNING id, patient_id, doctor_id, appointment_date, appointment_time,
              appointment_type, status, notes, fee_amount, created_at, updated_at
  `;

  const { rows } = await pool.query(query, values);
  return rows[0] || null;
};

const updateAppointmentStatus = async (organizationId, id, status) => {
  const query = `
    UPDATE appointments
    SET status = $3, updated_at = NOW()
    WHERE organization_id = $1 AND id = $2
    RETURNING id, patient_id, doctor_id, appointment_date, appointment_time,
              appointment_type, status, notes, fee_amount, created_at, updated_at
  `;
  const { rows } = await pool.query(query, [organizationId, id, status]);
  return rows[0] || null;
};

const cancelAppointment = async (organizationId, id) => {
  const query = `
    UPDATE appointments
    SET status = 'cancelled', updated_at = NOW()
    WHERE organization_id = $1 AND id = $2
    RETURNING id, patient_id, doctor_id, appointment_date, appointment_time,
              appointment_type, status, notes, fee_amount, created_at, updated_at
  `;

  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

module.exports = {
  listAppointments,
  getAppointmentById,
  findDoctorSlotConflict,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment
};
