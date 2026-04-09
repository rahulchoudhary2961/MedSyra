const app = require("./app");
const env = require("./config/env");
const pool = require("./config/db");
const { startRuntimeDiagnostics } = require("./services/runtime-diagnostics.service");
const { logError, logInfo, logWarn } = require("./utils/logger");
const { getMailConfigStatus } = require("./services/mail.service");

const startServer = async () => {
  await pool.query("SELECT 1");
  logInfo("database_connection_ok", { nodeEnv: env.nodeEnv });

  const mailStatus = getMailConfigStatus();
  if (!mailStatus.configured) {
    logWarn("mail_config_incomplete", {
      message: "Email delivery is not fully configured. Lead and auth emails will fall back to logs.",
      missing: mailStatus.missing
    });
  } else {
    logInfo("mail_config_ok", {
      provider: env.brevoApiKey && env.brevoFromEmail ? "brevo" : "resend",
      leadsEmailConfigured: Boolean(env.leadsEmailTo)
    });
  }

  startRuntimeDiagnostics();

  app.listen(env.port, () => {
    logInfo("server_started", { port: env.port, nodeEnv: env.nodeEnv });
  });
};

startServer().catch((error) => {
  logError("server_start_failed", { message: error.message, stack: error.stack });
  process.exit(1);
});
