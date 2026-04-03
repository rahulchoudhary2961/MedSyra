ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_daily_schedule_sms BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_daily_schedule_email BOOLEAN NOT NULL DEFAULT true;
