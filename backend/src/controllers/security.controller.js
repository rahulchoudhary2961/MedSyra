const asyncHandler = require("../utils/async-handler");
const securityService = require("../services/security.service");

const getOverview = asyncHandler(async (req, res) => {
  const data = await securityService.getSecurityOverview(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const data = await securityService.listAuditLogs(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

module.exports = {
  getOverview,
  listAuditLogs
};
