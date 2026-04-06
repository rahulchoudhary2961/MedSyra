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

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_org_name
  ON branches (organization_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_org_code
  ON branches (organization_id, branch_code)
  WHERE branch_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_branches_org_default
  ON branches (organization_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_branches_org_active
  ON branches (organization_id, is_active, name);

INSERT INTO branches (organization_id, branch_code, name, is_default)
SELECT o.id, 'MAIN', 'Main Branch', true
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM branches b
  WHERE b.organization_id = o.id
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE users u
SET branch_id = b.id
FROM branches b
WHERE b.organization_id = u.organization_id
  AND b.is_default = true
  AND u.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_branch_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE users
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_org_branch_role
  ON users (organization_id, branch_id, role);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE appointments a
SET branch_id = b.id
FROM branches b
WHERE b.organization_id = a.organization_id
  AND b.is_default = true
  AND a.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_branch_id_fkey'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE appointments
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_org_branch_date_time
  ON appointments (organization_id, branch_id, appointment_date, appointment_time);

ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE medical_records mr
SET branch_id = COALESCE(
  (
    SELECT a.branch_id
    FROM appointments a
    WHERE a.id = mr.appointment_id
      AND a.organization_id = mr.organization_id
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = mr.organization_id
      AND b.is_default = true
    LIMIT 1
  )
)
WHERE mr.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'medical_records_branch_id_fkey'
  ) THEN
    ALTER TABLE medical_records
      ADD CONSTRAINT medical_records_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE medical_records
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medical_records_org_branch_date
  ON medical_records (organization_id, branch_id, record_date DESC);

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE crm_tasks ct
SET branch_id = COALESCE(
  (
    SELECT mr.branch_id
    FROM medical_records mr
    WHERE mr.id = ct.source_record_id
      AND mr.organization_id = ct.organization_id
    LIMIT 1
  ),
  (
    SELECT a.branch_id
    FROM appointments a
    WHERE a.id = ct.source_appointment_id
      AND a.organization_id = ct.organization_id
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = ct.organization_id
      AND b.is_default = true
    LIMIT 1
  )
)
WHERE ct.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_tasks_branch_id_fkey'
  ) THEN
    ALTER TABLE crm_tasks
      ADD CONSTRAINT crm_tasks_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE crm_tasks
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_org_branch_due
  ON crm_tasks (organization_id, branch_id, due_date, status);

ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE lab_orders lo
SET branch_id = COALESCE(
  (
    SELECT a.branch_id
    FROM appointments a
    WHERE a.id = lo.appointment_id
      AND a.organization_id = lo.organization_id
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = lo.organization_id
      AND b.is_default = true
    LIMIT 1
  )
)
WHERE lo.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lab_orders_branch_id_fkey'
  ) THEN
    ALTER TABLE lab_orders
      ADD CONSTRAINT lab_orders_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE lab_orders
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lab_orders_org_branch_status_date
  ON lab_orders (organization_id, branch_id, status, ordered_date DESC);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE invoices i
SET branch_id = COALESCE(
  (
    SELECT a.branch_id
    FROM appointments a
    WHERE a.id = i.appointment_id
      AND a.organization_id = i.organization_id
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = i.organization_id
      AND b.is_default = true
    LIMIT 1
  )
)
WHERE i.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_branch_id_fkey'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE invoices
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_org_branch_status_date
  ON invoices (organization_id, branch_id, status, issue_date DESC);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE payments p
SET branch_id = COALESCE(
  (
    SELECT i.branch_id
    FROM invoices i
    WHERE i.id = p.invoice_id
      AND i.organization_id = p.organization_id
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = p.organization_id
      AND b.is_default = true
    LIMIT 1
  )
)
WHERE p.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_branch_id_fkey'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE payments
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_org_branch_invoice
  ON payments (organization_id, branch_id, invoice_id, paid_at DESC);

ALTER TABLE invoice_payment_links
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE invoice_payment_links link
SET branch_id = COALESCE(
  (
    SELECT i.branch_id
    FROM invoices i
    WHERE i.id = link.invoice_id
      AND i.organization_id = link.organization_id
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = link.organization_id
      AND b.is_default = true
    LIMIT 1
  )
)
WHERE link.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoice_payment_links_branch_id_fkey'
  ) THEN
    ALTER TABLE invoice_payment_links
      ADD CONSTRAINT invoice_payment_links_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE invoice_payment_links
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_payment_links_org_branch_invoice_time
  ON invoice_payment_links (organization_id, branch_id, invoice_id, created_at DESC);

ALTER TABLE insurance_claims
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE insurance_claims ic
SET branch_id = COALESCE(
  (
    SELECT i.branch_id
    FROM invoices i
    WHERE i.id = ic.invoice_id
      AND i.organization_id = ic.organization_id
    LIMIT 1
  ),
  (
    SELECT mr.branch_id
    FROM medical_records mr
    WHERE mr.id = ic.medical_record_id
      AND mr.organization_id = ic.organization_id
    LIMIT 1
  ),
  (
    SELECT a.branch_id
    FROM appointments a
    WHERE a.id = ic.appointment_id
      AND a.organization_id = ic.organization_id
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = ic.organization_id
      AND b.is_default = true
    LIMIT 1
  )
)
WHERE ic.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'insurance_claims_branch_id_fkey'
  ) THEN
    ALTER TABLE insurance_claims
      ADD CONSTRAINT insurance_claims_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE insurance_claims
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_claims_org_branch_status_due
  ON insurance_claims (organization_id, branch_id, status, response_due_date ASC, submitted_date DESC);

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE inventory_movements im
SET branch_id = (
  SELECT b.id
  FROM branches b
  WHERE b.organization_id = im.organization_id
    AND b.is_default = true
  LIMIT 1
)
WHERE im.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_movements_branch_id_fkey'
  ) THEN
    ALTER TABLE inventory_movements
      ADD CONSTRAINT inventory_movements_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE inventory_movements
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_branch_type_date
  ON inventory_movements (organization_id, branch_id, movement_type, movement_date DESC, created_at DESC);

ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE activity_logs al
SET branch_id = (
  SELECT b.id
  FROM branches b
  WHERE b.organization_id = al.organization_id
    AND b.is_default = true
  LIMIT 1
)
WHERE al.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activity_logs_branch_id_fkey'
  ) THEN
    ALTER TABLE activity_logs
      ADD CONSTRAINT activity_logs_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE activity_logs
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_org_branch_time
  ON activity_logs (organization_id, branch_id, event_time DESC);

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE audit_logs al
SET branch_id = (
  SELECT b.id
  FROM branches b
  WHERE b.organization_id = al.organization_id
    AND b.is_default = true
  LIMIT 1
)
WHERE al.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_logs_branch_id_fkey'
  ) THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE audit_logs
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_branch_time
  ON audit_logs (organization_id, branch_id, created_at DESC);

ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE notification_logs nl
SET branch_id = (
  SELECT b.id
  FROM branches b
  WHERE b.organization_id = nl.organization_id
    AND b.is_default = true
  LIMIT 1
)
WHERE nl.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_logs_branch_id_fkey'
  ) THEN
    ALTER TABLE notification_logs
      ADD CONSTRAINT notification_logs_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE notification_logs
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_org_branch_type_time
  ON notification_logs (organization_id, branch_id, notification_type, created_at DESC);

ALTER TABLE billing_audit_logs
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE billing_audit_logs bal
SET branch_id = COALESCE(
  (
    SELECT i.branch_id
    FROM invoices i
    WHERE i.id = bal.invoice_id
      AND i.organization_id = bal.organization_id
    LIMIT 1
  ),
  (
    SELECT p.branch_id
    FROM payments p
    WHERE p.id = bal.payment_id
      AND p.organization_id = bal.organization_id
    LIMIT 1
  ),
  (
    SELECT b.id
    FROM branches b
    WHERE b.organization_id = bal.organization_id
      AND b.is_default = true
    LIMIT 1
  )
)
WHERE bal.branch_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_audit_logs_branch_id_fkey'
  ) THEN
    ALTER TABLE billing_audit_logs
      ADD CONSTRAINT billing_audit_logs_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE billing_audit_logs
  ALTER COLUMN branch_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_audit_logs_org_branch_time
  ON billing_audit_logs (organization_id, branch_id, created_at DESC);
