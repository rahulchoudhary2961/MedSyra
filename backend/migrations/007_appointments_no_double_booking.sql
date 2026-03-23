WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, doctor_id, appointment_date, appointment_time
      ORDER BY
        CASE status WHEN 'confirmed' THEN 0 ELSE 1 END,
        created_at ASC
    ) AS rn
  FROM appointments
  WHERE status IN ('pending', 'confirmed')
),
to_cancel AS (
  SELECT id
  FROM ranked_duplicates
  WHERE rn > 1
)
UPDATE appointments
SET
  status = 'cancelled',
  notes = CASE
    WHEN notes IS NULL OR notes = '' THEN 'Auto-cancelled during migration to remove duplicate active slot'
    ELSE notes || ' | Auto-cancelled during migration to remove duplicate active slot'
  END,
  updated_at = NOW()
WHERE id IN (SELECT id FROM to_cancel);

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_doctor_slot
ON appointments (organization_id, doctor_id, appointment_date, appointment_time)
WHERE status IN ('pending', 'confirmed');
