ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS consultation_fee NUMERIC(12,2);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE RESTRICT;

UPDATE appointments a
SET patient_id = p.id,
    patient_identifier = p.id::text
FROM patients p
WHERE a.organization_id = p.organization_id
  AND a.patient_id IS NULL
  AND a.patient_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND p.id::text = a.patient_identifier;
