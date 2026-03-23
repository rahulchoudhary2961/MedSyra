const app = require("./app");
const env = require("./config/env");
const pool = require("./config/db");
const { logError, logInfo } = require("./utils/logger");

const startServer = async () => {
  await pool.query("SELECT 1");
  logInfo("database_connection_ok", { nodeEnv: env.nodeEnv });

  app.listen(env.port, () => {
    logInfo("server_started", { port: env.port, nodeEnv: env.nodeEnv });
  });
};

startServer().catch((error) => {
  logError("server_start_failed", { message: error.message, stack: error.stack });
  process.exit(1);
});
