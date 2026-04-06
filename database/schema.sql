CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  role TEXT NOT NULL,
  notify_daily_schedule_sms BOOLEAN NOT NULL DEFAULT false,
  notify_daily_schedule_email BOOLEAN NOT NULL DEFAULT true,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  patient_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  age INT,
  date_of_birth DATE,
  gender TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  blood_type TEXT,
  emergency_contact TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_visit_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_org_status ON patients (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_patients_org_created_at ON patients (organization_id, created_at DESC) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_code ON patients (organization_id, patient_code);

CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  experience_years INT,
  availability TEXT,
  phone TEXT,
  email TEXT,
  work_start_time TIME,
  work_end_time TIME,
  break_start_time TIME,
  break_end_time TIME,
  weekly_off_days TEXT,
  holiday_dates TEXT,
  consultation_fee NUMERIC(12,2),
  rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  patient_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_org_status ON doctors (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_doctors_org_full_name ON doctors (organization_id, full_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_doctors_org_user_id
ON doctors (organization_id, user_id)
WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE RESTRICT,
  patient_name TEXT,
  patient_identifier TEXT,
  mobile_number TEXT,
  email TEXT,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 15,
  planned_procedures TEXT,
  notes TEXT,
  reminder_3d_sent_at TIMESTAMPTZ,
  reminder_1d_sent_at TIMESTAMPTZ,
  reminder_same_day_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_status_check CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'checked-in', 'no-show'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_org_date_time
ON appointments (organization_id, appointment_date, appointment_time);

CREATE TABLE IF NOT EXISTS medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  record_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  record_date DATE NOT NULL,
  symptoms TEXT,
  diagnosis TEXT,
  prescription TEXT,
  follow_up_date DATE,
  follow_up_reminder_status TEXT NOT NULL DEFAULT 'pending',
  follow_up_reminder_sent_at TIMESTAMPTZ,
  follow_up_reminder_error TEXT,
  follow_up_reminder_last_attempt_at TIMESTAMPTZ,
  notes TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT medical_records_follow_up_reminder_status_check CHECK (follow_up_reminder_status IN ('pending', 'sent', 'failed', 'skipped', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_medical_records_org_date ON medical_records (organization_id, record_date);
CREATE INDEX IF NOT EXISTS idx_medical_records_org_follow_up_date ON medical_records (organization_id, follow_up_date) WHERE follow_up_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  entity_name TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_org_time ON activity_logs (organization_id, event_time DESC);

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
    notification_type IN ('appointment_reminder', 'follow_up_reminder', 'staff_daily_schedule', 'appointment_no_show')
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

CREATE TABLE IF NOT EXISTS sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activation_type TEXT NOT NULL,
  status TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  city TEXT,
  message TEXT,
  requested_plan_tier TEXT,
  demo_date DATE,
  demo_time TIME,
  demo_timezone TEXT,
  next_follow_up_at TIMESTAMPTZ,
  auto_follow_up_sent_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_leads_activation_type_check CHECK (activation_type IN ('demo', 'trial')),
  CONSTRAINT sales_leads_status_check CHECK (
    status IN (
      'demo_requested',
      'demo_scheduled',
      'trial_requested',
      'trial_provisioned',
      'follow_up_due',
      'contacted',
      'closed_won',
      'closed_lost'
    )
  ),
  CONSTRAINT sales_leads_requested_plan_tier_check CHECK (
    requested_plan_tier IS NULL OR requested_plan_tier IN ('starter', 'growth', 'enterprise')
  )
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_status_created_at
  ON sales_leads (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_leads_follow_up
  ON sales_leads (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND auto_follow_up_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_leads_email_created_at
  ON sales_leads (LOWER(email), created_at DESC);


CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notify_daily_schedule_sms BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_daily_schedule_email BOOLEAN NOT NULL DEFAULT true;

UPDATE users
SET email_verified_at = COALESCE(email_verified_at, NOW())
WHERE email = 'admin@citygeneral.com';

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_phone_active
ON patients (organization_id, regexp_replace(phone, '[^0-9]', '', 'g'))
WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_email_active
ON patients (organization_id, lower(email))
WHERE is_active = true AND email IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invoice_number TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id),
  doctor_id UUID REFERENCES doctors(id),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_org_number ON invoices (organization_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_org_appointment ON invoices (organization_id, appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_org_status_date ON invoices (organization_id, status, issue_date DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_status_check CHECK (status IN ('completed', 'failed', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_payments_org_invoice ON payments (organization_id, invoice_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS billing_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_audit_logs_action_check CHECK (
    action IN (
      'invoice_created',
      'invoice_updated',
      'invoice_issued',
      'payment_recorded',
      'payment_refunded',
      'invoice_marked_paid',
      'invoice_deleted'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_logs_org_time
  ON billing_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_audit_logs_invoice_time
  ON billing_audit_logs (invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'starter',
  base_plan_price NUMERIC(12,2) NOT NULL DEFAULT 799,
  monthly_included_credits INT NOT NULL DEFAULT 100,
  topup_price NUMERIC(12,2) NOT NULL DEFAULT 199,
  topup_credit_amount INT NOT NULL DEFAULT 200,
  ai_credits_per_query INT NOT NULL DEFAULT 1,
  message_credits_per_unit INT NOT NULL DEFAULT 1,
  default_ai_cost_per_query NUMERIC(10,2) NOT NULL DEFAULT 1,
  default_message_cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_pricing_config_plan_tier_check CHECK (plan_tier IN ('starter', 'growth', 'enterprise')),
  CONSTRAINT organization_pricing_config_monthly_included_credits_check CHECK (monthly_included_credits >= 0),
  CONSTRAINT organization_pricing_config_topup_credit_amount_check CHECK (topup_credit_amount > 0),
  CONSTRAINT organization_pricing_config_ai_credits_check CHECK (ai_credits_per_query >= 0),
  CONSTRAINT organization_pricing_config_message_credits_check CHECK (message_credits_per_unit >= 0),
  CONSTRAINT organization_pricing_config_base_plan_price_check CHECK (base_plan_price >= 0),
  CONSTRAINT organization_pricing_config_topup_price_check CHECK (topup_price >= 0),
  CONSTRAINT organization_pricing_config_ai_cost_check CHECK (default_ai_cost_per_query >= 0),
  CONSTRAINT organization_pricing_config_message_cost_check CHECK (default_message_cost_per_unit >= 0)
);

CREATE TABLE IF NOT EXISTS organization_credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  current_balance INT NOT NULL DEFAULT 0,
  monthly_included_credits INT NOT NULL DEFAULT 100,
  low_balance_threshold INT NOT NULL DEFAULT 20,
  last_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_credit_wallets_balance_check CHECK (current_balance >= 0),
  CONSTRAINT organization_credit_wallets_monthly_credits_check CHECK (monthly_included_credits >= 0),
  CONSTRAINT organization_credit_wallets_low_balance_threshold_check CHECK (low_balance_threshold >= 0)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL,
  credits_delta INT NOT NULL,
  rupee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  source_feature TEXT,
  reference_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_transactions_type_check CHECK (
    transaction_type IN ('monthly_grant', 'top_up', 'usage_debit', 'manual_adjustment', 'expiry')
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_org_time
  ON credit_transactions (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_org_type
  ON credit_transactions (organization_id, transaction_type, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_usage_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  usage_month DATE NOT NULL,
  ai_queries_used INT NOT NULL DEFAULT 0,
  ai_cost_per_query NUMERIC(10,2) NOT NULL DEFAULT 0,
  ai_cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  messages_used INT NOT NULL DEFAULT 0,
  message_cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
  message_cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  credits_consumed INT NOT NULL DEFAULT 0,
  included_credits_granted INT NOT NULL DEFAULT 0,
  topup_credits_purchased INT NOT NULL DEFAULT 0,
  topup_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  infra_cost_share NUMERIC(12,2) NOT NULL DEFAULT 0,
  base_plan_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, usage_month),
  CONSTRAINT organization_usage_monthly_ai_queries_check CHECK (ai_queries_used >= 0),
  CONSTRAINT organization_usage_monthly_messages_check CHECK (messages_used >= 0),
  CONSTRAINT organization_usage_monthly_credits_check CHECK (credits_consumed >= 0),
  CONSTRAINT organization_usage_monthly_granted_check CHECK (included_credits_granted >= 0),
  CONSTRAINT organization_usage_monthly_topup_check CHECK (topup_credits_purchased >= 0)
);

CREATE INDEX IF NOT EXISTS idx_organization_usage_monthly_month
  ON organization_usage_monthly (usage_month DESC);

CREATE TABLE IF NOT EXISTS platform_infra_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_month DATE NOT NULL UNIQUE,
  total_infra_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  active_clinics INT NOT NULL DEFAULT 0,
  infra_cost_per_clinic NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_infra_monthly_total_cost_check CHECK (total_infra_cost >= 0),
  CONSTRAINT platform_infra_monthly_active_clinics_check CHECK (active_clinics >= 0),
  CONSTRAINT platform_infra_monthly_cost_per_clinic_check CHECK (infra_cost_per_clinic >= 0)
);


