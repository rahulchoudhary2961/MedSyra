const env = require("../config/env");
const { sendMail } = require("./mail.service");
const { logInfo, logWarn } = require("../utils/logger");

const formatLeadText = (payload) => {
  const lines = [
    "New landing page lead",
    "",
    `Name: ${payload.fullName}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Clinic: ${payload.clinicName}`,
    `City: ${payload.city || "-"}`,
    `Message: ${payload.message || "-"}`
  ];

  return lines.join("\n");
};

const sendLeadEmail = async (payload) => {
  if (!env.leadsEmailTo) {
    logWarn("lead_email_missing_recipient", { email: payload.email });
    return false;
  }

  const text = formatLeadText(payload);
  const sent = await sendMail({
    to: env.leadsEmailTo,
    subject: `New demo request from ${payload.fullName}`,
    text,
    replyTo: payload.email
  });

  if (!sent) {
    logInfo("lead_email_dev_fallback", {
      to: env.leadsEmailTo,
      body: text
    });
  }

  return sent;
};

module.exports = {
  sendLeadEmail
};
