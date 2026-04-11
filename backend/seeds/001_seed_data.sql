INSERT INTO organizations (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'City General Hospital')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, organization_id, branch_id, full_name, email, phone, role, password_hash, email_verified_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1),
  'Dr. Admin',
  'admin@citygeneral.com',
  '(555) 101-0000',
  'admin',
  '$2b$12$VmdOleUvaEQ32f67/KdtqOpS0X3CtpufYDyLBnNWQfFK3/YvMImuS',
  NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO patients (id, organization_id, patient_code, full_name, age, date_of_birth, gender, phone, email, blood_type, status, last_visit_at)
VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'PAT-0001', 'Sarah Johnson', 32, CURRENT_DATE - INTERVAL '32 year', 'female', '(555) 123-4567', 'sarah.j@email.com', 'O+', 'active', CURRENT_DATE - INTERVAL '1 day'),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'PAT-0002', 'Mike Chen', 45, CURRENT_DATE - INTERVAL '45 year', 'male', '(555) 234-5678', 'mike.c@email.com', 'A+', 'active', CURRENT_DATE - INTERVAL '2 day'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'PAT-0003', 'Emma Davis', 28, CURRENT_DATE - INTERVAL '28 year', 'female', '(555) 345-6789', 'emma.d@email.com', 'B+', 'follow-up', CURRENT_DATE - INTERVAL '3 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO doctors (
  id, organization_id, user_id, full_name, specialty, experience_years, availability, phone, email,
  work_start_time, work_end_time, break_start_time, break_end_time, holiday_dates, consultation_fee, rating, patient_count, status
)
VALUES
  ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', NULL, 'Dr. Emily Smith', 'Cardiology', 15, 'Mon-Fri, 10:00-18:00', '(555) 111-2222', 'e.smith@hospital.com', '10:00', '18:00', '13:00', '13:30', NULL, 120.00, 4.9, 342, 'available'),
  ('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', NULL, 'Dr. Michael Williams', 'Pediatrics', 12, 'Mon-Sat, 09:00-15:00', '(555) 222-3333', 'm.williams@hospital.com', '09:00', '15:00', '12:00', '12:30', NULL, 95.00, 4.8, 289, 'available'),
  ('44444444-4444-4444-4444-444444444443', '11111111-1111-1111-1111-111111111111', NULL, 'Dr. Sarah Brown', 'Orthopedics', 18, 'Mon-Fri, 11:00-17:00', '(555) 333-4444', 's.brown@hospital.com', '11:00', '17:00', '14:00', '14:30', NULL, 150.00, 4.9, 421, 'busy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (
  id, organization_id, branch_id, title, patient_id, patient_name, patient_identifier, mobile_number, email,
  doctor_id, category, appointment_date, appointment_time, duration_minutes, planned_procedures, notes
)
VALUES
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1), 'Sarah Johnson', '33333333-3333-3333-3333-333333333331', 'Sarah Johnson', 'PAT-0001', '(555) 123-4567', 'sarah.j@email.com', '44444444-4444-4444-4444-444444444441', 'consultation', CURRENT_DATE, '09:00', 15, 'Blood pressure review', 'Check follow-up medication response'),
  ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1), 'Mike Chen', '33333333-3333-3333-3333-333333333332', 'Mike Chen', 'PAT-0002', '(555) 234-5678', 'mike.c@email.com', '44444444-4444-4444-4444-444444444442', 'follow-up', CURRENT_DATE + INTERVAL '2 day', '11:30', 30, 'Routine child wellness visit', 'General follow-up discussion'),
  ('55555555-5555-5555-5555-555555555553', '11111111-1111-1111-1111-111111111111', (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1), 'Emma Davis', '33333333-3333-3333-3333-333333333333', 'Emma Davis', 'PAT-0003', '(555) 345-6789', 'emma.d@email.com', '44444444-4444-4444-4444-444444444443', 'procedure', DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '10 day', '15:00', 45, 'Minor orthopedic procedure', 'Operations planning meeting')
ON CONFLICT (id) DO NOTHING;

INSERT INTO medical_records (
  id, organization_id, branch_id, patient_id, doctor_id,
  record_type, status, record_date, notes
)
VALUES
  ('66666666-6666-6666-6666-666666666661', '11111111-1111-1111-1111-111111111111', (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1), '33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444441', 'Lab Results', 'completed', CURRENT_DATE - INTERVAL '1 day', 'Lipid profile normal'),
  ('66666666-6666-6666-6666-666666666662', '11111111-1111-1111-1111-111111111111', (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1), '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', 'X-Ray', 'pending review', CURRENT_DATE - INTERVAL '2 day', 'Requires specialist review')
ON CONFLICT (id) DO NOTHING;

INSERT INTO activity_logs (id, organization_id, branch_id, event_type, title, entity_name, event_time)
VALUES
  ('77777777-7777-7777-7777-777777777771', '11111111-1111-1111-1111-111111111111', (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1), 'registration', 'New patient registered', 'Sarah Johnson', NOW() - INTERVAL '10 minute'),
  ('77777777-7777-7777-7777-777777777772', '11111111-1111-1111-1111-111111111111', (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1), 'record', 'Medical record updated', 'Mike Chen', NOW() - INTERVAL '25 minute'),
  ('77777777-7777-7777-7777-777777777773', '11111111-1111-1111-1111-111111111111', (SELECT id FROM branches WHERE organization_id = '11111111-1111-1111-1111-111111111111' AND is_default = true LIMIT 1), 'record', 'Lab review completed', 'Emma Davis', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

