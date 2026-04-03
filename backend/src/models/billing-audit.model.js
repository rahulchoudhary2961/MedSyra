const pool = require("../config/db");

const createBillingAuditLog = async (dbOrPayload, maybePayload) => {
  const db = maybePayload ? dbOrPayload : pool;
  const payload = maybePayload || dbOrPayload;

  const query = `
    INSERT INTO billing_audit_logs (
      organization_id,
      invoice_id,
      payment_id,
      actor_user_id,
      action,
      before_state,
      after_state,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)
    RETURNING id
  `;

  const values = [
    payload.organizationId,
    payload.invoiceId || null,
    payload.paymentId || null,
    payload.actorUserId || null,
    payload.action,
    JSON.stringify(payload.beforeState ?? null),
    JSON.stringify(payload.afterState ?? null),
    JSON.stringify(payload.metadata ?? {})
  ];

  const result = await db.query(query, values);
  return result.rows[0] || null;
};

module.exports = {
  createBillingAuditLog
};
