INSERT INTO patients (
  id, organization_id, patient_code, full_name, age, date_of_birth, gender, phone, email, blood_type, status, last_visit_at
)
VALUES (
  '33333333-3333-3333-3333-333333333334',
  '11111111-1111-1111-1111-111111111111',
  'PAT-0004',
  'Ravi Kapoor',
  54,
  CURRENT_DATE - INTERVAL '54 year',
  'male',
  '7978412095',
  'ravi.kapoor@email.com',
  'B+',
  'follow-up',
  CURRENT_DATE - INTERVAL '4 day'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (
  id, organization_id, title, patient_id, patient_name, patient_identifier, mobile_number, email,
  doctor_id, category, status, appointment_date, appointment_time, duration_minutes, planned_procedures, notes
)
VALUES
  (
    '55555555-5555-5555-5555-555555555554',
    '11111111-1111-1111-1111-111111111111',
    'Ravi Kapoor',
    'PAT-0004',
    'Ravi Kapoor',
    'PAT-0004',
    '7978412095',
    'ravi.kapoor@email.com',
    '44444444-4444-4444-4444-444444444441',
    'consultation',
    'completed',
    CURRENT_DATE - INTERVAL '35 day',
    '10:15',
    20,
    'Blood pressure review',
    'Headache and elevated blood pressure readings'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    '11111111-1111-1111-1111-111111111111',
    'Ravi Kapoor',
    'PAT-0004',
    'Ravi Kapoor',
    '33333333-3333-3333-3333-333333333334',
    '7978412095',
    'ravi.kapoor@email.com',
    '44444444-4444-4444-4444-444444444441',
    'review',
    'completed',
    CURRENT_DATE - INTERVAL '4 day',
    '11:00',
    15,
    'Blood pressure medication review',
    'Symptoms improved after starting medication'
  ),
  (
    '55555555-5555-5555-5555-555555555556',
    '11111111-1111-1111-1111-111111111111',
    'Ravi Kapoor',
    '33333333-3333-3333-3333-333333333334',
    'Ravi Kapoor',
    '33333333-3333-3333-3333-333333333334',
    '7978412095',
    'ravi.kapoor@email.com',
    '44444444-4444-4444-4444-444444444441',
    'follow-up',
    'confirmed',
    CURRENT_DATE + INTERVAL '3 day',
    '10:45',
    15,
    'Blood pressure follow-up',
    'Follow-up blood pressure review'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO medical_records (
  id, organization_id, patient_id, doctor_id, appointment_id,
  record_type, status, record_date, diagnosis, prescription,
  follow_up_date, follow_up_reminder_status, follow_up_reminder_sent_at, notes
)
VALUES
  (
    '66666666-6666-6666-6666-666666666663',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333334',
    '44444444-4444-4444-4444-444444444441',
    '55555555-5555-5555-5555-555555555554',
    'Consultation',
    'completed',
    CURRENT_DATE - INTERVAL '35 day',
    'Hypertension management',
    'Amlodipine 5 mg, Low-salt diet',
    CURRENT_DATE - INTERVAL '28 day',
    'sent',
    CURRENT_TIMESTAMP - INTERVAL '29 day',
    'Initial treatment plan started'
  ),
  (
    '66666666-6666-6666-6666-666666666664',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333334',
    '44444444-4444-4444-4444-444444444441',
    '55555555-5555-5555-5555-555555555555',
    'Consultation',
    'completed',
    CURRENT_DATE - INTERVAL '4 day',
    'Hypertension management',
    'Amlodipine 5 mg, Telmisartan 40 mg, BP log monitoring',
    CURRENT_DATE + INTERVAL '3 day',
    'pending',
    NULL,
    'Blood pressure improving, continue current treatment'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO activity_logs (id, organization_id, event_type, title, entity_name, event_time)
VALUES (
  '77777777-7777-7777-7777-777777777774',
  '11111111-1111-1111-1111-111111111111',
  'record',
  'Patient summary demo data seeded',
  'Ravi Kapoor',
  NOW() - INTERVAL '5 minute'
)
ON CONFLICT (id) DO NOTHING;
