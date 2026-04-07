CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_code TEXT,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_org_code
  ON branches (organization_id, branch_code)
  WHERE branch_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_org_default
  ON branches (organization_id)
  WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_branches_org_active_name
  ON branches (organization_id, is_active, name);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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

CREATE INDEX IF NOT EXISTS idx_users_org_branch_role
  ON users (organization_id, branch_id, role);

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
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_appointments_org_branch_date_time
ON appointments (organization_id, branch_id, appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS idx_appointments_org_patient_date_time
  ON appointments (organization_id, patient_id, appointment_date DESC, appointment_time DESC)
  WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_org_doctor_date_time
  ON appointments (organization_id, doctor_id, appointment_date DESC, appointment_time DESC)
  WHERE doctor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_medical_records_org_branch_date
  ON medical_records (organization_id, branch_id, record_date DESC);
CREATE INDEX IF NOT EXISTS idx_medical_records_org_patient_date_created
  ON medical_records (organization_id, patient_id, record_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_records_org_doctor_date_created
  ON medical_records (organization_id, doctor_id, record_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_records_org_branch_follow_up_date
  ON medical_records (organization_id, branch_id, follow_up_date)
  WHERE follow_up_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS prescription_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  template_text TEXT NOT NULL,
  diagnosis_hint TEXT,
  notes_hint TEXT,
  use_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescription_templates_org_user_branch_updated
  ON prescription_templates (organization_id, created_by_user_id, branch_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS favorite_medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
  medicine_name TEXT NOT NULL,
  generic_name TEXT,
  dosage_form TEXT,
  strength TEXT,
  preferred_sig TEXT NOT NULL,
  use_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_favorite_medicines_org_user_branch_updated
  ON favorite_medicines (organization_id, created_by_user_id, branch_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorite_medicines_org_medicine
  ON favorite_medicines (organization_id, medicine_id, updated_at DESC)
  WHERE medicine_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  source_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  source_appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  due_date DATE NOT NULL,
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_contacted_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  outcome_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_tasks_type_check CHECK (task_type IN ('follow_up', 'recall', 'retention')),
  CONSTRAINT crm_tasks_priority_check CHECK (priority IN ('high', 'medium', 'low')),
  CONSTRAINT crm_tasks_status_check CHECK (status IN ('open', 'contacted', 'scheduled', 'not_reachable', 'closed', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_status_due
  ON crm_tasks (organization_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_patient_created
  ON crm_tasks (organization_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_type_due
  ON crm_tasks (organization_id, task_type, due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_branch_status_due
  ON crm_tasks (organization_id, branch_id, status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_tasks_follow_up_source
  ON crm_tasks (organization_id, task_type, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  turnaround_hours INT NOT NULL DEFAULT 24,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_tests_org_active
  ON lab_tests (organization_id, is_active, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_tests_org_code
  ON lab_tests (organization_id, code)
  WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  ordered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ordered',
  ordered_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  notes TEXT,
  report_file_url TEXT,
  sample_collected_at TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  report_ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lab_orders_status_check CHECK (
    status IN ('ordered', 'sample_collected', 'processing', 'report_ready', 'completed', 'cancelled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_orders_org_number
  ON lab_orders (organization_id, order_number);
CREATE INDEX IF NOT EXISTS idx_lab_orders_org_status_date
  ON lab_orders (organization_id, status, ordered_date DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_org_patient
  ON lab_orders (organization_id, patient_id, ordered_date DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_org_branch_status_date
  ON lab_orders (organization_id, branch_id, status, ordered_date DESC);

CREATE TABLE IF NOT EXISTS lab_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  lab_test_id UUID REFERENCES lab_tests(id) ON DELETE SET NULL,
  test_name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  result_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_order_items_order
  ON lab_order_items (lab_order_id, created_at ASC);

CREATE TABLE IF NOT EXISTS medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  generic_name TEXT,
  dosage_form TEXT,
  strength TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  reorder_level NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicines_org_active_name
  ON medicines (organization_id, is_active, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_medicines_org_code
  ON medicines (organization_id, code)
  WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS medicine_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  manufacturer TEXT,
  expiry_date DATE NOT NULL,
  received_quantity NUMERIC(12,2) NOT NULL,
  available_quantity NUMERIC(12,2) NOT NULL,
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT medicine_batches_received_quantity_check CHECK (received_quantity > 0),
  CONSTRAINT medicine_batches_available_quantity_check CHECK (available_quantity >= 0),
  CONSTRAINT medicine_batches_price_check CHECK (purchase_price >= 0 AND sale_price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_medicine_batches_org_batch
  ON medicine_batches (organization_id, medicine_id, batch_number);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_org_expiry
  ON medicine_batches (organization_id, expiry_date, available_quantity DESC);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_org_medicine
  ON medicine_batches (organization_id, medicine_id, expiry_date ASC);

CREATE TABLE IF NOT EXISTS pharmacy_dispenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dispense_number TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
  invoice_id UUID,
  dispensed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'dispensed',
  dispensed_date DATE NOT NULL DEFAULT CURRENT_DATE,
  prescription_snapshot TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pharmacy_dispenses_status_check CHECK (status IN ('dispensed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_dispenses_org_number
  ON pharmacy_dispenses (organization_id, dispense_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_dispenses_org_invoice
  ON pharmacy_dispenses (organization_id, invoice_id)
  WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacy_dispenses_org_patient_date
  ON pharmacy_dispenses (organization_id, patient_id, dispensed_date DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_dispenses_org_status_date
  ON pharmacy_dispenses (organization_id, status, dispensed_date DESC);

CREATE TABLE IF NOT EXISTS pharmacy_dispense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispense_id UUID NOT NULL REFERENCES pharmacy_dispenses(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  medicine_batch_id UUID NOT NULL REFERENCES medicine_batches(id) ON DELETE RESTRICT,
  medicine_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date DATE,
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  directions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pharmacy_dispense_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT pharmacy_dispense_items_price_check CHECK (unit_price >= 0 AND total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispense_items_dispense
  ON pharmacy_dispense_items (dispense_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_dispense_items_medicine_dispense
  ON pharmacy_dispense_items (medicine_id, dispense_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  reorder_level NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_org_active_name
  ON inventory_items (organization_id, is_active, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_items_org_code
  ON inventory_items (organization_id, code)
  WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  performed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_movements_type_check CHECK (
    movement_type IN ('stock_in', 'usage', 'wastage', 'adjustment_in', 'adjustment_out')
  ),
  CONSTRAINT inventory_movements_quantity_check CHECK (quantity > 0),
  CONSTRAINT inventory_movements_cost_check CHECK (unit_cost >= 0 AND total_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_item_date
  ON inventory_movements (organization_id, item_id, movement_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_type_date
  ON inventory_movements (organization_id, movement_type, movement_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_branch_type_date
  ON inventory_movements (organization_id, branch_id, movement_type, movement_date DESC, created_at DESC);

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
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_insurance_claims_org_branch_status_due
  ON insurance_claims (organization_id, branch_id, status, response_due_date ASC, submitted_date DESC);

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

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  entity_name TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_org_time ON activity_logs (organization_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_org_branch_time
  ON activity_logs (organization_id, branch_id, event_time DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_branch_time
  ON audit_logs (organization_id, branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  appointment_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  follow_up_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  follow_up_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  staff_schedule_email_enabled BOOLEAN NOT NULL DEFAULT true,
  staff_schedule_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  smart_timing_enabled BOOLEAN NOT NULL DEFAULT true,
  appointment_lead_minutes INT NOT NULL DEFAULT 120,
  follow_up_send_hour INT NOT NULL DEFAULT 9,
  condition_based_follow_up_enabled BOOLEAN NOT NULL DEFAULT true,
  campaign_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  campaign_sms_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_preferences_appointment_lead_minutes_check CHECK (appointment_lead_minutes BETWEEN 15 AND 720),
  CONSTRAINT notification_preferences_follow_up_send_hour_check CHECK (follow_up_send_hour BETWEEN 6 AND 22)
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
    notification_type IN ('appointment_reminder', 'follow_up_reminder', 'staff_daily_schedule', 'appointment_no_show', 'marketing_campaign')
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
CREATE INDEX IF NOT EXISTS idx_notification_logs_org_branch_time
  ON notification_logs (organization_id, branch_id, created_at DESC);

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
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_invoices_org_branch_status_date
  ON invoices (organization_id, branch_id, status, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_org_patient_date
  ON invoices (organization_id, patient_id, issue_date DESC, created_at DESC);

ALTER TABLE pharmacy_dispenses
  DROP CONSTRAINT IF EXISTS pharmacy_dispenses_invoice_id_fkey;

ALTER TABLE pharmacy_dispenses
  ADD CONSTRAINT pharmacy_dispenses_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

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
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_payments_org_branch_invoice
  ON payments (organization_id, branch_id, invoice_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_org_status_method_paid
  ON payments (organization_id, status, method, paid_at DESC);

CREATE TABLE IF NOT EXISTS invoice_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_invoice_payment_links_org_branch_invoice_time
  ON invoice_payment_links (organization_id, branch_id, invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_links_provider_status
  ON invoice_payment_links (provider, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
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
CREATE INDEX IF NOT EXISTS idx_billing_audit_logs_org_branch_time
  ON billing_audit_logs (organization_id, branch_id, created_at DESC);

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


