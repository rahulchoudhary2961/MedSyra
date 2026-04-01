const env = require("../config/env");
const ApiError = require("../utils/api-error");

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const formatWhatsAppRecipient = (phone) => {
  const digits = normalizePhone(phone);
  if (digits.length < 10) {
    return null;
  }

  // Inference: YCloud follows WhatsApp Cloud API-style E.164 recipients.
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
};

const buildReminderMessage = ({ patientName, clinicName, doctorName }) => {
  const firstName = String(patientName || "Patient").trim().split(/\s+/)[0] || "Patient";
  const clinicLabel = clinicName || "your clinic";
  const doctorLabel = doctorName || "Doctor";

  return [
    `Hello ${firstName},`,
    `This is a reminder for your follow-up visit at ${clinicLabel}.`,
    "Please visit today or tomorrow.",
    "",
    `- ${doctorLabel}`
  ].join("\n");
};

const ensureReminderConfig = () => {
  if (!env.whatsappReminderEnabled) {
    throw new ApiError(400, "WhatsApp reminders are not enabled");
  }

  if (!env.ycloudApiKey || !env.ycloudWhatsappFrom) {
    throw new ApiError(500, "YCloud WhatsApp configuration is incomplete");
  }
};

const sendFollowUpReminder = async ({ patientPhone, patientName, clinicName, doctorName }) => {
  ensureReminderConfig();

  const to = formatWhatsAppRecipient(patientPhone);
  if (!to) {
    throw new ApiError(400, "Patient phone number is missing or invalid for WhatsApp reminders");
  }

  const body = buildReminderMessage({ patientName, clinicName, doctorName });

  const response = await fetch("https://api.ycloud.com/v2/whatsapp/messages/sendDirectly", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.ycloudApiKey
    },
    body: JSON.stringify({
      from: env.ycloudWhatsappFrom,
      to,
      type: "text",
      text: { body }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const reason =
      payload?.error?.message ||
      payload?.error?.whatsappApiError?.message ||
      payload?.message ||
      "Failed to send WhatsApp reminder";
    throw new ApiError(response.status >= 400 && response.status < 500 ? response.status : 502, reason, payload);
  }

  return {
    provider: "ycloud",
    recipient: to,
    message: body,
    providerResponse: payload
  };
};

module.exports = {
  sendFollowUpReminder,
  buildReminderMessage
};
