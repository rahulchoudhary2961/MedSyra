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
