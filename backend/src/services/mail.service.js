const env = require("../config/env");
const { logInfo, logWarn } = require("../utils/logger");

const getMailConfigStatus = () => {
  const missing = [];

  if (!env.resendApiKey) missing.push("RESEND_API_KEY");
  if (!env.resendFromEmail) missing.push("RESEND_FROM_EMAIL");

  return {
    configured: missing.length === 0,
    missing
  };
};

const hasMailConfig = () => getMailConfigStatus().configured;

const sendMail = async ({ to, subject, text, replyTo }) => {
  if (!hasMailConfig()) {
    logWarn("resend_not_configured", { to, subject });
    logInfo("mail_dev_fallback", { to, subject, text });
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.resendFromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        reply_to: replyTo || undefined
      })
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Resend request failed: ${response.status} ${details}`.trim());
    }

    return true;
  } catch (error) {
    logWarn("mail_send_failed", {
      to,
      subject,
      message: error instanceof Error ? error.message : "Unknown mail provider error"
    });
    logInfo("mail_dev_fallback", { to, subject, text });
    return false;
  }
};

module.exports = {
  sendMail,
  hasMailConfig,
  getMailConfigStatus
};
