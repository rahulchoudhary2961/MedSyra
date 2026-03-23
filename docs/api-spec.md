# API Spec (v1)

API base URL: `http://localhost:5000/api/v1`
Health endpoint: `http://localhost:5000/health`

All protected routes require header:
`Authorization: Bearer <jwt>`

## Auth & Security
- Passwords are hashed with `bcrypt`.
- JWT sessions expire (configurable with `JWT_EXPIRES_IN`, default `1h`).
- New accounts must verify email before sign in.
- Password reset tokens and email verification tokens expire.
- Auth endpoints are rate limited.
- Login attempts are tracked; accounts are temporarily locked after repeated failures.

## Auth Endpoints
- `POST /auth/signup`
  - body: `{ fullName, email, phone, role, hospitalName, password }`
- `POST /auth/signin`
  - body: `{ email, password }`
- `POST /auth/verify-email`
  - body: `{ email, token }`
- `POST /auth/resend-verification`
  - body: `{ email }`
- `POST /auth/request-password-reset`
  - body: `{ email }`
- `POST /auth/reset-password`
  - body: `{ email, token, newPassword }`
- `GET /auth/me` (protected)

## Patients (protected)
- `GET /patients?q=&status=&page=&limit=`
- `POST /patients`
  - body: `{ fullName, age, gender, phone, email, bloodType, emergencyContact, address, status, lastVisitAt }`
- `GET /patients/:id`
- `PATCH /patients/:id`
- `DELETE /patients/:id` (soft delete)

## Doctors (protected)
- `GET /doctors`
- `POST /doctors`
  - body: `{ fullName, specialty, experienceYears, availability, phone, email, rating, patientCount, status }`

## Appointments (protected)
- `GET /appointments?date=&doctorId=&status=&page=&limit=`
- `POST /appointments`
  - body: `{ patientId, doctorId, appointmentDate, appointmentTime, appointmentType, status, notes, feeAmount }`
- `PATCH /appointments/:id/status`
  - body: `{ status }`

## Medical Records (protected)
- `GET /medical-records?q=&status=&page=&limit=`
- `POST /medical-records`
  - body: `{ patientId, doctorId, recordType, status, recordDate, notes, fileUrl }`
- `GET /medical-records/:id`
- `PATCH /medical-records/:id`
  - body: `{ patientId?, doctorId?, recordType?, status?, recordDate?, notes?, fileUrl? }`
- `DELETE /medical-records/:id`

## Billings (protected)
- `GET /billings?q=&status=&page=&limit=`
- `POST /billings`
  - body: `{ patientId, doctorId?, appointmentId?, description, amount, currency?, issueDate?, dueDate?, status?, notes? }`
- `GET /billings/:id`
- `PATCH /billings/:id`
  - body: `{ description?, amount?, dueDate?, status?, notes? }`
- `POST /billings/:id/issue`
  - body: `{ dueDate? }`
- `POST /billings/:id/payments`
  - body: `{ amount, method, reference?, status?, paidAt? }`
- `GET /billings/:id/pdf`
- `DELETE /billings/:id` (draft-only)

## Dashboard (protected)
- `GET /dashboard/summary`
  - returns `totalPatients`, `todaysAppointments`, `availableDoctors`, `monthlyRevenue`, and recent activity
- `GET /dashboard/reports`
  - returns:
    - `stats`: `{ totalPatients, totalAppointments, revenue3m, growthRate }`
    - `monthlyData`: `[{ month, patients, revenue, appointments }]`
    - `departmentData`: `[{ name, value }]`
    - `appointmentTypes`: `[{ type, count }]`

## Seed Credentials
- Email: `admin@citygeneral.com`
- Password: `Admin@123`
