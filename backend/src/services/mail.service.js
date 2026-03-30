const nodemailer = require("nodemailer");
const env = require("../config/env");
const { logInfo, logWarn } = require("../utils/logger");

let transporter = null;

const getSmtpConfigStatus = () => {
  const missing = [];

  if (!env.smtpHost) missing.push("SMTP_HOST");
  if (!env.smtpPort) missing.push("SMTP_PORT");
  if (!env.smtpUser) missing.push("SMTP_USER");
  if (!env.smtpPass) missing.push("SMTP_PASS");
  if (!env.smtpFromEmail) missing.push("SMTP_FROM_EMAIL");

  return {
    configured: missing.length === 0,
    missing
  };
};

const hasSmtpConfig = () => getSmtpConfigStatus().configured;

const getTransporter = () => {
  if (!hasSmtpConfig()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }

  return transporter;
};

const sendMail = async ({ to, subject, text, replyTo }) => {
  const client = getTransporter();

  if (!client) {
    logWarn("smtp_not_configured", { to, subject });
    logInfo("smtp_dev_fallback", { to, subject, text });
    return false;
  }

  try {
    await client.sendMail({
      from: env.smtpFromEmail,
      to,
      subject,
      text,
      replyTo: replyTo || env.smtpReplyToEmail || undefined
    });

    return true;
  } catch (error) {
    logWarn("smtp_send_failed", {
      to,
      subject,
      code: error && typeof error === "object" ? error.code || null : null,
      responseCode: error && typeof error === "object" ? error.responseCode || null : null,
      message: error instanceof Error ? error.message : "Unknown SMTP error"
    });
    logInfo("smtp_dev_fallback", { to, subject, text });
    return false;
  }
};

module.exports = {
  sendMail,
  hasSmtpConfig,
  getSmtpConfigStatus
};
