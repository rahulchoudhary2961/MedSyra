INSERT INTO lab_tests (
  id,
  organization_id,
  code,
  name,
  department,
  price,
  turnaround_hours,
  instructions,
  is_active
)
VALUES
  ('c1111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-111111111111', 'LAB-CBC', 'Complete Blood Count', 'Pathology', 450, 6, 'Fast if possible', true),
  ('c1111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-111111111111', 'LAB-HBA1C', 'HbA1c', 'Pathology', 650, 12, 'No special preparation', true),
  ('c1111111-1111-1111-1111-000000000003', '11111111-1111-1111-1111-111111111111', 'LAB-LIPID', 'Lipid Profile', 'Pathology', 900, 8, '12 hour fasting preferred', true),
  ('c1111111-1111-1111-1111-000000000004', '11111111-1111-1111-1111-111111111111', 'LAB-LFT', 'Liver Function Test', 'Pathology', 850, 10, '8 hour fasting preferred', true),
  ('c1111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-111111111111', 'LAB-RFT', 'Renal Function Test', 'Pathology', 820, 10, 'Hydration advised', true),
  ('c1111111-1111-1111-1111-000000000006', '11111111-1111-1111-1111-111111111111', 'LAB-ECG', 'ECG', 'Cardiology', 300, 2, 'No special preparation', true),
  ('c1111111-1111-1111-1111-000000000007', '11111111-1111-1111-1111-111111111111', 'LAB-XRAY', 'Chest X-Ray', 'Radiology', 500, 4, 'Remove metal accessories', true),
  ('c1111111-1111-1111-1111-000000000008', '11111111-1111-1111-1111-111111111111', 'LAB-URINE', 'Urine Routine', 'Pathology', 250, 4, 'Fresh sample preferred', true),
  ('c1111111-1111-1111-1111-000000000009', '11111111-1111-1111-1111-111111111111', 'LAB-TSH', 'Thyroid Profile', 'Pathology', 700, 8, 'No special preparation', true),
  ('c1111111-1111-1111-1111-000000000010', '11111111-1111-1111-1111-111111111111', 'LAB-VITD', 'Vitamin D', 'Pathology', 1100, 12, 'No special preparation', true),
  ('c1111111-1111-1111-1111-000000000011', '11111111-1111-1111-1111-111111111111', 'LAB-CRP', 'C-Reactive Protein', 'Pathology', 780, 8, 'No special preparation', true),
  ('c1111111-1111-1111-1111-000000000012', '11111111-1111-1111-1111-111111111111', 'LAB-DOPPLER', 'Doppler Study', 'Radiology', 1500, 24, 'Appointment required', true)
ON CONFLICT (id) DO NOTHING;

WITH seed_rows AS (
  SELECT
    gs,
    ('33333333-3333-3333-3333-' || lpad((1000 + gs)::text, 12, '0'))::uuid AS patient_id,
    ('55555555-5555-5555-5555-' || lpad((2000 + gs)::text, 12, '0'))::uuid AS appointment_id,
    CASE
      WHEN gs % 5 = 0 THEN 'ordered'
      WHEN gs % 5 = 1 THEN 'sample_collected'
      WHEN gs % 5 = 2 THEN 'processing'
      WHEN gs % 5 = 3 THEN 'report_ready'
      ELSE 'completed'
    END AS status,
    CASE
      WHEN gs % 4 = 0 THEN 'CBC with differential'
      WHEN gs % 4 = 1 THEN 'Diabetes follow-up panel'
      WHEN gs % 4 = 2 THEN 'Cardiac screening'
      ELSE 'General health workup'
    END AS notes
  FROM generate_series(1, 20) AS gs
)
INSERT INTO lab_orders (
  id,
  organization_id,
  branch_id,
  order_number,
  patient_id,
  doctor_id,
  appointment_id,
  ordered_by_user_id,
  status,
  ordered_date,
  due_date,
  notes,
  report_file_url,
  sample_collected_at,
  processing_started_at,
  report_ready_at,
  completed_at
)
SELECT
  ('d1111111-1111-1111-1111-' || lpad((100 + gs)::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1),
  'LAB-BULK-' || lpad(gs::text, 4, '0'),
  seed_rows.patient_id,
  CASE WHEN gs % 3 = 0 THEN '44444444-4444-4444-4444-444444444441'
       WHEN gs % 3 = 1 THEN '44444444-4444-4444-4444-444444444442'
       ELSE '44444444-4444-4444-4444-444444444443' END::uuid,
  seed_rows.appointment_id,
  '22222222-2222-2222-2222-222222222222',
  seed_rows.status,
  CURRENT_DATE - ((gs % 12) || ' day')::interval,
  CURRENT_DATE + ((gs % 10) || ' day')::interval,
  seed_rows.notes,
  CASE WHEN seed_rows.status IN ('report_ready', 'completed') THEN '/private-uploads/lab-reports/lab-report-' || lpad(gs::text, 4, '0') || '.pdf' ELSE NULL END,
  CASE WHEN seed_rows.status IN ('sample_collected', 'processing', 'report_ready', 'completed') THEN CURRENT_TIMESTAMP - ((gs % 7) || ' day')::interval ELSE NULL END,
  CASE WHEN seed_rows.status IN ('processing', 'report_ready', 'completed') THEN CURRENT_TIMESTAMP - ((gs % 5) || ' day')::interval ELSE NULL END,
  CASE WHEN seed_rows.status IN ('report_ready', 'completed') THEN CURRENT_TIMESTAMP - ((gs % 3) || ' day')::interval ELSE NULL END,
  CASE WHEN seed_rows.status = 'completed' THEN CURRENT_TIMESTAMP - ((gs % 2) || ' day')::interval ELSE NULL END
FROM seed_rows
ON CONFLICT (id) DO NOTHING;

WITH order_rows AS (
  SELECT
    lo.id AS lab_order_id,
    lo.order_number,
    ROW_NUMBER() OVER (ORDER BY lo.created_at, lo.id) AS rn
  FROM lab_orders lo
  WHERE lo.organization_id = '11111111-1111-1111-1111-111111111111'
    AND lo.order_number LIKE 'LAB-BULK-%'
),
test_rows AS (
  SELECT
    lt.id AS lab_test_id,
    lt.name,
    lt.price,
    ROW_NUMBER() OVER (ORDER BY lt.name) AS rn
  FROM lab_tests lt
  WHERE lt.organization_id = '11111111-1111-1111-1111-111111111111'
    AND lt.is_active = true
)
INSERT INTO lab_order_items (
  id,
  lab_order_id,
  lab_test_id,
  test_name,
  price,
  result_summary
)
SELECT
  ('d2222222-2222-2222-2222-' || lpad((1000 + o.rn)::text, 12, '0'))::uuid,
  o.lab_order_id,
  t.lab_test_id,
  t.name,
  t.price,
  CASE
    WHEN o.rn % 4 = 0 THEN 'Within normal limits'
    WHEN o.rn % 4 = 1 THEN 'Mildly elevated'
    WHEN o.rn % 4 = 2 THEN 'Needs clinical review'
    ELSE 'Stable findings'
  END
FROM order_rows o
JOIN test_rows t
  ON t.rn = ((o.rn - 1) % 12) + 1
ON CONFLICT (id) DO NOTHING;

WITH medicine_rows AS (
  SELECT
    gs,
    ('e1111111-1111-1111-1111-' || lpad(gs::text, 12, '0'))::uuid AS medicine_id,
    CASE
      WHEN gs % 4 = 0 THEN 'TAB-' || lpad(gs::text, 3, '0')
      WHEN gs % 4 = 1 THEN 'CAP-' || lpad(gs::text, 3, '0')
      WHEN gs % 4 = 2 THEN 'SYP-' || lpad(gs::text, 3, '0')
      ELSE 'INJ-' || lpad(gs::text, 3, '0')
    END AS code,
    CASE
      WHEN gs % 4 = 0 THEN 'Tablet'
      WHEN gs % 4 = 1 THEN 'Capsule'
      WHEN gs % 4 = 2 THEN 'Syrup'
      ELSE 'Injection'
    END AS dosage_form
  FROM generate_series(1, 12) AS gs
)
INSERT INTO medicines (
  id,
  organization_id,
  code,
  name,
  generic_name,
  dosage_form,
  strength,
  unit,
  reorder_level,
  is_active
)
SELECT
  medicine_id,
  '11111111-1111-1111-1111-111111111111',
  code,
  CASE gs
    WHEN 1 THEN 'Amlodipine'
    WHEN 2 THEN 'Metformin'
    WHEN 3 THEN 'Atorvastatin'
    WHEN 4 THEN 'Paracetamol'
    WHEN 5 THEN 'Amoxicillin'
    WHEN 6 THEN 'Omeprazole'
    WHEN 7 THEN 'Cetirizine'
    WHEN 8 THEN 'Ibuprofen'
    WHEN 9 THEN 'Telmisartan'
    WHEN 10 THEN 'Vitamin D3'
    WHEN 11 THEN 'Salbutamol'
    ELSE 'Azithromycin'
  END,
  CASE gs
    WHEN 1 THEN 'Amlodipine'
    WHEN 2 THEN 'Metformin'
    WHEN 3 THEN 'Atorvastatin'
    WHEN 4 THEN 'Paracetamol'
    WHEN 5 THEN 'Amoxicillin'
    WHEN 6 THEN 'Omeprazole'
    WHEN 7 THEN 'Cetirizine'
    WHEN 8 THEN 'Ibuprofen'
    WHEN 9 THEN 'Telmisartan'
    WHEN 10 THEN 'Cholecalciferol'
    WHEN 11 THEN 'Salbutamol'
    ELSE 'Azithromycin'
  END,
  dosage_form,
  CASE
    WHEN gs IN (4, 8) THEN '500 mg'
    WHEN gs IN (2, 3, 9) THEN '10 mg'
    WHEN gs = 10 THEN '60000 IU'
    WHEN gs = 11 THEN '100 mcg'
    WHEN gs = 12 THEN '250 mg'
    ELSE '250 mg'
  END,
  CASE
    WHEN gs % 4 = 2 THEN 'ml'
    ELSE 'tablet'
  END,
  20 + (gs * 2),
  true
FROM medicine_rows
ON CONFLICT (id) DO NOTHING;

WITH batch_rows AS (
  SELECT
    gs,
    ('e1111111-1111-1111-1111-' || lpad((((gs - 1) % 12) + 1)::text, 12, '0'))::uuid AS medicine_id,
    ('BATCH-' || lpad(gs::text, 4, '0')) AS batch_number
  FROM generate_series(1, 20) AS gs
)
INSERT INTO medicine_batches (
  id,
  organization_id,
  medicine_id,
  batch_number,
  manufacturer,
  expiry_date,
  received_quantity,
  available_quantity,
  purchase_price,
  sale_price,
  received_date
)
SELECT
  ('e2222222-2222-2222-2222-' || lpad(gs::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  batch_rows.medicine_id,
  batch_rows.batch_number,
  CASE WHEN gs % 2 = 0 THEN 'City Pharma' ELSE 'City Labs' END,
  CURRENT_DATE + ((30 + gs * 5) || ' day')::interval,
  100 + (gs * 10),
  100 + (gs * 10),
  25 + (gs * 2),
  40 + (gs * 3),
  CURRENT_DATE - ((gs % 20) || ' day')::interval
FROM batch_rows
ON CONFLICT (id) DO NOTHING;

WITH dispense_rows AS (
  SELECT
    gs,
    ('33333333-3333-3333-3333-' || lpad((1000 + gs)::text, 12, '0'))::uuid AS patient_id,
    CASE
      WHEN gs % 3 = 0 THEN '44444444-4444-4444-4444-444444444441'
      WHEN gs % 3 = 1 THEN '44444444-4444-4444-4444-444444444442'
      ELSE '44444444-4444-4444-4444-444444444443'
    END::uuid AS doctor_id,
    ('55555555-5555-5555-5555-' || lpad((2000 + gs)::text, 12, '0'))::uuid AS appointment_id,
    ('66666666-6666-6666-6666-' || lpad((3000 + gs)::text, 12, '0'))::uuid AS medical_record_id,
    ('88888888-8888-8888-8888-' || lpad((4000 + gs)::text, 12, '0'))::uuid AS invoice_id
  FROM generate_series(1, 10) AS gs
)
INSERT INTO pharmacy_dispenses (
  id,
  organization_id,
  dispense_number,
  patient_id,
  doctor_id,
  appointment_id,
  medical_record_id,
  invoice_id,
  dispensed_by_user_id,
  status,
  dispensed_date,
  prescription_snapshot,
  notes
)
SELECT
  ('e3333333-3333-3333-3333-' || lpad(gs::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  'RX-BULK-' || lpad(gs::text, 4, '0'),
  dispense_rows.patient_id,
  dispense_rows.doctor_id,
  dispense_rows.appointment_id,
  dispense_rows.medical_record_id,
  dispense_rows.invoice_id,
  '22222222-2222-2222-2222-222222222222',
  'dispensed',
  CURRENT_DATE - ((gs % 10) || ' day')::interval,
  CASE
    WHEN gs % 2 = 0 THEN 'Amlodipine 5 mg; Metformin 500 mg'
    ELSE 'Paracetamol 500 mg; Vitamin D3 60000 IU'
  END,
  'Bulk pharmacy dispense demo'
FROM dispense_rows
ON CONFLICT (id) DO NOTHING;

WITH dispense_rows AS (
  SELECT
    pd.id AS dispense_id,
    pd.dispense_number,
    ROW_NUMBER() OVER (ORDER BY pd.created_at, pd.id) AS rn
  FROM pharmacy_dispenses pd
  WHERE pd.organization_id = '11111111-1111-1111-1111-111111111111'
    AND pd.dispense_number LIKE 'RX-BULK-%'
),
batch_rows AS (
  SELECT
    mb.id AS batch_id,
    mb.medicine_id,
    mb.batch_number,
    mb.expiry_date,
    m.name AS medicine_name,
    ROW_NUMBER() OVER (ORDER BY mb.created_at, mb.id) AS rn
  FROM medicine_batches mb
  JOIN medicines m ON m.id = mb.medicine_id
  WHERE mb.organization_id = '11111111-1111-1111-1111-111111111111'
)
INSERT INTO pharmacy_dispense_items (
  id,
  dispense_id,
  medicine_id,
  medicine_batch_id,
  medicine_name,
  batch_number,
  expiry_date,
  quantity,
  unit_price,
  total_amount,
  directions
)
SELECT
  ('e4444444-4444-4444-4444-' || lpad(dr.rn::text, 12, '0'))::uuid,
  dr.dispense_id,
  b.medicine_id,
  b.batch_id,
  b.medicine_name,
  b.batch_number,
  b.expiry_date,
  1 + (dr.rn % 2),
  45 + (dr.rn * 5),
  (1 + (dr.rn % 2)) * (45 + (dr.rn * 5)),
  CASE
    WHEN dr.rn % 2 = 0 THEN 'Take after food'
    ELSE 'Take before sleep'
  END
FROM dispense_rows dr
JOIN batch_rows b
  ON b.rn = ((dr.rn - 1) % 12) + 1
ON CONFLICT (id) DO NOTHING;

WITH item_rows AS (
  SELECT
    gs,
    CASE
      WHEN gs % 4 = 0 THEN 'Consumable'
      WHEN gs % 4 = 1 THEN 'Stationery'
      WHEN gs % 4 = 2 THEN 'Diagnostic'
      ELSE 'Facility'
    END AS category
  FROM generate_series(1, 12) AS gs
)
INSERT INTO inventory_items (
  id,
  organization_id,
  code,
  name,
  category,
  unit,
  reorder_level,
  is_active
)
SELECT
  ('f1111111-1111-1111-1111-' || lpad(gs::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  'INV-' || lpad(gs::text, 4, '0'),
  CASE gs
    WHEN 1 THEN 'Syringe'
    WHEN 2 THEN 'Gloves'
    WHEN 3 THEN 'Surgical Mask'
    WHEN 4 THEN 'Blood Collection Tube'
    WHEN 5 THEN 'Bandage Roll'
    WHEN 6 THEN 'Cotton Roll'
    WHEN 7 THEN 'Disinfectant'
    WHEN 8 THEN 'Thermometer'
    WHEN 9 THEN 'Stethoscope Battery'
    WHEN 10 THEN 'Printer Paper'
    WHEN 11 THEN 'IV Set'
    ELSE 'Saline Bottle'
  END,
  category,
  CASE
    WHEN gs IN (1, 2, 4, 5, 6, 7, 10, 11) THEN 'unit'
    ELSE 'piece'
  END,
  10 + gs,
  true
FROM item_rows
ON CONFLICT (id) DO NOTHING;

WITH movement_rows AS (
  SELECT
    gs,
    ('f1111111-1111-1111-1111-' || lpad(((gs - 1) % 12 + 1)::text, 12, '0'))::uuid AS item_id,
    CASE
      WHEN gs % 5 = 0 THEN 'stock_in'
      WHEN gs % 5 = 1 THEN 'usage'
      WHEN gs % 5 = 2 THEN 'wastage'
      WHEN gs % 5 = 3 THEN 'adjustment_in'
      ELSE 'adjustment_out'
    END AS movement_type
  FROM generate_series(1, 24) AS gs
)
INSERT INTO inventory_movements (
  id,
  organization_id,
  branch_id,
  item_id,
  movement_type,
  quantity,
  unit_cost,
  total_cost,
  notes,
  movement_date,
  performed_by_user_id
)
SELECT
  ('f2222222-2222-2222-2222-' || lpad(gs::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1),
  movement_rows.item_id,
  movement_rows.movement_type,
  5 + (gs % 8),
  12 + gs,
  (5 + (gs % 8)) * (12 + gs),
  'Bulk inventory movement demo',
  CURRENT_DATE - ((gs % 18) || ' day')::interval,
  '22222222-2222-2222-2222-222222222222'
FROM movement_rows
ON CONFLICT (id) DO NOTHING;

INSERT INTO insurance_providers (
  id,
  organization_id,
  payer_code,
  name,
  contact_email,
  contact_phone,
  portal_url,
  is_active
)
VALUES
  ('a1111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-111111111111', 'PAY-1001', 'National Health Insurance', 'claims@national-health.com', '1800-111-100', 'https://portal.national-health.com', true),
  ('a1111111-1111-1111-1111-000000000002', '11111111-1111-1111-1111-111111111111', 'PAY-1002', 'Secure Care Assurance', 'claims@securecare.com', '1800-111-200', 'https://portal.securecare.com', true),
  ('a1111111-1111-1111-1111-000000000003', '11111111-1111-1111-1111-111111111111', 'PAY-1003', 'City Health Coverage', 'claims@cityhealth.com', '1800-111-300', 'https://portal.cityhealth.com', true),
  ('a1111111-1111-1111-1111-000000000004', '11111111-1111-1111-1111-111111111111', 'PAY-1004', 'Prime Wellness', 'claims@primewellness.com', '1800-111-400', 'https://portal.primewellness.com', true),
  ('a1111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-111111111111', 'PAY-1005', 'Value Care Network', 'claims@valuecare.com', '1800-111-500', 'https://portal.valuecare.com', true)
ON CONFLICT (id) DO NOTHING;

WITH provider_rows AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY name) AS rn,
    name,
    payer_code
  FROM insurance_providers
  WHERE organization_id = '11111111-1111-1111-1111-111111111111'
),
invoice_rows AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY issue_date, id) AS rn,
    invoice_number
  FROM invoices
  WHERE organization_id = '11111111-1111-1111-1111-111111111111'
    AND invoice_number LIKE 'INV-BULK-%'
)
INSERT INTO insurance_claims (
  id,
  organization_id,
  branch_id,
  claim_number,
  provider_id,
  patient_id,
  doctor_id,
  appointment_id,
  medical_record_id,
  invoice_id,
  created_by_user_id,
  policy_number,
  member_id,
  status,
  claimed_amount,
  approved_amount,
  paid_amount,
  diagnosis_summary,
  treatment_summary,
  submitted_date,
  response_due_date,
  approved_date,
  settled_date,
  rejection_reason,
  notes,
  last_status_changed_at
)
SELECT
  ('a2222222-2222-2222-2222-' || lpad(gs::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1),
  'CLM-BULK-' || lpad(gs::text, 4, '0'),
  p.id,
  ('33333333-3333-3333-3333-' || lpad((1000 + ((gs - 1) % 30) + 1)::text, 12, '0'))::uuid,
  CASE
    WHEN gs % 3 = 0 THEN '44444444-4444-4444-4444-444444444441'
    WHEN gs % 3 = 1 THEN '44444444-4444-4444-4444-444444444442'
    ELSE '44444444-4444-4444-4444-444444444443'
  END::uuid,
  ('55555555-5555-5555-5555-' || lpad((2000 + ((gs - 1) % 20) + 1)::text, 12, '0'))::uuid,
  ('66666666-6666-6666-6666-' || lpad((3000 + ((gs - 1) % 20) + 1)::text, 12, '0'))::uuid,
  ('88888888-8888-8888-8888-' || lpad((4000 + ((gs - 1) % 15) + 1)::text, 12, '0'))::uuid,
  '22222222-2222-2222-2222-222222222222',
  'POL-' || lpad(gs::text, 5, '0'),
  'MEM-' || lpad(gs::text, 5, '0'),
  CASE
    WHEN gs % 5 = 0 THEN 'settled'
    WHEN gs % 5 = 1 THEN 'submitted'
    WHEN gs % 5 = 2 THEN 'under_review'
    WHEN gs % 5 = 3 THEN 'approved'
    ELSE 'partially_approved'
  END,
  5000 + (gs * 250),
  CASE
    WHEN gs % 5 = 5 THEN 0
    WHEN gs % 5 = 4 THEN 4000 + (gs * 200)
    WHEN gs % 5 = 3 THEN 3500 + (gs * 180)
    WHEN gs % 5 = 2 THEN 1500 + (gs * 50)
    ELSE 0
  END,
  CASE
    WHEN gs % 5 = 0 THEN 5000 + (gs * 250)
    WHEN gs % 5 = 4 THEN 4000 + (gs * 200)
    WHEN gs % 5 = 3 THEN 3500 + (gs * 180)
    WHEN gs % 5 = 2 THEN 1500 + (gs * 50)
    ELSE 0
  END,
  CASE
    WHEN gs % 4 = 0 THEN 'Procedure follow-up'
    WHEN gs % 4 = 1 THEN 'Diagnostic evaluation'
    WHEN gs % 4 = 2 THEN 'Medication review'
    ELSE 'Lab driven claim'
  END,
  CASE
    WHEN gs % 4 = 0 THEN 'Hospitalization avoidance package'
    WHEN gs % 4 = 1 THEN 'Specialist consultation and tests'
    WHEN gs % 4 = 2 THEN 'Pharmacy and follow-up care'
    ELSE 'Outpatient treatment bundle'
  END,
  CURRENT_DATE - ((gs % 14) || ' day')::interval,
  CURRENT_DATE + ((7 + (gs % 10)) || ' day')::interval,
  CASE WHEN gs % 5 = 0 THEN CURRENT_DATE - ((gs % 8) || ' day')::interval ELSE NULL END,
  CASE WHEN gs % 5 = 0 THEN CURRENT_DATE - ((gs % 4) || ' day')::interval ELSE NULL END,
  CASE WHEN gs % 5 = 1 THEN 'Missing document attachment' ELSE NULL END,
  CASE
    WHEN gs % 5 = 1 THEN 'Submitted with documentation'
    WHEN gs % 5 = 2 THEN 'Under review'
    WHEN gs % 5 = 3 THEN 'Approved by payer'
    WHEN gs % 5 = 4 THEN 'Partially approved'
    ELSE 'Settled'
  END,
  NOW() - ((gs % 9) || ' day')::interval
FROM generate_series(1, 10) AS gs
JOIN provider_rows p
  ON p.rn = ((gs - 1) % 5) + 1
ON CONFLICT (id) DO NOTHING;

WITH claim_rows AS (
  SELECT
    ic.id AS claim_id,
    ic.claim_number,
    ROW_NUMBER() OVER (ORDER BY ic.created_at, ic.id) AS rn
  FROM insurance_claims ic
  WHERE ic.organization_id = '11111111-1111-1111-1111-111111111111'
    AND ic.claim_number LIKE 'CLM-BULK-%'
)
INSERT INTO insurance_claim_events (
  id,
  organization_id,
  claim_id,
  actor_user_id,
  event_type,
  previous_status,
  next_status,
  note,
  metadata,
  created_at
)
SELECT
  ('a3333333-3333-3333-3333-' || lpad((3000 + claim_rows.rn)::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  claim_rows.claim_id,
  '22222222-2222-2222-2222-222222222222',
  CASE
    WHEN claim_rows.rn % 4 = 0 THEN 'claim_created'
    WHEN claim_rows.rn % 4 = 1 THEN 'claim_submitted'
    WHEN claim_rows.rn % 4 = 2 THEN 'status_changed'
    ELSE 'note_added'
  END,
  CASE
    WHEN claim_rows.rn % 4 = 0 THEN NULL
    WHEN claim_rows.rn % 4 = 1 THEN 'draft'
    WHEN claim_rows.rn % 4 = 2 THEN 'submitted'
    ELSE NULL
  END,
  CASE
    WHEN claim_rows.rn % 4 = 0 THEN 'submitted'
    WHEN claim_rows.rn % 4 = 1 THEN 'submitted'
    WHEN claim_rows.rn % 4 = 2 THEN 'under_review'
    ELSE NULL
  END,
  CASE
    WHEN claim_rows.rn % 4 = 3 THEN 'Followed up with payer'
    ELSE 'Bulk insurance claim event'
  END,
  jsonb_build_object('source', 'bulk_seed', 'sequence', claim_rows.rn),
  NOW() - ((claim_rows.rn % 7) || ' day')::interval
FROM claim_rows
ON CONFLICT (id) DO NOTHING;

WITH task_rows AS (
  SELECT
    mr.id AS source_record_id,
    mr.patient_id,
    mr.branch_id,
    mr.follow_up_date,
    mr.record_date,
    ROW_NUMBER() OVER (ORDER BY mr.record_date DESC, mr.id) AS rn
  FROM medical_records mr
  WHERE mr.organization_id = '11111111-1111-1111-1111-111111111111'
    AND mr.follow_up_date IS NOT NULL
)
INSERT INTO crm_tasks (
  id,
  organization_id,
  branch_id,
  patient_id,
  source_record_id,
  task_type,
  title,
  priority,
  status,
  due_date,
  created_by_user_id,
  outcome_notes,
  next_action_at
)
SELECT
  ('c4444444-4444-4444-4444-' || lpad(task_rows.rn::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  task_rows.branch_id,
  task_rows.patient_id,
  task_rows.source_record_id,
  CASE
    WHEN task_rows.rn % 3 = 0 THEN 'follow_up'
    WHEN task_rows.rn % 3 = 1 THEN 'recall'
    ELSE 'retention'
  END,
  CASE
    WHEN task_rows.rn % 3 = 0 THEN 'Follow up on treatment'
    WHEN task_rows.rn % 3 = 1 THEN 'Recall for review'
    ELSE 'Retention outreach'
  END,
  CASE
    WHEN task_rows.rn % 3 = 0 THEN 'high'
    WHEN task_rows.rn % 3 = 1 THEN 'medium'
    ELSE 'low'
  END,
  CASE
    WHEN task_rows.rn % 4 = 0 THEN 'closed'
    WHEN task_rows.rn % 4 = 1 THEN 'open'
    WHEN task_rows.rn % 4 = 2 THEN 'contacted'
    ELSE 'scheduled'
  END,
  task_rows.follow_up_date,
  '22222222-2222-2222-2222-222222222222',
  CASE
    WHEN task_rows.rn % 4 = 0 THEN 'Patient already completed follow up'
    WHEN task_rows.rn % 4 = 1 THEN 'Call patient and confirm visit'
    WHEN task_rows.rn % 4 = 2 THEN 'Message sent'
    ELSE 'Visit scheduled'
  END,
  CASE
    WHEN task_rows.rn % 4 = 1 THEN NOW() + INTERVAL '1 day'
    WHEN task_rows.rn % 4 = 2 THEN NOW() + INTERVAL '2 day'
    ELSE NULL
  END
FROM task_rows
WHERE task_rows.rn <= 15
ON CONFLICT (organization_id, task_type, source_record_id)
  WHERE source_record_id IS NOT NULL
DO NOTHING;
