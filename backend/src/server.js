const app = require("./app");
const env = require("./config/env");
const pool = require("./config/db");
const { logError, logInfo, logWarn } = require("./utils/logger");
const { getSmtpConfigStatus } = require("./services/mail.service");

const startServer = async () => {
  await pool.query("SELECT 1");
  logInfo("database_connection_ok", { nodeEnv: env.nodeEnv });

  const smtpStatus = getSmtpConfigStatus();
  if (!smtpStatus.configured) {
    logWarn("smtp_config_incomplete", {
      message: "SMTP email delivery is not fully configured. Lead and auth emails will fall back to logs.",
      missing: smtpStatus.missing
    });
  } else {
    logInfo("smtp_config_ok", {
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      leadsEmailConfigured: Boolean(env.leadsEmailTo)
    });
  }

  app.listen(env.port, () => {
    logInfo("server_started", { port: env.port, nodeEnv: env.nodeEnv });
  });
};

startServer().catch((error) => {
  logError("server_start_failed", { message: error.message, stack: error.stack });
  process.exit(1);
});
