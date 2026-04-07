const { Pool } = require("pg");
const env = require("./env");

const pool = new Pool({
  connectionString: env.databaseUrl,
  application_name: env.dbApplicationName,
  max: env.dbPoolMax,
  maxUses: env.dbMaxUses,
  idleTimeoutMillis: env.dbIdleTimeoutMs,
  connectionTimeoutMillis: env.dbConnectionTimeoutMs,
  statement_timeout: env.dbStatementTimeoutMs,
  query_timeout: env.dbQueryTimeoutMs,
  lock_timeout: env.dbLockTimeoutMs,
  idle_in_transaction_session_timeout: env.dbIdleInTransactionSessionTimeoutMs,
  keepAlive: true
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error", err);
});

module.exports = pool;
