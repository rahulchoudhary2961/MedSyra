# Backend Architecture

## Stack
- Node.js + Express 5
- PostgreSQL (`pg` pool)
- JWT auth + bcrypt password hashing
- SQL-based migration and seeding scripts

## Folder Structure
- `src/config`: environment and database connection
- `src/constants`: role and status constants
- `src/middlewares`: auth and error middleware
- `src/routes`: route registration per domain
- `src/controllers`: request handlers (HTTP layer)
- `src/services`: business logic layer
- `src/models`: database access layer
- `src/scripts`: migration/seed/reset scripts
- `migrations`: versioned SQL schema
- `seeds`: deterministic seed data

## Request Lifecycle
1. Request enters `src/app.js`
2. Security middleware (`helmet`, `cors`) and JSON parsing run
3. Route dispatch through `src/routes/index.js`
4. `require-auth` validates JWT where required
5. Controller -> service -> model layers execute
6. Not-found and centralized error middleware shape API responses

## Production Readiness Choices
- Versioned API base path: `/api/v1`
- Centralized error responses
- Connection pooling and startup DB health check
- Migration table (`schema_migrations`) for idempotent SQL execution
- Soft delete for patients (`is_active`)
- Pagination in list endpoints
- Dockerized backend, frontend, and postgres services
