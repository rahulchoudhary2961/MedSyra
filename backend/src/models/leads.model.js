const pool = require("../config/db");

const mapLead = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    activation_type: row.activation_type,
    status: row.status,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    clinic_name: row.clinic_name,
    city: row.city,
    message: row.message,
    requested_plan_tier: row.requested_plan_tier,
    demo_date: row.demo_date,
    demo_time: row.demo_time,
    demo_timezone: row.demo_timezone,
    next_follow_up_at: row.next_follow_up_at,
    auto_follow_up_sent_at: row.auto_follow_up_sent_at,
    last_contacted_at: row.last_contacted_at,
    organization_id: row.organization_id,
    user_id: row.user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

const createLead = async (payload) => {
  const query = `
    INSERT INTO sales_leads (
      activation_type, status, full_name, email, phone, clinic_name, city, message,
      requested_plan_tier, demo_date, demo_time, demo_timezone, next_follow_up_at,
      organization_id, user_id
    )
    VALUES ($1, $2, $3, LOWER($4), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `;

  const values = [
    payload.activationType,
    payload.status,
    payload.fullName,
    payload.email,
    payload.phone,
    payload.clinicName,
    payload.city || null,
    payload.message || null,
    payload.requestedPlanTier || null,
    payload.demoDate || null,
    payload.demoTime || null,
    payload.demoTimezone || null,
    payload.nextFollowUpAt || null,
    payload.organizationId || null,
    payload.userId || null
  ];

  const { rows } = await pool.query(query, values);
  return mapLead(rows[0]);
};

const updateLead = async (id, payload) => {
  const entries = Object.entries({
    status: payload.status,
    next_follow_up_at: payload.nextFollowUpAt,
    auto_follow_up_sent_at: payload.autoFollowUpSentAt,
    last_contacted_at: payload.lastContactedAt,
    organization_id: payload.organizationId,
    user_id: payload.userId
  }).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    return getLeadById(id);
  }

  const assignments = entries.map(([field], index) => `${field} = $${index + 2}`);
  const values = [id, ...entries.map(([, value]) => value)];
  const query = `
    UPDATE sales_leads
    SET ${assignments.join(", ")},
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const { rows } = await pool.query(query, values);
  return mapLead(rows[0]);
};

const getLeadById = async (id) => {
  const { rows } = await pool.query("SELECT * FROM sales_leads WHERE id = $1", [id]);
  return mapLead(rows[0]);
};

const listDueLeadFollowUps = async (limit = 100) => {
  const query = `
    SELECT *
    FROM sales_leads
    WHERE next_follow_up_at IS NOT NULL
      AND next_follow_up_at <= NOW()
      AND auto_follow_up_sent_at IS NULL
      AND status IN ('demo_requested', 'demo_scheduled', 'trial_requested', 'trial_provisioned', 'follow_up_due')
    ORDER BY next_follow_up_at ASC
    LIMIT $1
  `;

  const { rows } = await pool.query(query, [limit]);
  return rows.map(mapLead);
};

module.exports = {
  createLead,
  updateLead,
  getLeadById,
  listDueLeadFollowUps
};
