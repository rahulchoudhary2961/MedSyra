ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_same_day_sent_at TIMESTAMPTZ;
