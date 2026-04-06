const ApiError = require("../utils/api-error");
const { USER_ROLES } = require("../constants/roles");
const { logAuditEventSafe } = require("../services/audit.service");

const FULL_ACCESS_ROLES = new Set([USER_ROLES.ADMIN, USER_ROLES.MANAGEMENT]);
const RECEPTION_ROLES = new Set([USER_ROLES.RECEPTIONIST, USER_ROLES.NURSE]);
const BILLING_ROLES = new Set([USER_ROLES.BILLING]);

const normalizeAllowedRoles = (allowedRoles) => {
  const expanded = new Set();

  allowedRoles.forEach((role) => {
    if (role === "full_access") {
      FULL_ACCESS_ROLES.forEach((item) => expanded.add(item));
      return;
    }

    if (role === "reception_access") {
      RECEPTION_ROLES.forEach((item) => expanded.add(item));
      return;
    }

    if (role === "billing_access") {
      BILLING_ROLES.forEach((item) => expanded.add(item));
      return;
    }

    expanded.add(role);
  });

  return expanded;
};

const authorizeRoles = (...allowedRoles) => {
  const normalizedRoles = normalizeAllowedRoles(allowedRoles);

  return (req, _res, next) => {
    if (!req.user?.role || !normalizedRoles.has(req.user.role)) {
      logAuditEventSafe({
        organizationId: req.user?.organizationId || null,
        actor: req.user || null,
        requestMeta: {
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
          userAgent: typeof req.get === "function" ? req.get("user-agent") || null : null
        },
        module: typeof req.baseUrl === "string" ? req.baseUrl.split("/").filter(Boolean).pop() || "security" : "security",
        action: "access_denied",
        summary: `Access denied for ${req.method} ${req.originalUrl}`,
        entityType: "route",
        severity: "warning",
        outcome: "denied",
        metadata: {
          allowedRoles: Array.from(normalizedRoles),
          attemptedRole: req.user?.role || null
        }
      });
      return next(new ApiError(403, "You do not have permission to perform this action"));
    }

    return next();
  };
};

module.exports = authorizeRoles;
