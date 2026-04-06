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
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
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
