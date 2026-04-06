const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const SENSITIVE_KEYS = [
  "password",
  "password_hash",
  "passwordhash",
  "token",
  "secret",
  "authorization",
  "cookie"
];

const maskSensitive = (value, key = "") => {
  if (value === null || value === undefined) {
    return value;
  }

  const loweredKey = key.toLowerCase();
  if (SENSITIVE_KEYS.some((sensitiveKey) => loweredKey.includes(sensitiveKey))) {
    return "[REDACTED]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitive(item));
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [nestedKey, nestedValue]) => {
      acc[nestedKey] = maskSensitive(nestedValue, nestedKey);
      return acc;
    }, {});
  }

  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}...[truncated]`;
  }

  return value;
};

const toJson = (value) => JSON.stringify(maskSensitive(value));

const humanize = (value) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const buildSummary = (payload) => {
  if (payload.summary) {
    return payload.summary;
  }

  const moduleLabel = humanize(payload.module);
  const actionLabel = humanize(payload.action);
  const entityLabel = payload.entityLabel ? `: ${payload.entityLabel}` : "";
  return `${moduleLabel} ${actionLabel}${entityLabel}`.trim();
};

const createAuditLog = async (dbOrPayload, maybePayload) => {
  const db = maybePayload ? dbOrPayload : pool;
  const payload = maybePayload || dbOrPayload;

  if (!payload?.organizationId) {
    return null;
  }

  const summary = buildSummary(payload);
  const query = `
    INSERT INTO audit_logs (
      organization_id,
      branch_id,
      actor_user_id,
      actor_role,
      module,
      action,
      summary,
      entity_type,
      entity_id,
      entity_label,
      severity,
      outcome,
      is_destructive,
      ip_address,
      user_agent,
      path,
      method,
      metadata,
      before_state,
      after_state
    )
    VALUES ($1,COALESCE($2,(SELECT id FROM branches WHERE organization_id = $1 AND is_default = true LIMIT 1)),$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20::jsonb)
    RETURNING id, created_at
  `;

  const values = [
    payload.organizationId,
    payload.branchId || null,
    payload.actorUserId || null,
    payload.actorRole || null,
    payload.module,
    payload.action,
    summary,
    payload.entityType,
    payload.entityId || null,
    payload.entityLabel || null,
    payload.severity || "info",
    payload.outcome || "success",
    payload.isDestructive === true,
    payload.ipAddress || null,
    payload.userAgent || null,
    payload.path || null,
    payload.method || null,
    toJson(payload.metadata ?? {}),
    toJson(payload.beforeState ?? null),
    toJson(payload.afterState ?? null)
  ];

  const result = await db.query(query, values);

  await db.query(
    `
    INSERT INTO activity_logs (
      organization_id,
      branch_id,
      event_type,
      title,
      entity_name,
      event_time
    )
    VALUES ($1,COALESCE($2,(SELECT id FROM branches WHERE organization_id = $1 AND is_default = true LIMIT 1)),$3,$4,$5,COALESCE($6, NOW()))
    `,
    [
      payload.organizationId,
      payload.branchId || null,
      `${payload.module}.${payload.action}`,
      summary,
      payload.entityLabel || null,
      result.rows[0]?.created_at || null
    ]
  );

  return result.rows[0] || null;
};

const listAuditLogs = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["al.organization_id = $1"];

  if (query.module) {
    values.push(query.module);
    conditions.push(`al.module = $${values.length}`);
  }

  if (query.outcome) {
    values.push(query.outcome);
    conditions.push(`al.outcome = $${values.length}`);
  }

  if (query.actorUserId) {
    values.push(query.actorUserId);
    conditions.push(`al.actor_user_id = $${values.length}`);
  }

  if (query.entityType) {
    values.push(query.entityType);
    conditions.push(`al.entity_type = $${values.length}`);
  }

  if (query.isDestructive === "true" || query.isDestructive === true) {
    conditions.push("al.is_destructive = true");
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const dataQuery = `
    SELECT
      al.id,
      al.actor_user_id,
      u.full_name AS actor_name,
      al.actor_role,
      al.module,
      al.action,
      al.summary,
      al.entity_type,
      al.entity_id,
      al.entity_label,
      al.severity,
      al.outcome,
      al.is_destructive,
      al.ip_address,
      al.user_agent,
      al.path,
      al.method,
      al.metadata,
      al.before_state,
      al.after_state,
      al.created_at
    FROM audit_logs al
    LEFT JOIN users u
      ON u.id = al.actor_user_id
    WHERE ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM audit_logs al
    WHERE ${whereClause}
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
      total: countResult.rows[0]?.total || 0,
      totalPages: Math.ceil((countResult.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const getSecurityOverview = async (organizationId, windowDays = 30) => {
  const values = [organizationId, windowDays];
  const [summary, moduleBreakdown, recentDestructive, userAccess] = await Promise.all([
    pool.query(
      `
      WITH scoped_logs AS (
        SELECT *
        FROM audit_logs
        WHERE organization_id = $1
          AND created_at >= NOW() - ($2::text || ' days')::interval
      )
      SELECT
        (SELECT COUNT(*)::int FROM scoped_logs) AS total_events,
        (SELECT COUNT(*)::int FROM scoped_logs WHERE is_destructive = true) AS destructive_actions,
        (SELECT COUNT(*)::int FROM scoped_logs WHERE outcome = 'denied') AS denied_actions,
        (SELECT COUNT(*)::int FROM scoped_logs WHERE severity = 'critical') AS critical_events,
        (SELECT COUNT(*)::int FROM users WHERE organization_id = $1 AND locked_until IS NOT NULL AND locked_until > NOW()) AS locked_accounts,
        (SELECT COUNT(*)::int FROM users WHERE organization_id = $1 AND last_login_at IS NOT NULL AND last_login_at >= NOW() - INTERVAL '7 days') AS active_accounts_7d
      `,
      values
    ),
    pool.query(
      `
      SELECT
        module,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_destructive = true)::int AS destructive_count,
        COUNT(*) FILTER (WHERE outcome = 'denied')::int AS denied_count
      FROM audit_logs
      WHERE organization_id = $1
        AND created_at >= NOW() - ($2::text || ' days')::interval
      GROUP BY module
      ORDER BY total DESC, module ASC
      LIMIT 8
      `,
      values
    ),
    pool.query(
      `
      SELECT
        al.id,
        al.summary,
        al.module,
        al.action,
        al.entity_type,
        al.entity_id,
        al.entity_label,
        al.severity,
        al.outcome,
        al.created_at,
        al.actor_role,
        u.full_name AS actor_name
      FROM audit_logs al
      LEFT JOIN users u
        ON u.id = al.actor_user_id
      WHERE al.organization_id = $1
        AND al.is_destructive = true
      ORDER BY al.created_at DESC
      LIMIT 10
      `,
      [organizationId]
    ),
    pool.query(
      `
      SELECT
        role,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE email_verified_at IS NOT NULL)::int AS verified_total,
        COUNT(*) FILTER (WHERE last_login_at IS NOT NULL)::int AS logged_in_total,
        COUNT(*) FILTER (WHERE locked_until IS NOT NULL AND locked_until > NOW())::int AS locked_total,
        MAX(last_login_at) AS latest_login_at
      FROM users
      WHERE organization_id = $1
      GROUP BY role
      ORDER BY total DESC, role ASC
      `,
      [organizationId]
    )
  ]);

  return {
    summary: {
      windowDays,
      totalEvents: Number(summary.rows[0]?.total_events || 0),
      destructiveActions: Number(summary.rows[0]?.destructive_actions || 0),
      deniedActions: Number(summary.rows[0]?.denied_actions || 0),
      criticalEvents: Number(summary.rows[0]?.critical_events || 0),
      lockedAccounts: Number(summary.rows[0]?.locked_accounts || 0),
      activeAccounts7d: Number(summary.rows[0]?.active_accounts_7d || 0)
    },
    moduleBreakdown: moduleBreakdown.rows.map((row) => ({
      module: row.module,
      total: Number(row.total || 0),
      destructiveCount: Number(row.destructive_count || 0),
      deniedCount: Number(row.denied_count || 0)
    })),
    recentDestructive: recentDestructive.rows,
    userAccess: userAccess.rows.map((row) => ({
      role: row.role,
      total: Number(row.total || 0),
      verifiedTotal: Number(row.verified_total || 0),
      loggedInTotal: Number(row.logged_in_total || 0),
      lockedTotal: Number(row.locked_total || 0),
      latestLoginAt: row.latest_login_at || null
    }))
  };
};

module.exports = {
  createAuditLog,
  listAuditLogs,
  getSecurityOverview
};
