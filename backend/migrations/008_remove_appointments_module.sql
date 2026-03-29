ALTER TABLE invoices
  DROP COLUMN IF EXISTS appointment_id;

DROP TABLE IF EXISTS appointments;
