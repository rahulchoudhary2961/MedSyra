const env = require("../config/env");
const ApiError = require("../utils/api-error");
const commercialService = require("./commercial.service");

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const formatSmsRecipient = (phone) => {
  const digits = normalizePhone(phone);
  if (digits.length < 10) {
    return null;
  }

  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
};

const ensureSmsConfig = () => {
  if (!env.smsReminderEnabled) {
    throw new ApiError(400, "SMS reminders are not enabled");
  }

  if (env.smsProvider === "httpsms" || !env.smsProvider) {
    if (!env.httpsmsApiKey || !env.httpsmsFromNumber) {
      throw new ApiError(500, "httpSMS configuration is incomplete");
    }
    return "httpsms";
  }

  if (env.smsProvider === "twilio") {
    if (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioFromNumber) {
      throw new ApiError(500, "Twilio SMS configuration is incomplete");
    }
    return "twilio";
  }

  throw new ApiError(500, `Unsupported SMS provider: ${env.smsProvider}`);
};

const sendSmsText = async ({
  phone,
  body,
  organizationId = null,
  actorUserId = null,
  sourceFeature = "sms_message",
  referenceId = null,
  note = null
}) => {
  const provider = ensureSmsConfig();

  if (organizationId) {
    await commercialService.ensureUsageAllowed(organizationId, {
      messagesUsed: 1
    });
  }

  const to = formatSmsRecipient(phone);
  if (!to) {
    throw new ApiError(400, "Phone number is missing or invalid for SMS notifications");
  }

  let response;
  let payload;

  if (provider === "httpsms") {
    response = await fetch("https://api.httpsms.com/v1/messages/send", {
      method: "POST",
      headers: {
        "x-api-key": env.httpsmsApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.httpsmsFromNumber,
        to,
        content: body
      })
    });
    payload = await response.json().catch(() => null);
  } else {
    const encoded = new URLSearchParams({
      To: to,
      From: env.twilioFromNumber,
      Body: body
    });

    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: encoded.toString()
      }
    );
    payload = await response.json().catch(() => null);
  }

  if (!response.ok) {
    const reason = payload?.message || payload?.error_message || "Failed to send SMS notification";
    throw new ApiError(response.status >= 400 && response.status < 500 ? response.status : 502, reason, payload);
  }

  const result = {
    provider,
    recipient: to,
    message: body,
    providerResponse: payload
  };

  if (!organizationId) {
    return result;
  }

  const usage = await commercialService.recordUsage(organizationId, {
    actorUserId,
    messagesUsed: 1,
    sourceFeature,
    referenceId,
    note
  });

  return {
    ...result,
    usage
  };
};

module.exports = {
  sendSmsText,
  formatSmsRecipient
};
