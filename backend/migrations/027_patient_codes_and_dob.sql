ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS patient_code TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

WITH ranked_patients AS (
  SELECT
    id,
    organization_id,
    ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at ASC, id ASC) AS sequence_number
  FROM patients
  WHERE patient_code IS NULL
)
UPDATE patients p
SET patient_code = CONCAT('PAT-', LPAD(r.sequence_number::text, 4, '0'))
FROM ranked_patients r
WHERE p.id = r.id;

UPDATE appointments a
SET patient_identifier = p.patient_code
FROM patients p
WHERE a.patient_id = p.id
  AND a.organization_id = p.organization_id
  AND p.patient_code IS NOT NULL
  AND a.patient_identifier IS DISTINCT FROM p.patient_code;

ALTER TABLE patients
  ALTER COLUMN patient_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_code
  ON patients (organization_id, patient_code);
