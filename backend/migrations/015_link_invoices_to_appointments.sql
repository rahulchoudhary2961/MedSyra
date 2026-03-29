ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_org_appointment
ON invoices (organization_id, appointment_id)
WHERE appointment_id IS NOT NULL;
