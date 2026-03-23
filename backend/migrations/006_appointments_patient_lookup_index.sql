CREATE INDEX IF NOT EXISTS idx_appointments_org_patient_status_date
ON appointments (organization_id, patient_id, status, appointment_date DESC);

