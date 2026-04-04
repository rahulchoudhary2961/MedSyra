const ApiError = require("../utils/api-error");
const billingsModel = require("../models/billings.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const appointmentsModel = require("../models/appointments.model");
const { createInvoicePdfBuffer } = require("../utils/pdf");
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

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const normalizeInvoiceItems = ({ items, description, amount, fallbackAmount, fallbackDescription = "Consultation" }) => {
  if (Array.isArray(items) && items.length > 0) {
    return items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: roundMoney(item.unitPrice),
      totalAmount: roundMoney(Number(item.quantity) * Number(item.unitPrice))
    }));
  }

  const resolvedAmount = amount ?? fallbackAmount;
  if (!resolvedAmount) {
    return [];
  }

  return [
    {
      description: description || fallbackDescription,
      quantity: 1,
      unitPrice: roundMoney(resolvedAmount),
      totalAmount: roundMoney(resolvedAmount)
    }
  ];
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
  if (!payload.patientId) {
    throw new ApiError(400, "patientId is required");
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

  const normalizedItems = normalizeInvoiceItems({
    items: payload.items,
    description: payload.description,
    amount: payload.amount,
    fallbackAmount: doctor?.consultation_fee,
    fallbackDescription: doctor?.full_name ? `Consultation - ${doctor.full_name}` : "Consultation"
  });

  if (normalizedItems.length === 0) {
    throw new ApiError(400, "Add at least one invoice item or provide an amount");
  }

  const created = await billingsModel.createInvoice(organizationId, { ...payload, items: normalizedItems }, actor);
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

  const normalizedPayload = { ...payload };
  if (payload.items || payload.description || payload.amount !== undefined) {
    normalizedPayload.items = normalizeInvoiceItems({
      items: payload.items,
      description: payload.description || current.items?.[0]?.description,
      amount: payload.amount,
      fallbackAmount:
        payload.amount !== undefined
          ? payload.amount
          : current.items?.length === 1
            ? current.items[0].unit_price
            : Number(current.total_amount),
      fallbackDescription: current.items?.[0]?.description || "Consultation"
    });
  }

  const invoice = await billingsModel.updateInvoice(organizationId, id, normalizedPayload, actor);
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

  return {
    filename: `${invoice.invoice_number}.pdf`,
    buffer: createInvoicePdfBuffer(invoice)
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
