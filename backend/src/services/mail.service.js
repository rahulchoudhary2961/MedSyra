const env = require("../config/env");
const { logInfo, logWarn } = require("../utils/logger");

const getMailConfigStatus = () => {
  const missing = [];

  if (!env.brevoApiKey) missing.push("BREVO_API_KEY");
  if (!env.brevoFromEmail) missing.push("BREVO_FROM_EMAIL");

  return {
    configured: missing.length === 0,
    missing
  };
};

const hasMailConfig = () => getMailConfigStatus().configured;

const getMailProvider = () => {
  if (env.brevoApiKey && env.brevoFromEmail) {
    return {
      name: "brevo",
      apiKey: env.brevoApiKey,
      fromEmail: env.brevoFromEmail,
      fromName: env.brevoFromName || ""
    };
  }

  return null;
};

const sendMail = async ({ to, subject, text, replyTo }) => {
  const provider = getMailProvider();
  if (!provider) {
    logWarn("mail_not_configured", { to, subject });
    logInfo("mail_dev_fallback", { to, subject, text });
    return false;
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": provider.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sender: {
          email: provider.fromEmail,
          ...(provider.fromName ? { name: provider.fromName } : {})
        },
        to: (Array.isArray(to) ? to : [to]).map((email) => ({ email })),
        subject,
        textContent: text,
        replyTo: replyTo ? { email: replyTo } : undefined
      })
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Brevo request failed: ${response.status} ${details}`.trim());
    }

    return true;
  } catch (error) {
    logWarn("mail_send_failed", {
      provider: provider.name,
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
