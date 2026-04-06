const asyncHandler = require("../utils/async-handler");
const crmService = require("../services/crm.service");
const { getRequestMeta } = require("../utils/logger");

const listTasks = asyncHandler(async (req, res) => {
  const data = await crmService.listTasks(req.user.organizationId, {
    ...req.query,
    branchId: req.branchContext?.readBranchId || null
  });
  res.json({ success: true, data });
});

const createTask = asyncHandler(async (req, res) => {
  const data = await crmService.createTask(
    req.user.organizationId,
    {
      ...req.body,
      branchId: req.body.branchId || req.branchContext?.writeBranchId || null
    },
    req.user,
    getRequestMeta(req),
    req.branchContext
  );
  res.status(201).json({ success: true, message: "CRM task created", data });
});

const updateTask = asyncHandler(async (req, res) => {
  const data = await crmService.updateTask(
    req.user.organizationId,
    req.params.id,
    {
      ...req.body,
      branchId: req.body.branchId || req.branchContext?.writeBranchId || null
    },
    req.user,
    getRequestMeta(req),
    req.branchContext
  );
  res.json({ success: true, message: "CRM task updated", data });
});

module.exports = {
  listTasks,
  createTask,
  updateTask
};
