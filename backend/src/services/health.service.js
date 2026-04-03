const pool = require("../config/db");
const env = require("../config/env");
const { getCacheStatus } = require("../utils/cache");
const { getMailConfigStatus } = require("./mail.service");

const getHealthStatus = async () => {
  let database = {
    ok: false
  };

  try {
    await pool.query("SELECT 1");
    database = {
      ok: true
    };
  } catch (error) {
    database = {
      ok: false,
      error: error instanceof Error ? error.message : "Database health check failed"
    };
  }

  const cache = getCacheStatus();
  const mail = getMailConfigStatus();
  const whatsapp = {
    enabled: env.whatsappReminderEnabled,
    configured: !env.whatsappReminderEnabled || Boolean(env.ycloudApiKey && env.ycloudWhatsappFrom)
  };

  return {
    ok: database.ok,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    services: {
      database,
      cache,
      mail,
      whatsapp
    }
  };
};

module.exports = {
  getHealthStatus
};
