# Database Design

## Core Tables
- `organizations`
- `users`
- `patients`
- `doctors`
- `appointments`
- `medical_records`
- `activity_logs`
- `schema_migrations`

## Key Relationships
- `users.organization_id -> organizations.id`
- `patients.organization_id -> organizations.id`
- `doctors.organization_id -> organizations.id`
- `appointments.organization_id -> organizations.id`
- `appointments.patient_id -> patients.id`
- `appointments.doctor_id -> doctors.id`
- `medical_records.organization_id -> organizations.id`
- `medical_records.patient_id -> patients.id`
- `medical_records.doctor_id -> doctors.id`
- `activity_logs.organization_id -> organizations.id`

## Migration Strategy
- SQL files in `backend/migrations`
- Applied once and tracked in `schema_migrations`
- Run with `npm run migrate`

## Seed Strategy
- SQL seed files in `backend/seeds`
- Run with `npm run seed`
- Includes a sample organization/admin/patients/doctors/appointments/records/activity
