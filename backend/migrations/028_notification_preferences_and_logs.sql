CREATE TABLE IF NOT EXISTS notification_preferences (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  appointment_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  follow_up_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  follow_up_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  staff_schedule_email_enabled BOOLEAN NOT NULL DEFAULT true,
  staff_schedule_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  reference_id UUID,
  recipient TEXT,
  message_preview TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_logs_type_check CHECK (
    notification_type IN (
      'appointment_reminder',
      'follow_up_reminder',
      'staff_daily_schedule',
      'appointment_no_show'
    )
  ),
  CONSTRAINT notification_logs_channel_check CHECK (
    channel IN ('whatsapp', 'sms', 'email')
  ),
  CONSTRAINT notification_logs_status_check CHECK (
    status IN ('sent', 'failed', 'fallback', 'opened', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_org_time
  ON notification_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_org_type_status
  ON notification_logs (organization_id, notification_type, status, created_at DESC);

ALTER TABLE medical_records
  DROP CONSTRAINT IF EXISTS medical_records_follow_up_reminder_status_check;

ALTER TABLE medical_records
  ADD CONSTRAINT medical_records_follow_up_reminder_status_check
  CHECK (follow_up_reminder_status IN ('pending', 'sent', 'failed', 'skipped', 'disabled'));
