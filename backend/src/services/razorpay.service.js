const crypto = require("crypto");
const env = require("../config/env");
const ApiError = require("../utils/api-error");

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";

const isConfigured = () => Boolean(env.razorpayKeyId && env.razorpayKeySecret);

const assertConfigured = () => {
  if (!isConfigured()) {
    throw new ApiError(400, "Razorpay is not configured");
  }
};

const toRazorpayAmount = (amount) => Math.round(Number(amount || 0) * 100);
const fromRazorpayAmount = (amount) => Number((Number(amount || 0) / 100).toFixed(2));

const normalizeStatus = (status) => {
  if (status === "paid") return "paid";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "failed") return "failed";
  if (status === "partially_paid") return "partially_paid";
  return "created";
};

const toIsoDateTime = (unixSeconds) => {
  if (!unixSeconds) {
    return null;
  }

  return new Date(Number(unixSeconds) * 1000).toISOString();
};

const getAuthHeader = () =>
  `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64")}`;

const request = async (path, options = {}) => {
  assertConfigured();

  const response = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      data?.error?.description ||
      data?.error?.message ||
      data?.message ||
      "Razorpay request failed";
    throw new ApiError(response.status, message);
  }

  return data;
};

const mapPaymentLink = (payload) => {
  if (!payload) {
    return null;
  }

  return {
    provider: "razorpay",
    providerLinkId: payload.id,
    shortUrl: payload.short_url || null,
    status: normalizeStatus(payload.status),
    amount: fromRazorpayAmount(payload.amount),
    amountPaid: fromRazorpayAmount(payload.amount_paid || 0),
    currency: payload.currency || "INR",
    expiresAt: toIsoDateTime(payload.expire_by),
    paidAt: normalizeStatus(payload.status) === "paid" ? new Date().toISOString() : null,
    lastSyncedAt: new Date().toISOString(),
    providerPaymentId: payload.payment_id || null,
    providerPayload: payload
  };
};

const createPaymentLink = async ({
  amount,
  currency = "INR",
  invoiceNumber,
  patientName,
  phone,
  email,
  description,
  expiresAt,
  callbackUrl,
  notes
}) => {
  const expireBy =
    expiresAt && !Number.isNaN(new Date(expiresAt).getTime())
      ? Math.floor(new Date(expiresAt).getTime() / 1000)
      : undefined;

  const payload = await request("/payment_links", {
    method: "POST",
    body: {
      amount: toRazorpayAmount(amount),
      currency,
      accept_partial: false,
      description: description || `Invoice ${invoiceNumber}`,
      customer: {
        name: patientName || undefined,
        contact: phone || undefined,
        email: email || undefined
      },
      notify: {
        sms: true,
        email: true
      },
      reminder_enable: true,
      expire_by: expireBy,
      callback_url: callbackUrl || undefined,
      callback_method: callbackUrl ? "get" : undefined,
      notes: {
        ...(notes || {}),
        invoice_number: invoiceNumber
      }
    }
  });

  return mapPaymentLink(payload);
};

const fetchPaymentLink = async (providerLinkId) => {
  const payload = await request(`/payment_links/${providerLinkId}`);
  return mapPaymentLink(payload);
};

const verifyWebhookSignature = (rawBody, signature) => {
  if (!env.razorpayWebhookSecret) {
    throw new ApiError(400, "Razorpay webhook secret is not configured");
  }

  if (!rawBody || !signature) {
    return false;
  }

  const expected = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(String(signature), "utf8");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
};

const mapPaymentMethod = (providerMethod) => {
  const normalized = String(providerMethod || "").toLowerCase();
  if (normalized === "upi") return "upi";
  if (normalized === "card") return "card";
  if (normalized === "netbanking" || normalized === "bank_transfer") return "bank_transfer";
  return "other";
};

module.exports = {
  isConfigured,
  createPaymentLink,
  fetchPaymentLink,
  verifyWebhookSignature,
  mapPaymentMethod
};
