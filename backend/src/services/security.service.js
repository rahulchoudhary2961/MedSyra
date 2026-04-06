const auditModel = require("../models/audit.model");

const PROTECTED_ACTIONS = [
  {
    action: "Delete patients",
    roles: ["admin", "management"],
    description: "Patient deletion now requires full-access roles."
  },
  {
    action: "Delete appointments",
    roles: ["admin", "management"],
    description: "Permanent appointment deletion is restricted to full-access roles."
  },
  {
    action: "Delete invoices",
    roles: ["admin", "management"],
    description: "Draft invoice deletion is restricted to full-access roles."
  },
  {
    action: "Delete medical records",
    roles: ["admin", "management"],
    description: "Medical record deletion remains a full-access-only operation."
  }
];

const listAuditLogs = async (organizationId, query) => auditModel.listAuditLogs(organizationId, query);

const getSecurityOverview = async (organizationId, query = {}) => {
  const days = Number.parseInt(query.days, 10);
  const windowDays = Number.isFinite(days) && days > 0 ? Math.min(days, 90) : 30;
  const overview = await auditModel.getSecurityOverview(organizationId, windowDays);

  return {
    ...overview,
    protectedActions: PROTECTED_ACTIONS
  };
};

module.exports = {
  listAuditLogs,
  getSecurityOverview
};
