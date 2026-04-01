const pool = require("../config/db");

const RANGE_SQL = {
  today: {
    appointments: "a.appointment_date = CURRENT_DATE",
    payments: "p.paid_at::date = CURRENT_DATE",
    followUps: "mr.follow_up_date = CURRENT_DATE",
    records: "mr.record_date = CURRENT_DATE"
  },
  this_week: {
    appointments:
      "a.appointment_date >= DATE_TRUNC('week', CURRENT_DATE::timestamp)::date AND a.appointment_date < (DATE_TRUNC('week', CURRENT_DATE::timestamp) + INTERVAL '7 days')::date",
    payments:
      "p.paid_at >= DATE_TRUNC('week', CURRENT_DATE::timestamp) AND p.paid_at < DATE_TRUNC('week', CURRENT_DATE::timestamp) + INTERVAL '7 days'",
    followUps:
      "mr.follow_up_date >= DATE_TRUNC('week', CURRENT_DATE::timestamp)::date AND mr.follow_up_date < (DATE_TRUNC('week', CURRENT_DATE::timestamp) + INTERVAL '7 days')::date",
    records:
      "mr.record_date >= DATE_TRUNC('week', CURRENT_DATE::timestamp)::date AND mr.record_date < (DATE_TRUNC('week', CURRENT_DATE::timestamp) + INTERVAL '7 days')::date"
  },
  this_month: {
    appointments:
      "a.appointment_date >= DATE_TRUNC('month', CURRENT_DATE::timestamp)::date AND a.appointment_date < (DATE_TRUNC('month', CURRENT_DATE::timestamp) + INTERVAL '1 month')::date",
    payments:
      "p.paid_at >= DATE_TRUNC('month', CURRENT_DATE::timestamp) AND p.paid_at < DATE_TRUNC('month', CURRENT_DATE::timestamp) + INTERVAL '1 month'",
    followUps:
      "mr.follow_up_date >= DATE_TRUNC('month', CURRENT_DATE::timestamp)::date AND mr.follow_up_date < (DATE_TRUNC('month', CURRENT_DATE::timestamp) + INTERVAL '1 month')::date",
    records:
      "mr.record_date >= DATE_TRUNC('month', CURRENT_DATE::timestamp)::date AND mr.record_date < (DATE_TRUNC('month', CURRENT_DATE::timestamp) + INTERVAL '1 month')::date"
  },
  last_30_days: {
    appointments: "a.appointment_date >= CURRENT_DATE - INTERVAL '30 days'",
    payments: "p.paid_at >= NOW() - INTERVAL '30 days'",
    followUps: "mr.follow_up_date >= CURRENT_DATE - INTERVAL '30 days'",
    records: "mr.record_date >= CURRENT_DATE - INTERVAL '30 days'"
  },
  last_90_days: {
    appointments: "a.appointment_date >= CURRENT_DATE - INTERVAL '90 days'",
    payments: "p.paid_at >= NOW() - INTERVAL '90 days'",
    followUps: "mr.follow_up_date >= CURRENT_DATE - INTERVAL '90 days'",
    records: "mr.record_date >= CURRENT_DATE - INTERVAL '90 days'"
  },
  last_12_months: {
    appointments: "a.appointment_date >= CURRENT_DATE - INTERVAL '12 months'",
    payments: "p.paid_at >= NOW() - INTERVAL '12 months'",
    followUps: "mr.follow_up_date >= CURRENT_DATE - INTERVAL '12 months'",
    records: "mr.record_date >= CURRENT_DATE - INTERVAL '12 months'"
  }
};

const getRangeSql = (range, domain) => RANGE_SQL[range]?.[domain] || RANGE_SQL.this_month[domain];

const getRevenueMetric = async (organizationId, { range = "this_month" } = {}) => {
  const rangeSql = getRangeSql(range, "payments");
  const query = `
    SELECT COALESCE(SUM(p.amount), 0)::numeric(12,2) AS revenue
    FROM payments p
    WHERE p.organization_id = $1
      AND p.status = 'completed'
      AND ${rangeSql}
  `;

  const { rows } = await pool.query(query, [organizationId]);
  return {
    range,
    revenue: Number(rows[0]?.revenue || 0)
  };
};

const getAppointmentsMetric = async (organizationId, { range = "today", status = null, patientId = null } = {}) => {
  const values = [organizationId];
  const conditions = ["a.organization_id = $1", getRangeSql(range, "appointments")];

  if (status) {
    values.push(status);
    conditions.push(`a.status = $${values.length}`);
  }

  if (patientId) {
    values.push(patientId);
    conditions.push(`a.patient_id = $${values.length}`);
  }

  const query = `
    SELECT COUNT(*)::int AS total
    FROM appointments a
    WHERE ${conditions.join(" AND ")}
  `;

  const { rows } = await pool.query(query, values);
  return {
    range,
    status,
    total: Number(rows[0]?.total || 0)
  };
};

const getFollowUpsMetric = async (organizationId, { range = "today", patientId = null } = {}) => {
  const values = [organizationId];
  const conditions = ["mr.organization_id = $1", "mr.follow_up_date IS NOT NULL", getRangeSql(range, "followUps")];

  if (patientId) {
    values.push(patientId);
    conditions.push(`mr.patient_id = $${values.length}`);
  }

  const query = `
    SELECT COUNT(*)::int AS total, MIN(mr.follow_up_date)::text AS nearest_due_date
    FROM medical_records mr
    WHERE ${conditions.join(" AND ")}
  `;

  const { rows } = await pool.query(query, values);
  return {
    range,
    total: Number(rows[0]?.total || 0),
    nearestDueDate: rows[0]?.nearest_due_date || null
  };
};

const getMostCommonIssueMetric = async (organizationId, { range = "last_30_days", patientId = null } = {}) => {
  const values = [organizationId];
  const conditions = [
    "mr.organization_id = $1",
    "mr.diagnosis IS NOT NULL",
    "BTRIM(mr.diagnosis) <> ''",
    getRangeSql(range, "records")
  ];

  if (patientId) {
    values.push(patientId);
    conditions.push(`mr.patient_id = $${values.length}`);
  }

  const query = `
    SELECT MIN(TRIM(mr.diagnosis)) AS label, COUNT(*)::int AS total
    FROM medical_records mr
    WHERE ${conditions.join(" AND ")}
    GROUP BY LOWER(TRIM(mr.diagnosis))
    ORDER BY total DESC, MIN(TRIM(mr.diagnosis)) ASC
    LIMIT 1
  `;

  const { rows } = await pool.query(query, values);
  return {
    range,
    label: rows[0]?.label || "-",
    total: Number(rows[0]?.total || 0)
  };
};

const getOutstandingInvoicesMetric = async (organizationId, { patientId = null } = {}) => {
  const values = [organizationId];
  const conditions = [
    "i.organization_id = $1",
    "i.balance_amount > 0",
    "i.status IN ('issued', 'partially_paid', 'overdue')"
  ];

  if (patientId) {
    values.push(patientId);
    conditions.push(`i.patient_id = $${values.length}`);
  }

  const query = `
    SELECT
      COUNT(*)::int AS total,
      COALESCE(SUM(i.balance_amount), 0)::numeric(12,2) AS balance_amount
    FROM invoices i
    WHERE ${conditions.join(" AND ")}
  `;

  const { rows } = await pool.query(query, values);
  return {
    total: Number(rows[0]?.total || 0),
    balanceAmount: Number(rows[0]?.balance_amount || 0)
  };
};

module.exports = {
  getRevenueMetric,
  getAppointmentsMetric,
  getFollowUpsMetric,
  getMostCommonIssueMetric,
  getOutstandingInvoicesMetric
};
