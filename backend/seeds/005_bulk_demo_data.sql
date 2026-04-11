WITH lookup AS (
  SELECT
    ARRAY[
      'Aarav', 'Anaya', 'Vivaan', 'Isha', 'Rohan', 'Meera', 'Kabir', 'Saanvi',
      'Arjun', 'Pooja', 'Dev', 'Nisha', 'Karan', 'Priya', 'Rahul', 'Simran',
      'Aditya', 'Kavya', 'Nitin', 'Tara', 'Manish', 'Ritu', 'Suresh', 'Aditi',
      'Harsh', 'Neel', 'Sneha', 'Vikram', 'Pawan', 'Divya'
    ] AS first_names,
    ARRAY[
      'Sharma', 'Verma', 'Gupta', 'Singh', 'Mehta', 'Kapoor', 'Iyer', 'Patel',
      'Nair', 'Khanna', 'Joshi', 'Bansal', 'Rao', 'Malhotra', 'Das', 'Chawla',
      'Jain', 'Tiwari', 'Saxena', 'Khandelwal', 'Kulkarni', 'Mishra', 'Yadav', 'Sethi',
      'Aggarwal', 'Chandra', 'Sinha', 'Bhatt', 'Khurana', 'Menon'
    ] AS last_names,
    ARRAY['O+', 'A+', 'B+', 'AB+'] AS blood_types
),
source AS (
  SELECT
    gs,
    first_names[((gs - 1) % array_length(first_names, 1)) + 1] AS first_name,
    last_names[((gs - 1) % array_length(last_names, 1)) + 1] AS last_name,
    blood_types[((gs - 1) % array_length(blood_types, 1)) + 1] AS blood_type
  FROM generate_series(1, 30) AS gs
  CROSS JOIN lookup
)
INSERT INTO patients (
  id,
  organization_id,
  patient_code,
  full_name,
  age,
  date_of_birth,
  gender,
  phone,
  email,
  blood_type,
  status,
  last_visit_at
)
SELECT
  ('33333333-3333-3333-3333-' || lpad((1000 + gs)::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  'PAT-' || lpad((100 + gs)::text, 4, '0'),
  first_name || ' ' || last_name,
  24 + (gs % 41),
  CURRENT_DATE - ((24 + (gs % 41)) || ' year')::interval,
  CASE WHEN gs % 2 = 0 THEN 'male' ELSE 'female' END,
  '7' || lpad(gs::text, 9, '0'),
  lower(first_name) || '.' || lower(last_name) || gs || '@citygeneral.com',
  blood_type,
  CASE WHEN gs % 5 = 0 THEN 'follow-up' ELSE 'active' END,
  CURRENT_DATE - (gs || ' day')::interval
FROM source
ON CONFLICT (id) DO NOTHING;

WITH source AS (
  SELECT
    gs,
    CASE
      WHEN gs % 6 = 0 THEN 'completed'
      WHEN gs % 6 = 1 THEN 'confirmed'
      WHEN gs % 6 = 2 THEN 'pending'
      WHEN gs % 6 = 3 THEN 'checked-in'
      WHEN gs % 6 = 4 THEN 'no-show'
      ELSE 'cancelled'
    END AS status,
    CASE
      WHEN gs % 4 = 0 THEN 'consultation'
      WHEN gs % 4 = 1 THEN 'follow-up'
      WHEN gs % 4 = 2 THEN 'review'
      ELSE 'procedure'
    END AS category,
    CASE
      WHEN gs % 4 = 0 THEN 15
      WHEN gs % 4 = 1 THEN 20
      WHEN gs % 4 = 2 THEN 25
      ELSE 30
    END AS duration_minutes,
    CASE
      WHEN gs % 3 = 0 THEN '44444444-4444-4444-4444-444444444441'
      WHEN gs % 3 = 1 THEN '44444444-4444-4444-4444-444444444442'
      ELSE '44444444-4444-4444-4444-444444444443'
    END AS doctor_id,
    CASE
      WHEN gs % 5 = 0 THEN 'Blood pressure follow-up'
      WHEN gs % 5 = 1 THEN 'Annual wellness review'
      WHEN gs % 5 = 2 THEN 'Prescription review'
      WHEN gs % 5 = 3 THEN 'Diagnostic consultation'
      ELSE 'Procedure planning'
    END AS planned_procedures,
    CASE
      WHEN gs % 5 = 0 THEN 'Review treatment response and adjust medication if needed'
      WHEN gs % 5 = 1 THEN 'General health check and preventive counselling'
      WHEN gs % 5 = 2 THEN 'Discuss current symptoms and medication adherence'
      WHEN gs % 5 = 3 THEN 'Assess symptoms and schedule next steps'
      ELSE 'Prepare for upcoming procedure and pre-op review'
    END AS notes
  FROM generate_series(1, 30) AS gs
)
INSERT INTO appointments (
  id,
  organization_id,
  branch_id,
  title,
  patient_id,
  patient_name,
  patient_identifier,
  mobile_number,
  email,
  doctor_id,
  category,
  status,
  appointment_date,
  appointment_time,
  duration_minutes,
  planned_procedures,
  notes
)
SELECT
  ('55555555-5555-5555-5555-' || lpad((2000 + gs)::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1),
  p.full_name,
  p.id,
  p.full_name,
  p.patient_code,
  p.phone,
  p.email,
  source.doctor_id::uuid,
  source.category,
  source.status,
  CASE
    WHEN source.status IN ('completed', 'no-show', 'cancelled') THEN CURRENT_DATE - (((gs % 14) + 1) || ' day')::interval
    WHEN source.status = 'checked-in' THEN CURRENT_DATE
    ELSE CURRENT_DATE + ((gs % 14) || ' day')::interval
  END,
  (to_char(time '08:00' + ((gs % 10) * interval '30 minutes'), 'HH24:MI'))::time,
  source.duration_minutes,
  source.planned_procedures,
  source.notes
FROM source
JOIN patients p
  ON p.id = ('33333333-3333-3333-3333-' || lpad((1000 + source.gs)::text, 12, '0'))::uuid
ON CONFLICT (id) DO NOTHING;

WITH source AS (
  SELECT
    gs,
    CASE
      WHEN gs % 5 = 0 THEN 'Consultation'
      WHEN gs % 5 = 1 THEN 'Follow-up'
      WHEN gs % 5 = 2 THEN 'Lab Results'
      WHEN gs % 5 = 3 THEN 'X-Ray'
      ELSE 'Prescription Review'
    END AS record_type,
    CASE
      WHEN gs % 4 = 0 THEN 'completed'
      WHEN gs % 4 = 1 THEN 'completed'
      WHEN gs % 4 = 2 THEN 'completed'
      ELSE 'completed'
    END AS status,
    CASE
      WHEN gs % 6 = 0 THEN 'Hypertension management'
      WHEN gs % 6 = 1 THEN 'Routine health check'
      WHEN gs % 6 = 2 THEN 'Follow-up review'
      WHEN gs % 6 = 3 THEN 'Diagnostic findings'
      WHEN gs % 6 = 4 THEN 'Medication adherence review'
      ELSE 'Procedure recovery review'
    END AS diagnosis,
    CASE
      WHEN gs % 6 = 0 THEN 'Amlodipine 5 mg, Low-salt diet'
      WHEN gs % 6 = 1 THEN 'Hydration, walking, and sleep hygiene'
      WHEN gs % 6 = 2 THEN 'Continue current medication and monitor symptoms'
      WHEN gs % 6 = 3 THEN 'Order imaging and specialist review'
      WHEN gs % 6 = 4 THEN 'Continue treatment and recheck in 2 weeks'
      ELSE 'Rest, follow wound care instructions'
    END AS prescription,
    CASE
      WHEN gs % 4 = 0 THEN CURRENT_DATE + ((gs % 10) || ' day')::interval
      WHEN gs % 4 = 1 THEN CURRENT_DATE + (((gs % 10) + 3) || ' day')::interval
      WHEN gs % 4 = 2 THEN CURRENT_DATE + (((gs % 10) + 7) || ' day')::interval
      ELSE CURRENT_DATE - ((gs % 7) || ' day')::interval
    END AS follow_up_date,
    CASE
      WHEN gs % 4 = 0 THEN 'pending'
      WHEN gs % 4 = 1 THEN 'sent'
      WHEN gs % 4 = 2 THEN 'failed'
      ELSE 'skipped'
    END AS follow_up_reminder_status,
    CASE
      WHEN gs % 4 = 2 THEN 'SMS delivery failed'
      ELSE NULL
    END AS follow_up_reminder_error,
    CASE
      WHEN gs % 4 = 1 THEN CURRENT_TIMESTAMP - ((gs % 9) || ' day')::interval
      WHEN gs % 4 = 2 THEN CURRENT_TIMESTAMP - ((gs % 5) || ' day')::interval
      ELSE NULL
    END AS follow_up_reminder_last_attempt_at,
    CASE
      WHEN gs % 6 = 0 THEN 'Stable on treatment'
      WHEN gs % 6 = 1 THEN 'Symptoms improving'
      WHEN gs % 6 = 2 THEN 'Needs repeat review'
      WHEN gs % 6 = 3 THEN 'Awaiting specialist opinion'
      WHEN gs % 6 = 4 THEN 'Good response to medication'
      ELSE 'Recovering as expected'
    END AS notes
  FROM generate_series(1, 30) AS gs
)
INSERT INTO medical_records (
  id,
  organization_id,
  branch_id,
  patient_id,
  doctor_id,
  appointment_id,
  record_type,
  status,
  record_date,
  symptoms,
  diagnosis,
  prescription,
  follow_up_date,
  follow_up_reminder_status,
  follow_up_reminder_sent_at,
  follow_up_reminder_error,
  follow_up_reminder_last_attempt_at,
  notes
)
SELECT
  ('66666666-6666-6666-6666-' || lpad((3000 + gs)::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1),
  ('33333333-3333-3333-3333-' || lpad((1000 + gs)::text, 12, '0'))::uuid,
  CASE
    WHEN gs % 3 = 0 THEN '44444444-4444-4444-4444-444444444441'
    WHEN gs % 3 = 1 THEN '44444444-4444-4444-4444-444444444442'
    ELSE '44444444-4444-4444-4444-444444444443'
  END::uuid,
  ('55555555-5555-5555-5555-' || lpad((2000 + gs)::text, 12, '0'))::uuid,
  source.record_type,
  source.status,
  CASE
    WHEN source.status = 'completed' THEN CURRENT_DATE - ((gs % 18) || ' day')::interval
    ELSE CURRENT_DATE - ((gs % 8) || ' day')::interval
  END,
  CASE
    WHEN gs % 5 = 0 THEN 'Headache and fatigue'
    WHEN gs % 5 = 1 THEN 'Routine follow-up symptoms'
    WHEN gs % 5 = 2 THEN 'Mild chest discomfort'
    WHEN gs % 5 = 3 THEN 'Diagnostic review and pain'
    ELSE 'Post-procedure pain and swelling'
  END,
  source.diagnosis,
  source.prescription,
  source.follow_up_date,
  source.follow_up_reminder_status,
  CASE WHEN source.follow_up_reminder_status = 'sent' THEN CURRENT_TIMESTAMP - ((gs % 6) || ' day')::interval ELSE NULL END,
  source.follow_up_reminder_error,
  source.follow_up_reminder_last_attempt_at,
  source.notes
FROM source
ON CONFLICT (id) DO NOTHING;

WITH source AS (
  SELECT
    gs,
    CASE
      WHEN gs % 6 = 0 THEN 'paid'
      WHEN gs % 6 = 1 THEN 'issued'
      WHEN gs % 6 = 2 THEN 'partially_paid'
      WHEN gs % 6 = 3 THEN 'overdue'
      WHEN gs % 6 = 4 THEN 'draft'
      ELSE 'paid'
    END AS status,
    CASE
      WHEN gs % 4 = 0 THEN 'Consultation fee'
      WHEN gs % 4 = 1 THEN 'Follow-up visit'
      WHEN gs % 4 = 2 THEN 'Procedure charge'
      ELSE 'Diagnostic package'
    END AS description,
    CASE
      WHEN gs % 3 = 0 THEN '44444444-4444-4444-4444-444444444441'
      WHEN gs % 3 = 1 THEN '44444444-4444-4444-4444-444444444442'
      ELSE '44444444-4444-4444-4444-444444444443'
    END AS doctor_id,
    650 + (gs * 175) AS total_amount
  FROM generate_series(1, 15) AS gs
)
INSERT INTO invoices (
  id,
  organization_id,
  branch_id,
  invoice_number,
  patient_id,
  doctor_id,
  issue_date,
  due_date,
  status,
  total_amount,
  paid_amount,
  balance_amount,
  currency,
  notes
)
SELECT
  ('88888888-8888-8888-8888-' || lpad((4000 + gs)::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1),
  'INV-BULK-' || lpad(gs::text, 4, '0'),
  ('33333333-3333-3333-3333-' || lpad((1000 + gs)::text, 12, '0'))::uuid,
  source.doctor_id::uuid,
  CURRENT_DATE - ((gs % 18) || ' day')::interval,
  CASE
    WHEN source.status = 'paid' THEN CURRENT_DATE - ((gs % 10) || ' day')::interval
    WHEN source.status = 'overdue' THEN CURRENT_DATE - (((gs % 7) + 1) || ' day')::interval
    WHEN source.status = 'draft' THEN NULL
    ELSE CURRENT_DATE + ((gs % 14) || ' day')::interval
  END,
  source.status,
  source.total_amount,
  CASE
    WHEN source.status = 'paid' THEN source.total_amount
    WHEN source.status = 'partially_paid' THEN ROUND(source.total_amount * 0.4, 2)
    ELSE 0
  END,
  CASE
    WHEN source.status = 'paid' THEN 0
    WHEN source.status = 'partially_paid' THEN ROUND(source.total_amount * 0.6, 2)
    ELSE source.total_amount
  END,
  'INR',
  'Bulk demo billing load'
FROM source
ON CONFLICT (id) DO NOTHING;

INSERT INTO invoice_items (
  id,
  invoice_id,
  description,
  quantity,
  unit_price,
  total_amount
)
SELECT
  ('99999999-9999-9999-9999-' || lpad((5000 + gs)::text, 12, '0'))::uuid,
  ('88888888-8888-8888-8888-' || lpad((4000 + gs)::text, 12, '0'))::uuid,
  CASE
    WHEN gs % 4 = 0 THEN 'Consultation charge'
    WHEN gs % 4 = 1 THEN 'Medication review'
    WHEN gs % 4 = 2 THEN 'Procedure support'
    ELSE 'Diagnostics bundle'
  END,
  1,
  650 + (gs * 175),
  650 + (gs * 175)
FROM generate_series(1, 15) AS gs
ON CONFLICT (id) DO NOTHING;

INSERT INTO payments (
  id,
  organization_id,
  branch_id,
  invoice_id,
  amount,
  method,
  reference,
  status,
  paid_at
)
SELECT
  ('aaaaaaaa-aaaa-aaaa-aaaa-' || lpad((6000 + RIGHT(i.invoice_number, 4)::int)::text, 12, '0'))::uuid,
  i.organization_id,
  i.branch_id,
  i.id,
  CASE
    WHEN i.status = 'partially_paid' THEN ROUND(i.total_amount * 0.4, 2)
    ELSE i.total_amount
  END,
  CASE
    WHEN RIGHT(i.invoice_number, 4)::int % 3 = 0 THEN 'cash'
    WHEN RIGHT(i.invoice_number, 4)::int % 3 = 1 THEN 'upi'
    ELSE 'card'
  END,
  'PAY-BULK-' || RIGHT(i.invoice_number, 4),
  'completed',
  CURRENT_TIMESTAMP - ((RIGHT(i.invoice_number, 4)::int % 12) || ' day')::interval
FROM invoices i
WHERE i.organization_id = '11111111-1111-1111-1111-111111111111'
  AND i.invoice_number LIKE 'INV-BULK-%'
  AND i.status IN ('paid', 'partially_paid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO activity_logs (
  id,
  organization_id,
  branch_id,
  event_type,
  title,
  entity_name,
  event_time
)
SELECT
  ('bbbbbbbb-bbbb-bbbb-bbbb-' || lpad((7000 + gs)::text, 12, '0'))::uuid,
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1),
  CASE
    WHEN gs % 4 = 0 THEN 'registration'
    WHEN gs % 4 = 1 THEN 'appointment'
    WHEN gs % 4 = 2 THEN 'record'
    ELSE 'billing'
  END,
  CASE
    WHEN gs % 4 = 0 THEN 'Bulk patient registered'
    WHEN gs % 4 = 1 THEN 'Bulk appointment scheduled'
    WHEN gs % 4 = 2 THEN 'Bulk medical record added'
    ELSE 'Bulk invoice created'
  END,
  CASE
    WHEN gs % 4 = 0 THEN ('33333333-3333-3333-3333-' || lpad((1000 + gs)::text, 12, '0'))::uuid::text
    WHEN gs % 4 = 1 THEN ('55555555-5555-5555-5555-' || lpad((2000 + gs)::text, 12, '0'))::uuid::text
    WHEN gs % 4 = 2 THEN ('66666666-6666-6666-6666-' || lpad((3000 + gs)::text, 12, '0'))::uuid::text
    ELSE ('88888888-8888-8888-8888-' || lpad((4000 + gs)::text, 12, '0'))::uuid::text
  END,
  NOW() - (gs || ' minute')::interval
FROM generate_series(1, 30) AS gs
ON CONFLICT (id) DO NOTHING;
