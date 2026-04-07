# PostgreSQL Performance Notes

These are the PostgreSQL-level optimizations that MedSyra now supports directly:

- targeted indexes for frequent query paths
- connection/session tuning hooks from app config
- manual maintenance script using `VACUUM (ANALYZE)`
- performance report script for planner stats, activity, and index usage

## App-Level Settings

Set these in `.env` when needed:

- `DB_APPLICATION_NAME`
- `DB_POOL_MAX`
- `DB_MAX_USES`
- `DB_IDLE_TIMEOUT_MS`
- `DB_CONNECTION_TIMEOUT_MS`
- `DB_STATEMENT_TIMEOUT_MS`
- `DB_QUERY_TIMEOUT_MS`
- `DB_LOCK_TIMEOUT_MS`
- `DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS`

## Manual Maintenance

Run:

```powershell
npm run db:maintain
```

This performs `VACUUM (ANALYZE)` on the main operational tables.

## Performance Report

Run:

```powershell
npm run db:report
```

This shows:

- key planner/server settings
- current connection activity
- table scan/dead tuple stats
- low-usage indexes
- long-running queries
- `pg_stat_statements` top queries when the extension is available

## Recommended PostgreSQL Server Settings

These are not changed automatically by the app and should be reviewed on the database server:

- `shared_buffers`
- `work_mem`
- `maintenance_work_mem`
- `effective_cache_size`
- `effective_io_concurrency`
- `random_page_cost`
- `max_parallel_workers`
- `max_parallel_workers_per_gather`
- `jit`
- `geqo`
- `default_statistics_target`
- `autovacuum`
- `track_io_timing`

## Recommended Extensions

- `pg_stat_statements` for query-level monitoring

## Notes

- `VACUUM` and server-level tuning should be scheduled during low-traffic periods in production.
- For very large production databases, create large new indexes with `CONCURRENTLY` outside the transactional migration runner.
