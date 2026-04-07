ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS smart_timing_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS appointment_lead_minutes INT NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS follow_up_send_hour INT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS condition_based_follow_up_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS campaign_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS campaign_sms_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_appointment_lead_minutes_check;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_appointment_lead_minutes_check
  CHECK (appointment_lead_minutes BETWEEN 15 AND 720);

ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_follow_up_send_hour_check;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_follow_up_send_hour_check
  CHECK (follow_up_send_hour BETWEEN 6 AND 22);

ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_type_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_type_check
  CHECK (
    notification_type IN (
      'appointment_reminder',
      'follow_up_reminder',
      'staff_daily_schedule',
      'appointment_no_show',
      'marketing_campaign'
    )
  );

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  template_key TEXT NOT NULL,
  condition_tag TEXT,
  body TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_templates_type_check CHECK (
    notification_type IN ('appointment_reminder', 'follow_up_reminder', 'marketing_campaign')
  ),
  CONSTRAINT notification_templates_channel_check CHECK (
    channel IN ('whatsapp', 'sms')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_templates_org_type_key
  ON notification_templates (organization_id, notification_type, channel, template_key);

CREATE INDEX IF NOT EXISTS idx_notification_templates_org_type_active
  ON notification_templates (organization_id, notification_type, is_active, is_default DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  audience_type TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES notification_templates(id) ON DELETE RESTRICT,
  channel_config JSONB NOT NULL DEFAULT '{"whatsapp": true, "sms": false}'::jsonb,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  total_recipients INT NOT NULL DEFAULT 0,
  successful_recipients INT NOT NULL DEFAULT 0,
  failed_recipients INT NOT NULL DEFAULT 0,
  notes TEXT,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_campaigns_audience_type_check CHECK (
    audience_type IN ('all_active', 'dormant_30', 'dormant_60', 'follow_up_due', 'chronic')
  ),
  CONSTRAINT notification_campaigns_status_check CHECK (
    status IN ('draft', 'scheduled', 'sent', 'partial', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_org_status_time
  ON notification_campaigns (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_org_branch_time
  ON notification_campaigns (organization_id, branch_id, created_at DESC);
