const pool = require("../config/db");
const auditModel = require("./audit.model");

const createBillingAuditLog = async (dbOrPayload, maybePayload) => {
  const db = maybePayload ? dbOrPayload : pool;
  const payload = maybePayload || dbOrPayload;

  const query = `
    INSERT INTO billing_audit_logs (
      organization_id,
      branch_id,
      invoice_id,
      payment_id,
      actor_user_id,
      action,
      before_state,
      after_state,
      metadata
    )
    VALUES ($1,COALESCE($2,(SELECT id FROM branches WHERE organization_id = $1 AND is_default = true LIMIT 1)),$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)
    RETURNING id
  `;

  const values = [
    payload.organizationId,
    payload.branchId || null,
    payload.invoiceId || null,
    payload.paymentId || null,
    payload.actorUserId || null,
    payload.action,
    JSON.stringify(payload.beforeState ?? null),
    JSON.stringify(payload.afterState ?? null),
    JSON.stringify(payload.metadata ?? {})
  ];

  const result = await db.query(query, values);

  try {
    await auditModel.createAuditLog(db, {
      organizationId: payload.organizationId,
      branchId: payload.branchId || null,
      actorUserId: payload.actorUserId || null,
      module: "billing",
      action: payload.action,
      summary: `Billing ${String(payload.action || "").replace(/_/g, " ")}`,
      entityType: payload.paymentId ? "payment" : "invoice",
      entityId: payload.paymentId || payload.invoiceId || null,
      entityLabel: payload.metadata?.invoiceNumber || payload.metadata?.paymentReference || null,
      severity: payload.action === "invoice_deleted" ? "warning" : "info",
      outcome: "success",
      isDestructive: payload.action === "invoice_deleted",
      metadata: {
        invoiceId: payload.invoiceId || null,
        paymentId: payload.paymentId || null,
        ...payload.metadata
      },
      beforeState: payload.beforeState ?? null,
      afterState: payload.afterState ?? null
    });
  } catch (_error) {
    // Keep billing transactions resilient even if the generic audit table is unavailable.
  }

  return result.rows[0] || null;
};

module.exports = {
  createBillingAuditLog
};
