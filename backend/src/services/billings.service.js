const ApiError = require("../utils/api-error");
const billingsModel = require("../models/billings.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const appointmentsModel = require("../models/appointments.model");
const { createSimplePdfBuffer } = require("../utils/pdf");
const cache = require("../utils/cache");

const VALID_STATUSES = new Set(["draft", "issued", "partially_paid", "paid", "overdue", "void"]);
const TERMINAL_INVOICE_STATUSES = new Set(["paid", "void"]);
const EDITABLE_INVOICE_STATUSES = new Set(["draft"]);
const listCachePrefix = (organizationId) => `billings:list:${organizationId}:`;
const itemCachePrefix = (organizationId) => `billings:item:${organizationId}:`;
const dashboardSummaryCachePrefix = (organizationId) => `dashboard:summary:${organizationId}`;
const dashboardReportsCachePrefix = (organizationId) => `dashboard:reports:${organizationId}`;

const invalidateBillingCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(listCachePrefix(organizationId)),
    cache.invalidateByPrefix(itemCachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardSummaryCachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardReportsCachePrefix(organizationId))
  ]);
};

const listInvoices = async (organizationId, query) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 10;
  const q = query.q || "";
  const status = query.status || "";
  const patientId = query.patientId || "";
  const cacheKey =
    `${listCachePrefix(organizationId)}` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}:patientId=${patientId}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await billingsModel.listInvoices(organizationId, query);
  await cache.set(cacheKey, result, 60);
  return result;
};

const createInvoice = async (organizationId, payload, actor = null) => {
  if (!payload.patientId || !payload.description) {
    throw new ApiError(400, "patientId and description are required");
  }

  const patient = await patientsModel.getPatientById(organizationId, payload.patientId);
  if (!patient) {
    throw new ApiError(404, "Patient not found for this organization");
  }

  let doctor = null;
  if (payload.doctorId) {
    doctor = await doctorsModel.getDoctorById(organizationId, payload.doctorId);
    if (!doctor) {
      throw new ApiError(404, "Doctor not found for this organization");
    }
  }

  if (payload.appointmentId) {
    const appointment = await appointmentsModel.getAppointmentById(organizationId, payload.appointmentId);
    if (!appointment) {
      throw new ApiError(404, "Appointment not found for this organization");
    }

    if (appointment.invoice_id) {
      throw new ApiError(400, "An invoice already exists for this appointment");
    }

    if (appointment.patient_id && appointment.patient_id !== payload.patientId) {
      throw new ApiError(400, "Appointment does not belong to the selected patient");
    }

    if (payload.doctorId && appointment.doctor_id && appointment.doctor_id !== payload.doctorId) {
      throw new ApiError(400, "Appointment does not belong to the selected doctor");
    }
  }

  const amount = payload.amount ?? doctor?.consultation_fee;
  if (!amount) {
    throw new ApiError(400, "amount is required when the doctor has no consultation fee");
  }

  const created = await billingsModel.createInvoice(organizationId, { ...payload, amount }, actor);
  await invalidateBillingCaches(organizationId);
  return created;
};

const getInvoiceById = async (organizationId, id) => {
  const cacheKey = `${itemCachePrefix(organizationId)}${id}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const invoice = await billingsModel.getInvoiceById(organizationId, id);
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  await cache.set(cacheKey, invoice, 60);
  return invoice;
};

const updateInvoice = async (organizationId, id, payload, actor = null) => {
  if (payload.status && !VALID_STATUSES.has(payload.status)) {
    throw new ApiError(400, "Invalid invoice status");
  }

  const current = await billingsModel.getInvoiceById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Invoice not found");
  }

  if (!EDITABLE_INVOICE_STATUSES.has(current.status)) {
    throw new ApiError(400, "Only draft invoices can be edited");
  }

  const invoice = await billingsModel.updateInvoice(organizationId, id, payload, actor);
  await invalidateBillingCaches(organizationId);
  return invoice;
};

const issueInvoice = async (organizationId, id, payload, actor = null) => {
  const current = await billingsModel.getInvoiceById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Invoice not found");
  }

  if (current.status === "void") {
    throw new ApiError(400, "Void invoices cannot be issued");
  }

  if (current.status !== "draft") {
    throw new ApiError(400, "Only draft invoices can be issued");
  }

  const invoice = await billingsModel.issueInvoice(organizationId, id, payload?.dueDate || null, actor);
  await invalidateBillingCaches(organizationId);
  return invoice;
};

const recordPayment = async (organizationId, id, payload, actor = null) => {
  if (!payload.amount || !payload.method) {
    throw new ApiError(400, "amount and method are required");
  }

  const invoice = await billingsModel.getInvoiceById(organizationId, id);
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }

  if (invoice.status === "void") {
    throw new ApiError(400, "Cannot record payment on a void invoice");
  }

  if (payload.status === "refunded") {
    throw new ApiError(400, "Refunds must be handled through a dedicated refund flow");
  }

  if (TERMINAL_INVOICE_STATUSES.has(invoice.status)) {
    throw new ApiError(400, "Cannot record a payment for a paid or void invoice");
  }

  if (Number(payload.amount) > Number(invoice.balance_amount)) {
    throw new ApiError(400, "Payment amount cannot exceed invoice balance");
  }

  const payment = await billingsModel.addPayment(organizationId, id, payload, actor);
  if (!payment) {
    throw new ApiError(404, "Invoice not found");
  }
  await invalidateBillingCaches(organizationId);
  return payment;
};

const refundPayment = async (organizationId, id, payload, actor = null) => {
  if (!payload.paymentId) {
    throw new ApiError(400, "paymentId is required");
  }

  const invoice = await billingsModel.getInvoiceById(organizationId, id);
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }

  if (invoice.status === "void") {
    throw new ApiError(400, "Cannot refund payment on a void invoice");
  }

  const payment = invoice.payments.find((item) => item.id === payload.paymentId);
  if (!payment) {
    throw new ApiError(404, "Payment not found for this invoice");
  }

  if (payment.status !== "completed") {
    throw new ApiError(400, "Only completed payments can be refunded");
  }

  const result = await billingsModel.refundPayment(organizationId, id, payload.paymentId, payload, actor);
  await invalidateBillingCaches(organizationId);
  return result;
};

const markInvoicePaid = async (organizationId, id, payload, actor = null) => {
  const invoice = await billingsModel.getInvoiceById(organizationId, id);
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }

  if (invoice.status === "void") {
    throw new ApiError(400, "Cannot record payment on a void invoice");
  }

  if (invoice.status === "paid") {
    throw new ApiError(400, "Invoice is already paid");
  }

  const result = await billingsModel.markInvoicePaid(organizationId, id, payload || {}, actor);
  await invalidateBillingCaches(organizationId);
  return result;
};

const deleteInvoice = async (organizationId, id, actor = null) => {
  const deleted = await billingsModel.deleteInvoice(organizationId, id, actor);
  if (!deleted) {
    throw new ApiError(400, "Only draft invoices can be deleted");
  }

  await invalidateBillingCaches(organizationId);
};

const getReconciliationReport = async (organizationId) => {
  return billingsModel.getReconciliationReport(organizationId);
};

const generateInvoicePdf = async (organizationId, id) => {
  const invoice = await getInvoiceById(organizationId, id);
  const lineItems = invoice.items.length > 0 ? invoice.items : [{ description: "-", total_amount: 0 }];
  const lines = [
    `Invoice No: ${invoice.invoice_number}`,
    `Patient: ${invoice.patient_name || "-"}`,
    `Doctor: ${invoice.doctor_name || "-"}`,
    `Issue Date: ${invoice.issue_date}`,
    `Due Date: ${invoice.due_date || "-"}`,
    `Status: ${invoice.status}`,
    `Total: ${invoice.currency} ${invoice.total_amount}`,
    `Paid: ${invoice.currency} ${invoice.paid_amount}`,
    `Balance: ${invoice.currency} ${invoice.balance_amount}`,
    `Items: ${lineItems.map((item) => `${item.description} (${item.total_amount})`).join(", ")}`,
    `Notes: ${invoice.notes || "-"}`
  ];

  return {
    filename: `${invoice.invoice_number}.pdf`,
    buffer: createSimplePdfBuffer("Invoice", lines)
  };
};

module.exports = {
  listInvoices,
  createInvoice,
  getInvoiceById,
  updateInvoice,
  issueInvoice,
  recordPayment,
  refundPayment,
  getReconciliationReport,
  markInvoicePaid,
  deleteInvoice,
  generateInvoicePdf
};
