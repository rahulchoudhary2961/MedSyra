CREATE INDEX IF NOT EXISTS idx_doctors_org_full_name
ON doctors (organization_id, full_name);

CREATE INDEX IF NOT EXISTS idx_appointments_org_doctor_date_time
ON appointments (organization_id, doctor_id, appointment_date, appointment_time);

CREATE INDEX IF NOT EXISTS idx_appointments_org_status_date
ON appointments (organization_id, status, appointment_date);

CREATE INDEX IF NOT EXISTS idx_patients_org_created_at
ON patients (organization_id, created_at DESC)
WHERE is_active = true;

