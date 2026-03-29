CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_status_check CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'checked-in', 'no-show'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_org_date_time
ON appointments (organization_id, appointment_date, appointment_time);
