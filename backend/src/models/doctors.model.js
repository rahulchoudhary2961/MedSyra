const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const listDoctors = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["organization_id = $1"];

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(full_name ILIKE $${idx} OR specialty ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`);
  }

  if (query.status) {
    values.push(query.status);
    conditions.push(`status = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const querySql = `
    SELECT id, full_name, specialty, experience_years, availability, phone, email,
           rating, patient_count, status, created_at, updated_at
    FROM doctors
    WHERE ${whereClause}
    ORDER BY full_name ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countQuery = `SELECT COUNT(*)::int AS total FROM doctors WHERE ${whereClause}`;
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
    SELECT id, organization_id, full_name, specialty, experience_years, availability,
           phone, email, rating, patient_count, status, created_at, updated_at
    FROM doctors
    WHERE organization_id = $1 AND id = $2
  `;
  const { rows } = await pool.query(query, [organizationId, id]);
  return rows[0] || null;
};

const createDoctor = async (organizationId, payload) => {
  const query = `
    INSERT INTO doctors (
      organization_id, full_name, specialty, experience_years,
      availability, phone, email, rating, patient_count, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id, full_name, specialty, experience_years, availability, phone,
              email, rating, patient_count, status, created_at, updated_at
  `;

  const values = [
    organizationId,
    payload.fullName,
    payload.specialty,
    payload.experienceYears || null,
    payload.availability || null,
    payload.phone || null,
    payload.email || null,
    payload.rating || 0,
    payload.patientCount || 0,
    payload.status || "available"
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
};

module.exports = {
  listDoctors,
  getDoctorById,
  createDoctor
};
