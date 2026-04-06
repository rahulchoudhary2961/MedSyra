CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
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
