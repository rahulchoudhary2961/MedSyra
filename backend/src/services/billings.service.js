const ApiError = require("../utils/api-error");
const billingsModel = require("../models/billings.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const { createSimplePdfBuffer } = require("../utils/pdf");
const cache = require("../utils/cache");

const VALID_STATUSES = new Set(["draft", "issued", "partially_paid", "paid", "overdue", "void"]);
const listCachePrefix = (organizationId) => `billings:list:${organizationId}:`;
const itemCachePrefix = (organizationId) => `billings:item:${organizationId}:`;

const invalidateBillingCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(listCachePrefix(organizationId)),
    cache.invalidateByPrefix(itemCachePrefix(organizationId))
  ]);
};

const listInvoices = async (organizationId, query) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 10;
  const q = query.q || "";
  const status = query.status || "";
  const cacheKey =
    `${listCachePrefix(organizationId)}` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await billingsModel.listInvoices(organizationId, query);
  await cache.set(cacheKey, result, 60);
  return result;
};

const createInvoice = async (organizationId, payload) => {
  if (!payload.patientId || !payload.amount || !payload.description) {
    throw new ApiError(400, "patientId, amount and description are required");
  }

  const patient = await patientsModel.getPatientById(organizationId, payload.patientId);
  if (!patient) {
    throw new ApiError(404, "Patient not found for this organization");
  }

  if (payload.doctorId) {
    const doctor = await doctorsModel.getDoctorById(organizationId, payload.doctorId);
    if (!doctor) {
      throw new ApiError(404, "Doctor not found for this organization");
    }
  }

  const created = await billingsModel.createInvoice(organizationId, payload);
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

const updateInvoice = async (organizationId, id, payload) => {
  if (payload.status && !VALID_STATUSES.has(payload.status)) {
    throw new ApiError(400, "Invalid invoice status");
  }

  const invoice = await billingsModel.updateInvoice(organizationId, id, payload);
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  await invalidateBillingCaches(organizationId);
  return invoice;
};

const issueInvoice = async (organizationId, id, payload) => {
  const invoice = await billingsModel.issueInvoice(organizationId, id, payload?.dueDate || null);
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }
  await invalidateBillingCaches(organizationId);
  return invoice;
};

const recordPayment = async (organizationId, id, payload) => {
  if (!payload.amount || !payload.method) {
    throw new ApiError(400, "amount and method are required");
  }

  const payment = await billingsModel.addPayment(organizationId, id, payload);
  if (!payment) {
    throw new ApiError(404, "Invoice not found");
  }
  await invalidateBillingCaches(organizationId);
  return payment;
};

const deleteInvoice = async (organizationId, id) => {
  const deleted = await billingsModel.deleteInvoice(organizationId, id);
  if (!deleted) {
    throw new ApiError(400, "Only draft invoices can be deleted");
  }

  await invalidateBillingCaches(organizationId);
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
  deleteInvoice,
  generateInvoicePdf
};
