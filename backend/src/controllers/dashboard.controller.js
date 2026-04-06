const asyncHandler = require("../utils/async-handler");
const dashboardService = require("../services/dashboard.service");

const getSummary = asyncHandler(async (req, res) => {
  const data = await dashboardService.getSummary(
    req.user.organizationId,
    req.branchContext?.readBranchId || null
  );
  res.json({ success: true, data });
});

const getReports = asyncHandler(async (req, res) => {
  const data = await dashboardService.getReports(req.user.organizationId, {
    ...req.query,
    branchId: req.branchContext?.readBranchId || null
  });
  res.json({ success: true, data });
});

module.exports = { getSummary, getReports };
