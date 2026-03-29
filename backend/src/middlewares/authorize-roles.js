const ApiError = require("../utils/api-error");
const { USER_ROLES } = require("../constants/roles");

const FULL_ACCESS_ROLES = new Set([USER_ROLES.ADMIN, USER_ROLES.MANAGEMENT]);
const RECEPTION_ROLES = new Set([USER_ROLES.RECEPTIONIST, USER_ROLES.BILLING, USER_ROLES.NURSE]);

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

    expanded.add(role);
  });

  return expanded;
};

const authorizeRoles = (...allowedRoles) => {
  const normalizedRoles = normalizeAllowedRoles(allowedRoles);

  return (req, _res, next) => {
    if (!req.user?.role || !normalizedRoles.has(req.user.role)) {
      return next(new ApiError(403, "You do not have permission to perform this action"));
    }

    return next();
  };
};

module.exports = authorizeRoles;
