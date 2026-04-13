const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const baseDoctorSelect = `
  SELECT d.id, d.organization_id, d.full_name, d.specialty, d.experience_years, d.availability,
         d.phone, d.email, d.user_id,
         u.full_name AS linked_user_full_name,
         u.email AS linked_user_email,
         d.work_start_time::text AS work_start_time,
         d.work_end_time::text AS work_end_time,
         d.break_start_time::text AS break_start_time,
         d.break_end_time::text AS break_end_time,
         d.weekly_off_days, d.holiday_dates, d.consultation_fee,
         d.rating, d.patient_count, d.status, d.created_at, d.updated_at
  FROM doctors d
  LEFT JOIN users u ON u.id = d.user_id
`;

const listDoctors = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["d.organization_id = $1"];

  if (query.q) {
    values.push(`${query.q}%`, `%${query.q}%`);
    const prefixIdx = values.length - 1;
    const containsIdx = values.length;
    conditions.push(
      `(d.full_name ILIKE $${prefixIdx} OR (
        LENGTH($${containsIdx}) > 1 AND (d.specialty ILIKE $${containsIdx} OR d.email ILIKE $${containsIdx} OR d.phone ILIKE $${containsIdx})
      ))`
    );
  }

  if (query.status) {
    values.push(query.status);
    conditions.push(`d.status = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    ${baseDoctorSelect}
    WHERE ${whereClause}
    ORDER BY d.full_name ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countQuery = `SELECT COUNT(*)::int AS total FROM doctors d WHERE ${whereClause}`;
  const [dataResult, countResult] = await Promise.all([
    pool.query(querySql, values),
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

const getDoctorById = async (organizationId, id) => {
  const query = `
    ${baseDoctorSelect}
    WHERE d.organization_id = $1 AND d.id = $2
  `;
  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

const getDoctorByEmail = async (organizationId, email) => {
  const query = `
    ${baseDoctorSelect}
    WHERE d.organization_id = $1 AND LOWER(d.email) = LOWER($2)
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [organizationId, email]);
  return rows[0] || null;
};

const getDoctorByUserId = async (organizationId, userId) => {
  const query = `
    ${baseDoctorSelect}
    WHERE d.organization_id = $1 AND d.user_id = $2
    LIMIT 1
  `;
  const { rows } = await pool.query(query, [organizationId, userId]);
  return rows[0] || null;
};

const createDoctor = async (organizationId, payload) => {
  const query = `
    INSERT INTO doctors (
      organization_id, full_name, specialty, experience_years,
      availability, phone, email, user_id, work_start_time, work_end_time,
      break_start_time, break_end_time, weekly_off_days, holiday_dates, consultation_fee, rating, patient_count, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING id
  `;

  const values = [
    organizationId,
    payload.fullName,
    payload.specialty,
    payload.experienceYears || null,
    payload.availability || null,
    payload.phone || null,
    payload.email || null,
    payload.userId || null,
    payload.workStartTime || null,
    payload.workEndTime || null,
    payload.breakStartTime || null,
    payload.breakEndTime || null,
    payload.weeklyOffDays || null,
    payload.holidayDates || null,
    payload.consultationFee ?? null,
    payload.rating || 0,
    payload.patientCount || 0,
    payload.status || "available"
  ];

  const { rows } = await pool.query(query, values);
  return getDoctorById(organizationId, rows[0].id);
};

const getDoctorUsage = async (organizationId, id) => {
  const query = `
    SELECT
      EXISTS (
        SELECT 1
        FROM appointments
        WHERE organization_id = $1 AND doctor_id = $2
      ) AS has_appointments,
      EXISTS (
        SELECT 1
        FROM medical_records
        WHERE organization_id = $1 AND doctor_id = $2
      ) AS has_medical_records,
      EXISTS (
        SELECT 1
        FROM invoices
        WHERE organization_id = $1 AND doctor_id = $2
      ) AS has_invoices
  `;

  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || {
    has_appointments: false,
    has_medical_records: false,
    has_invoices: false
  };
};

const deleteDoctor = async (organizationId, id) => {
  const query = `
    DELETE FROM doctors
    WHERE organization_id = $1 AND id = $2
    RETURNING id
  `;

  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

module.exports = {
  listDoctors,
  getDoctorById,
  getDoctorByEmail,
  getDoctorByUserId,
  createDoctor,
  getDoctorUsage,
  deleteDoctor
};
