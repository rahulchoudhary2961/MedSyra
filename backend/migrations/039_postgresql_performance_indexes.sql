CREATE INDEX IF NOT EXISTS idx_appointments_org_patient_date_time
  ON appointments (organization_id, patient_id, appointment_date DESC, appointment_time DESC)
  WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_org_doctor_date_time
  ON appointments (organization_id, doctor_id, appointment_date DESC, appointment_time DESC)
  WHERE doctor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medical_records_org_patient_date_created
  ON medical_records (organization_id, patient_id, record_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_medical_records_org_doctor_date_created
  ON medical_records (organization_id, doctor_id, record_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_medical_records_org_branch_follow_up_date
  ON medical_records (organization_id, branch_id, follow_up_date)
  WHERE follow_up_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispense_items_medicine_dispense
  ON pharmacy_dispense_items (medicine_id, dispense_id);

CREATE INDEX IF NOT EXISTS idx_invoices_org_patient_date
  ON invoices (organization_id, patient_id, issue_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_org_status_method_paid
  ON payments (organization_id, status, method, paid_at DESC);
