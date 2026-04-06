const asyncHandler = require("../utils/async-handler");
const branchesService = require("../services/branches.service");

const listBranches = asyncHandler(async (req, res) => {
  const data = await branchesService.listBranches(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createBranch = asyncHandler(async (req, res) => {
  const data = await branchesService.createBranch(req.user.organizationId, req.body);
  res.status(201).json({
    success: true,
    message: "Branch created",
    data
  });
});

const updateBranch = asyncHandler(async (req, res) => {
  const data = await branchesService.updateBranch(req.user.organizationId, req.params.id, req.body);
  res.json({
    success: true,
    message: "Branch updated",
    data
  });
});

module.exports = {
  createBranch,
  listBranches,
  updateBranch
};
