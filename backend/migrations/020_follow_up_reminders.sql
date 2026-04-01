ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS follow_up_reminder_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS follow_up_reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_reminder_error TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_reminder_last_attempt_at TIMESTAMPTZ;

UPDATE medical_records
SET follow_up_reminder_status = 'pending'
WHERE follow_up_reminder_status IS NULL;

ALTER TABLE medical_records
  DROP CONSTRAINT IF EXISTS medical_records_follow_up_reminder_status_check;

ALTER TABLE medical_records
  ADD CONSTRAINT medical_records_follow_up_reminder_status_check
  CHECK (follow_up_reminder_status IN ('pending', 'sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_medical_records_org_follow_up_date
ON medical_records (organization_id, follow_up_date)
WHERE follow_up_date IS NOT NULL;
