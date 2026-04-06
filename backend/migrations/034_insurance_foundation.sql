CREATE TABLE IF NOT EXISTS insurance_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payer_code TEXT,
  name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  portal_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_providers_org_active_name
  ON insurance_providers (organization_id, is_active, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_insurance_providers_org_payer_code
  ON insurance_providers (organization_id, payer_code)
  WHERE payer_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_number TEXT NOT NULL,
  provider_id UUID NOT NULL REFERENCES insurance_providers(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  policy_number TEXT,
  member_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  claimed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  diagnosis_summary TEXT,
  treatment_summary TEXT,
  submitted_date DATE,
  response_due_date DATE,
  approved_date DATE,
  settled_date DATE,
  rejection_reason TEXT,
  notes TEXT,
  last_status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT insurance_claims_status_check CHECK (
    status IN ('draft', 'submitted', 'under_review', 'approved', 'partially_approved', 'rejected', 'settled', 'cancelled')
  ),
  CONSTRAINT insurance_claims_amounts_check CHECK (
    claimed_amount >= 0 AND approved_amount >= 0 AND paid_amount >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_insurance_claims_org_number
  ON insurance_claims (organization_id, claim_number);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_org_status_due
  ON insurance_claims (organization_id, status, response_due_date ASC, submitted_date DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_org_patient_created
  ON insurance_claims (organization_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_org_provider_status
  ON insurance_claims (organization_id, provider_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_org_invoice
  ON insurance_claims (organization_id, invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS insurance_claim_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES insurance_claims(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT insurance_claim_events_type_check CHECK (
    event_type IN ('claim_created', 'claim_submitted', 'status_changed', 'claim_updated', 'approval_recorded', 'payment_recorded', 'note_added')
  )
);

CREATE INDEX IF NOT EXISTS idx_insurance_claim_events_claim_time
  ON insurance_claim_events (claim_id, created_at DESC);
