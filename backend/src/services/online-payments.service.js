const ApiError = require("../utils/api-error");
const cache = require("../utils/cache");
const env = require("../config/env");
const billingsModel = require("../models/billings.model");
const patientsModel = require("../models/patients.model");
const paymentLinksModel = require("../models/payment-links.model");
const razorpayService = require("./razorpay.service");

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

const ONLINE_PAYABLE_STATUSES = new Set(["issued", "partially_paid", "overdue"]);
const ACTIVE_LINK_STATUSES = new Set(["created", "partially_paid"]);

const getPaymentCallbackUrl = (invoiceId) => {
  const baseUrl = (env.appBaseUrl || "http://localhost:3000").replace(/\/+$/, "");
  return `${baseUrl}/dashboard/billings?invoiceId=${invoiceId}`;
};

const buildLinkDescription = (invoice) => {
  if (invoice.patient_name) {
    return `${invoice.invoice_number} for ${invoice.patient_name}`;
  }

  return `Invoice ${invoice.invoice_number}`;
};

const buildExpiresAt = (explicitExpiresAt, invoice) => {
  if (explicitExpiresAt) {
    return new Date(`${explicitExpiresAt}T23:59:59`).toISOString();
  }

  if (invoice.due_date) {
    return new Date(`${invoice.due_date}T23:59:59`).toISOString();
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 3);
  fallback.setHours(23, 59, 59, 0);
  return fallback.toISOString();
};

const reconcilePaidLink = async (invoice, paymentLink, providerPayment) => {
  const reference = providerPayment?.id || paymentLink.providerPaymentId || paymentLink.providerLinkId;
  const existingPayment = await billingsModel.getPaymentByReference(invoice.organization_id, invoice.id, reference);
  if (existingPayment) {
    return existingPayment;
  }

  const remainingBalance = Number(invoice.balance_amount || 0);
  if (remainingBalance <= 0) {
    return null;
  }

  const paidAmount = Number(providerPayment?.amount || 0) / 100 || Number(paymentLink.amountPaid || 0);
  const amountToRecord = Math.min(Number(paidAmount.toFixed(2)), remainingBalance);
  if (amountToRecord <= 0) {
    return null;
  }

  const paidAt =
    providerPayment?.created_at
      ? new Date(Number(providerPayment.created_at) * 1000).toISOString()
      : paymentLink.paidAt || new Date().toISOString();

  return billingsModel.addPayment(
    invoice.organization_id,
    invoice.id,
    {
      branchId: invoice.branch_id || paymentLink.branch_id || null,
      amount: amountToRecord,
      method: razorpayService.mapPaymentMethod(providerPayment?.method),
      reference,
      status: "completed",
      paidAt
    },
    null
  );
};

const syncLinkAndInvoice = async (organizationId, invoiceId, localLink, providerLink, providerPayment = null) => {
  const syncedLink = await paymentLinksModel.updatePaymentLinkById(organizationId, invoiceId, localLink.id, {
    shortUrl: providerLink.shortUrl || localLink.short_url,
    status: providerLink.status,
    expiresAt: providerLink.expiresAt,
    paidAt: providerLink.paidAt,
    lastSyncedAt: providerLink.lastSyncedAt,
    providerPaymentId: providerPayment?.id || providerLink.providerPaymentId || null,
    providerPayload: providerLink.providerPayload
  });

  const invoice = await billingsModel.getInvoiceById(organizationId, invoiceId, localLink.branch_id || null);
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }

  if (providerLink.status === "paid") {
    await reconcilePaidLink(invoice, providerLink, providerPayment);
  }

  await invalidateBillingCaches(organizationId);

  return {
    invoice: await billingsModel.getInvoiceById(organizationId, invoiceId),
    paymentLink: syncedLink
  };
};

const createInvoicePaymentLink = async (organizationId, invoiceId, payload = {}, branchContext = null) => {
  if (!razorpayService.isConfigured()) {
    throw new ApiError(400, "Razorpay is not configured");
  }

  const invoice = await billingsModel.getInvoiceById(
    organizationId,
    invoiceId,
    payload.branchId || branchContext?.readBranchId || branchContext?.writeBranchId || null
  );
  if (!invoice) {
    throw new ApiError(404, "Invoice not found");
  }

  if (!ONLINE_PAYABLE_STATUSES.has(invoice.status)) {
    throw new ApiError(400, "Issue the invoice before creating an online payment link");
  }

  if (Number(invoice.balance_amount || 0) <= 0) {
    throw new ApiError(400, "Invoice has no outstanding balance");
  }

  const reusableLink = await paymentLinksModel.getReusablePaymentLink(
    organizationId,
    invoiceId,
    Number(invoice.balance_amount),
    invoice.currency || "INR"
  );

  if (reusableLink && ACTIVE_LINK_STATUSES.has(reusableLink.status)) {
    return {
      invoice,
      paymentLink: reusableLink
    };
  }

  const patient = invoice.patient_id ? await patientsModel.getPatientById(organizationId, invoice.patient_id) : null;
  const providerLink = await razorpayService.createPaymentLink({
    amount: Number(invoice.balance_amount),
    currency: invoice.currency || "INR",
    invoiceNumber: invoice.invoice_number,
    patientName: patient?.full_name || invoice.patient_name,
    phone: patient?.phone || null,
    email: patient?.email || null,
    description: buildLinkDescription(invoice),
    expiresAt: buildExpiresAt(payload.expiresAt, invoice),
    callbackUrl: getPaymentCallbackUrl(invoice.id),
    notes: {
      invoice_id: invoice.id,
      organization_id: organizationId,
      patient_id: invoice.patient_id || ""
    }
  });

  const paymentLink = await paymentLinksModel.createPaymentLink(organizationId, invoiceId, {
    ...providerLink,
    branchId: invoice.branch_id || payload.branchId || null
  });
  await invalidateBillingCaches(organizationId);

  return {
    invoice: await billingsModel.getInvoiceById(organizationId, invoiceId, invoice.branch_id || null),
    paymentLink
  };
};

const refreshInvoicePaymentLinkStatus = async (organizationId, invoiceId, linkId, branchContext = null) => {
  if (!razorpayService.isConfigured()) {
    throw new ApiError(400, "Razorpay is not configured");
  }

  const localLink = await paymentLinksModel.getPaymentLinkById(organizationId, invoiceId, linkId);
  if (!localLink) {
    throw new ApiError(404, "Payment link not found");
  }

  if (
    branchContext?.readBranchId &&
    localLink.branch_id &&
    branchContext.readBranchId !== localLink.branch_id
  ) {
    throw new ApiError(404, "Payment link not found");
  }

  const providerLink = await razorpayService.fetchPaymentLink(localLink.provider_link_id);
  return syncLinkAndInvoice(organizationId, invoiceId, localLink, providerLink);
};

const handleRazorpayWebhook = async ({ rawBody, signature, body }) => {
  if (!razorpayService.verifyWebhookSignature(rawBody, signature)) {
    throw new ApiError(401, "Invalid Razorpay webhook signature");
  }

  const providerLinkPayload = body?.payload?.payment_link?.entity;
  if (!providerLinkPayload?.id) {
    return { processed: false, reason: "No payment link payload" };
  }

  const localLink = await paymentLinksModel.getPaymentLinkByProviderLinkId("razorpay", providerLinkPayload.id);
  if (!localLink) {
    return { processed: false, reason: "Unknown payment link" };
  }

  const providerPayment = body?.payload?.payment?.entity || null;
  const providerLink = {
    provider: "razorpay",
    providerLinkId: providerLinkPayload.id,
    shortUrl: providerLinkPayload.short_url || localLink.short_url,
    status:
      providerLinkPayload.status === "paid"
        ? "paid"
        : providerLinkPayload.status === "partially_paid"
          ? "partially_paid"
          : providerLinkPayload.status === "cancelled"
            ? "cancelled"
            : providerLinkPayload.status === "expired"
              ? "expired"
              : "created",
    amount: Number((Number(providerLinkPayload.amount || 0) / 100).toFixed(2)),
    amountPaid: Number((Number(providerLinkPayload.amount_paid || 0) / 100).toFixed(2)),
    currency: providerLinkPayload.currency || "INR",
    expiresAt: providerLinkPayload.expire_by ? new Date(providerLinkPayload.expire_by * 1000).toISOString() : null,
    paidAt: providerPayment?.created_at ? new Date(providerPayment.created_at * 1000).toISOString() : null,
    lastSyncedAt: new Date().toISOString(),
    providerPaymentId: providerPayment?.id || providerLinkPayload.payment_id || null,
    providerPayload: providerLinkPayload
  };

  const result = await syncLinkAndInvoice(
    localLink.organization_id,
    localLink.invoice_id,
    localLink,
    providerLink,
    providerPayment
  );

  return {
    processed: true,
    invoiceId: result.invoice.id,
    paymentLinkId: result.paymentLink?.id || localLink.id
  };
};

module.exports = {
  createInvoicePaymentLink,
  refreshInvoicePaymentLinkStatus,
  handleRazorpayWebhook
};
