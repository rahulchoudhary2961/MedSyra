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

INSERT INTO organization_pricing_config (organization_id)
SELECT o.id
FROM organizations o
LEFT JOIN organization_pricing_config opc
  ON opc.organization_id = o.id
WHERE opc.organization_id IS NULL;

INSERT INTO organization_credit_wallets (
  organization_id,
  current_balance,
  monthly_included_credits,
  low_balance_threshold
)
SELECT
  opc.organization_id,
  0,
  opc.monthly_included_credits,
  20
FROM organization_pricing_config opc
LEFT JOIN organization_credit_wallets ocw
  ON ocw.organization_id = opc.organization_id
WHERE ocw.organization_id IS NULL;
