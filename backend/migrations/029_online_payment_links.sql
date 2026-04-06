CREATE TABLE IF NOT EXISTS invoice_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_link_id TEXT NOT NULL,
  short_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  provider_payment_id TEXT,
  provider_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_payment_links_provider_check CHECK (provider IN ('razorpay')),
  CONSTRAINT invoice_payment_links_status_check CHECK (
    status IN ('created', 'partially_paid', 'paid', 'cancelled', 'expired', 'failed')
  ),
  CONSTRAINT uq_invoice_payment_links_provider UNIQUE (provider, provider_link_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_links_org_invoice_time
  ON invoice_payment_links (organization_id, invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_links_provider_status
  ON invoice_payment_links (provider, status, updated_at DESC);
