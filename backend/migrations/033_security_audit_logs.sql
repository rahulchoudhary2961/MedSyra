CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  entity_label TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  outcome TEXT NOT NULL DEFAULT 'success',
  is_destructive BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  path TEXT,
  method TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_severity_check CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT audit_logs_outcome_check CHECK (outcome IN ('success', 'denied', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_time
  ON audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_module_time
  ON audit_logs (organization_id, module, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_outcome_time
  ON audit_logs (organization_id, outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_destructive_time
  ON audit_logs (organization_id, is_destructive, created_at DESC);
