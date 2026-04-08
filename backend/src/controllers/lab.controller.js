const { pipeline } = require("stream/promises");
const asyncHandler = require("../utils/async-handler");
const { getRequestMeta, logInfo } = require("../utils/logger");
const labService = require("../services/lab.service");

const listLabTests = asyncHandler(async (req, res) => {
  const data = await labService.listLabTests(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createLabTest = asyncHandler(async (req, res) => {
  const data = await labService.createLabTest(req.user.organizationId, req.body, req.user, getRequestMeta(req));
  res.status(201).json({ success: true, message: "Lab test created", data });
});

const updateLabTest = asyncHandler(async (req, res) => {
  const data = await labService.updateLabTest(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.json({ success: true, message: "Lab test updated", data });
});

const listLabOrders = asyncHandler(async (req, res) => {
  const data = await labService.listLabOrders(req.user.organizationId, req.query, req.user);
  res.json({ success: true, data });
});

const createLabOrder = asyncHandler(async (req, res) => {
  const data = await labService.createLabOrder(
    req.user.organizationId,
    req.body,
    req.user,
    getRequestMeta(req),
    req.branchContext
  );
  res.status(201).json({ success: true, message: "Lab order created", data });
});

const getLabOrder = asyncHandler(async (req, res) => {
  const data = await labService.getLabOrderById(req.user.organizationId, req.params.id, req.user);
  res.json({ success: true, data });
});

const updateLabOrder = asyncHandler(async (req, res) => {
  const data = await labService.updateLabOrder(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.json({ success: true, message: "Lab order updated", data });
});

const uploadLabOrderReport = asyncHandler(async (req, res) => {
  const data = await labService.uploadLabOrderReport(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.status(201).json({ success: true, message: "Lab report uploaded", data });
});

const downloadLabOrderReport = asyncHandler(async (req, res) => {
  const attachment = await labService.getLabOrderReportDownload(
    req.user.organizationId,
    req.params.id,
    req.user
  );
  const fileName = String(attachment.downloadFileName || "lab-report").replace(/"/g, "");

  logInfo("lab_report_downloaded", {
    ...getRequestMeta(req),
    organizationId: req.user.organizationId,
    userId: req.user.sub,
    role: req.user.role,
    labOrderId: req.params.id,
    fileName,
    storageScope: attachment.storageScope
  });

  res.setHeader("Content-Type", attachment.contentType);
  res.setHeader("Content-Length", String(attachment.size));
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  await pipeline(attachment.createReadStream(), res);
});

module.exports = {
  listLabTests,
  createLabTest,
  updateLabTest,
  listLabOrders,
  createLabOrder,
  getLabOrder,
  updateLabOrder,
  uploadLabOrderReport,
  downloadLabOrderReport
};
