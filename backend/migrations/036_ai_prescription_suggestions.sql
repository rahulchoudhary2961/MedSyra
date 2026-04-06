CREATE TABLE IF NOT EXISTS ai_prescription_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  generated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'generated',
  input_symptoms TEXT,
  input_diagnosis TEXT,
  input_notes TEXT,
  clinical_summary TEXT,
  prescription_text TEXT,
  suggestion_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  care_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  guardrails JSONB NOT NULL DEFAULT '[]'::jsonb,
  red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'low',
  disclaimer TEXT NOT NULL,
  suggestion_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  patient_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  model_name TEXT NOT NULL DEFAULT 'openai/gpt-oss-120b',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_prescription_suggestions_status_check CHECK (status IN ('generated', 'accepted', 'rejected')),
  CONSTRAINT ai_prescription_suggestions_confidence_check CHECK (confidence IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS idx_ai_prescription_suggestions_org_branch_created
  ON ai_prescription_suggestions (organization_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_prescription_suggestions_org_patient_created
  ON ai_prescription_suggestions (organization_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_prescription_suggestions_org_appointment_created
  ON ai_prescription_suggestions (organization_id, appointment_id, created_at DESC)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_prescription_suggestions_org_record_created
  ON ai_prescription_suggestions (organization_id, medical_record_id, created_at DESC)
  WHERE medical_record_id IS NOT NULL;
