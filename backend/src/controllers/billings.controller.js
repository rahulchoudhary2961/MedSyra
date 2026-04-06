const asyncHandler = require("../utils/async-handler");
const billingsService = require("../services/billings.service");
const onlinePaymentsService = require("../services/online-payments.service");

const listInvoices = asyncHandler(async (req, res) => {
  const data = await billingsService.listInvoices(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createInvoice = asyncHandler(async (req, res) => {
  const data = await billingsService.createInvoice(req.user.organizationId, req.body, req.user);
  res.status(201).json({ success: true, message: "Invoice created", data });
});

const getInvoice = asyncHandler(async (req, res) => {
  const data = await billingsService.getInvoiceById(req.user.organizationId, req.params.id);
  res.json({ success: true, data });
});

const updateInvoice = asyncHandler(async (req, res) => {
  const data = await billingsService.updateInvoice(req.user.organizationId, req.params.id, req.body, req.user);
  res.json({ success: true, message: "Invoice updated", data });
});

const issueInvoice = asyncHandler(async (req, res) => {
  const data = await billingsService.issueInvoice(req.user.organizationId, req.params.id, req.body, req.user);
  res.json({ success: true, message: "Invoice issued", data });
});

const recordPayment = asyncHandler(async (req, res) => {
  const data = await billingsService.recordPayment(req.user.organizationId, req.params.id, req.body, req.user);
  res.status(201).json({ success: true, message: "Payment recorded", data });
});

const refundPayment = asyncHandler(async (req, res) => {
  const data = await billingsService.refundPayment(req.user.organizationId, req.params.id, req.body, req.user);
  res.json({ success: true, message: "Payment refunded", data });
});

const markInvoicePaid = asyncHandler(async (req, res) => {
  const data = await billingsService.markInvoicePaid(req.user.organizationId, req.params.id, req.body, req.user);
  res.json({ success: true, message: "Invoice marked as paid", data });
});

const getReconciliationReport = asyncHandler(async (req, res) => {
  const data = await billingsService.getReconciliationReport(req.user.organizationId);
  res.json({ success: true, data });
});

const createPaymentLink = asyncHandler(async (req, res) => {
  const data = await onlinePaymentsService.createInvoicePaymentLink(req.user.organizationId, req.params.id, req.body);
  res.status(201).json({ success: true, message: "Payment link created", data });
});

const refreshPaymentLink = asyncHandler(async (req, res) => {
  const data = await onlinePaymentsService.refreshInvoicePaymentLinkStatus(
    req.user.organizationId,
    req.params.id,
    req.params.linkId
  );
  res.json({ success: true, message: "Payment link refreshed", data });
});

const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const pdf = await billingsService.generateInvoicePdf(req.user.organizationId, req.params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
  res.send(pdf.buffer);
});

const deleteInvoice = asyncHandler(async (req, res) => {
  await billingsService.deleteInvoice(req.user.organizationId, req.params.id, req.user);
  res.json({ success: true, message: "Invoice deleted" });
});

module.exports = {
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  issueInvoice,
  recordPayment,
  refundPayment,
  getReconciliationReport,
  createPaymentLink,
  refreshPaymentLink,
  markInvoicePaid,
  downloadInvoicePdf,
  deleteInvoice
};
