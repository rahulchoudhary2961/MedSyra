# Credit-Based Profitability Design

## Goal

Track three cost buckets per clinic:

- AI usage cost
- Messaging usage cost
- Shared infra cost

Keep revenue simple:

- base plan revenue
- credit top-up revenue

Then calculate:

```text
Credits Used = AI Queries Used + Messages Used
Total Cost per Clinic = AI Cost + Messaging Cost + Infra Share
Total Revenue per Clinic = Base Plan Revenue + Credit Top-up Revenue
Profit = Total Revenue - Total Cost
```

## Commercial Model

Recommended commercial model:

- `Starter: Rs. 799 / month`
- `Growth: Rs. 1499 / month`
- `Scale: Rs. 3500 / month`
- `Enterprise: custom pricing`

Recommended included credit bundles:

- `Starter: 100 monthly credits`
- `Growth: 400 monthly credits`
- `Scale: 1200 monthly credits`
- `Enterprise: custom`

Recommended credit upsell:

- `Rs. 199 / 200 credits` standard top-up
- optional bulk packs can be added later without changing the core model

Recommended usage mapping:

- `1 AI query = 1 credit`
- `1 WhatsApp reminder = 1 credit`

This keeps the billing model clear while still tracking real underlying costs separately.

## Recommended Tables

### 1. `organization_credit_wallets`

One wallet per clinic for the current balance and reset settings.

```sql
CREATE TABLE organization_credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  current_balance INT NOT NULL DEFAULT 0,
  monthly_included_credits INT NOT NULL DEFAULT 100,
  low_balance_threshold INT NOT NULL DEFAULT 20,
  last_reset_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2. `credit_transactions`

Ledger for grants, top-ups, usage debits, and manual adjustments.

```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  transaction_type TEXT NOT NULL,
  credits_delta INT NOT NULL,
  rupee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  source_feature TEXT,
  reference_id UUID,
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Recommended `transaction_type` values:

- `monthly_grant`
- `top_up`
- `usage_debit`
- `manual_adjustment`
- `expiry`

### 3. `organization_usage_monthly`

Monthly profitability snapshot per clinic.

```sql
CREATE TABLE organization_usage_monthly (
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

  UNIQUE (organization_id, usage_month)
);
```

### 4. `organization_pricing_config`

Commercial defaults per clinic. `base_plan_price` stores the assigned subscription price for the clinic's tier.

```sql
CREATE TABLE organization_pricing_config (
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5. `platform_infra_monthly`

Shared monthly infra pool.

```sql
CREATE TABLE platform_infra_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_month DATE NOT NULL UNIQUE,
  total_infra_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  active_clinics INT NOT NULL DEFAULT 0,
  infra_cost_per_clinic NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Optional Event Tables

If you want auditability later, keep raw events and roll them into the monthly snapshot.

### `ai_usage_events`

```sql
CREATE TABLE ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  feature_name TEXT NOT NULL,
  query_count INT NOT NULL DEFAULT 1,
  credits_consumed INT NOT NULL DEFAULT 1,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `message_usage_events`

```sql
CREATE TABLE message_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message_type TEXT NOT NULL,
  message_count INT NOT NULL DEFAULT 1,
  credits_consumed INT NOT NULL DEFAULT 1,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Recommended Calculation Flow

Run daily or month-end:

1. Count AI usage for the clinic.
2. Count messaging usage for the clinic.
3. Compute `credits_consumed = ai_queries_used + messages_used`.
4. Read credit purchases from `credit_transactions`.
5. Read the clinic's pricing config for its assigned tier, included credits, and top-up pricing.
6. Read the shared infra pool for the same month.
7. Compute:
   - `ai_cost_total = ai_queries_used * ai_cost_per_query`
   - `message_cost_total = messages_used * message_cost_per_unit`
   - `infra_cost_share = total_infra_cost / active_clinics`
   - `total_cost = ai_cost_total + message_cost_total + infra_cost_share`
   - `total_revenue = base_plan_revenue + topup_revenue`
   - `profit_amount = total_revenue - total_cost`
8. Upsert into `organization_usage_monthly`.

## Pricing Recommendation

Use the subscription tier as the primary sale and credits as the expansion revenue layer:

- `Starter`
  - `Rs. 799 / month`
  - suitable for solo and early-stage clinics
- `Growth`
  - `Rs. 1499 / month`
  - suitable for multi-doctor clinics and busier admin workflows
- `Scale`
  - `Rs. 3500 / month`
  - suitable for larger clinic teams and heavier daily usage
- `Enterprise`
  - custom pricing
  - suitable for chains, hospital groups, and tailored rollouts

This keeps entry pricing accessible while still letting MedSyra grow revenue through automation and messaging usage.

## MVP Recommendation

Start with these tables:

- `organization_credit_wallets`
- `credit_transactions`
- `organization_usage_monthly`
- `organization_pricing_config`
- `platform_infra_monthly`

This is enough for:

- wallet balance tracking
- low-balance alerts
- monthly profitability reporting
- clinic-level margin visibility

Add raw event tables only when you need:

- audit history
- feature-level AI costing
- message-level delivery accounting
