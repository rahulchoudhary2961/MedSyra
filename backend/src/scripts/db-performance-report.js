const pool = require("../config/db");

const printSection = (title, rows) => {
  console.log(`\n=== ${title} ===`);
  if (!rows || rows.length === 0) {
    console.log("No rows");
    return;
  }

  console.table(rows);
};

const run = async () => {
  const settingsPromise = pool.query(
    `
      SELECT name, setting, unit
      FROM pg_settings
      WHERE name = ANY($1::text[])
      ORDER BY name
    `,
    [[
      "max_connections",
      "shared_buffers",
      "work_mem",
      "maintenance_work_mem",
      "effective_cache_size",
      "effective_io_concurrency",
      "random_page_cost",
      "max_worker_processes",
      "max_parallel_workers",
      "max_parallel_workers_per_gather",
      "jit",
      "jit_above_cost",
      "geqo",
      "default_statistics_target",
      "autovacuum",
      "track_io_timing"
    ]]
  );

  const activityPromise = pool.query(`
    SELECT
      state,
      wait_event_type,
      COUNT(*)::int AS connections
    FROM pg_stat_activity
    WHERE datname = current_database()
    GROUP BY state, wait_event_type
    ORDER BY connections DESC, state NULLS LAST
  `);

  const tableStatsPromise = pool.query(`
    SELECT
      relname AS table_name,
      seq_scan,
      idx_scan,
      n_live_tup,
      n_dead_tup,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze
    FROM pg_stat_user_tables
    ORDER BY n_dead_tup DESC, seq_scan DESC
    LIMIT 15
  `);

  const indexStatsPromise = pool.query(`
    SELECT
      ui.relname AS table_name,
      ui.indexrelname AS index_name,
      ui.idx_scan,
      pg_size_pretty(pg_relation_size(ui.indexrelid)) AS index_size
    FROM pg_stat_user_indexes ui
    ORDER BY ui.idx_scan ASC, pg_relation_size(ui.indexrelid) DESC
    LIMIT 20
  `);

  const longRunningPromise = pool.query(`
    SELECT
      pid,
      state,
      wait_event_type,
      NOW() - query_start AS running_for,
      LEFT(query, 180) AS query
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state <> 'idle'
      AND query NOT ILIKE '%pg_stat_activity%'
    ORDER BY query_start ASC
    LIMIT 10
  `);

  const pgStatStatementsInstalledPromise = pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_extension
      WHERE extname = 'pg_stat_statements'
    ) AS installed
  `);

  const [
    settings,
    activity,
    tableStats,
    indexStats,
    longRunning,
    pgStatStatementsInstalled
  ] = await Promise.all([
    settingsPromise,
    activityPromise,
    tableStatsPromise,
    indexStatsPromise,
    longRunningPromise,
    pgStatStatementsInstalledPromise
  ]);

  printSection("Key Settings", settings.rows);
  printSection("Connection Activity", activity.rows);
  printSection("Table Stats", tableStats.rows);
  printSection("Low/Unused Indexes", indexStats.rows);
  printSection("Long Running Queries", longRunning.rows);

  if (pgStatStatementsInstalled.rows[0]?.installed) {
    const topQueries = await pool.query(`
      SELECT
        calls,
        ROUND(total_exec_time::numeric, 2) AS total_exec_ms,
        ROUND(mean_exec_time::numeric, 2) AS mean_exec_ms,
        ROUND(rows::numeric, 2) AS rows_processed,
        LEFT(query, 180) AS query
      FROM pg_stat_statements
      ORDER BY total_exec_time DESC
      LIMIT 10
    `);
    printSection("Top Queries (pg_stat_statements)", topQueries.rows);
  } else {
    console.log("\n=== Top Queries (pg_stat_statements) ===");
    console.log("pg_stat_statements extension is not installed");
  }
};

run()
  .catch((error) => {
    console.error("PostgreSQL performance report failed", error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
