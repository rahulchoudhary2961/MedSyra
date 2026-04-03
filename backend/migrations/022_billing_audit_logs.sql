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
      'invoice_marked_paid',
      'invoice_deleted'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_logs_org_time
  ON billing_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_audit_logs_invoice_time
  ON billing_audit_logs (invoice_id, created_at DESC);
