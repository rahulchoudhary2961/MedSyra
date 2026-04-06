const auditModel = require("../models/audit.model");
const { logWarn } = require("../utils/logger");

const buildRequestAuditContext = (requestMeta = {}, actor = null) => ({
  actorUserId: actor?.sub || actor?.id || null,
  actorRole: actor?.role || null,
  ipAddress: requestMeta.ip || null,
  userAgent: requestMeta.userAgent || null,
  path: requestMeta.path || null,
  method: requestMeta.method || null
});

const logAuditEvent = async ({ organizationId, actor = null, requestMeta = null, ...payload }) => {
  if (!organizationId) {
    return null;
  }

  return auditModel.createAuditLog({
    organizationId,
    ...buildRequestAuditContext(requestMeta || {}, actor),
    ...payload
  });
};

const logAuditEventSafe = (payload) =>
  logAuditEvent(payload).catch((error) => {
    logWarn("audit_log_failed", {
      organizationId: payload.organizationId || null,
      module: payload.module || null,
      action: payload.action || null,
      reason: error.message
    });
    return null;
  });

module.exports = {
  buildRequestAuditContext,
  logAuditEvent,
  logAuditEventSafe
};
