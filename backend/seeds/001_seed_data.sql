INSERT INTO organizations (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'City General Hospital')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, organization_id, full_name, email, phone, role, password_hash, email_verified_at)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Dr. Admin',
  'admin@citygeneral.com',
  '(555) 101-0000',
  'admin',
  '$2b$12$VmdOleUvaEQ32f67/KdtqOpS0X3CtpufYDyLBnNWQfFK3/YvMImuS',
  NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO patients (id, organization_id, full_name, age, gender, phone, email, blood_type, status, last_visit_at)
VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Sarah Johnson', 32, 'female', '(555) 123-4567', 'sarah.j@email.com', 'O+', 'active', CURRENT_DATE - INTERVAL '1 day'),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Mike Chen', 45, 'male', '(555) 234-5678', 'mike.c@email.com', 'A+', 'active', CURRENT_DATE - INTERVAL '2 day'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Emma Davis', 28, 'female', '(555) 345-6789', 'emma.d@email.com', 'B+', 'follow-up', CURRENT_DATE - INTERVAL '3 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO doctors (id, organization_id, full_name, specialty, experience_years, availability, phone, email, rating, patient_count, status)
VALUES
  ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', 'Dr. Emily Smith', 'Cardiology', 15, 'Mon, Wed, Fri', '(555) 111-2222', 'e.smith@hospital.com', 4.9, 342, 'available'),
  ('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', 'Dr. Michael Williams', 'Pediatrics', 12, 'Tue, Thu, Sat', '(555) 222-3333', 'm.williams@hospital.com', 4.8, 289, 'available'),
  ('44444444-4444-4444-4444-444444444443', '11111111-1111-1111-1111-111111111111', 'Dr. Sarah Brown', 'Orthopedics', 18, 'Mon, Tue, Wed', '(555) 333-4444', 's.brown@hospital.com', 4.9, 421, 'busy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (
  id, organization_id, patient_id, doctor_id,
  appointment_date, appointment_time, appointment_type, status, notes, fee_amount
)
VALUES
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444441', CURRENT_DATE, '09:00', 'checkup', 'confirmed', 'Routine checkup', 120.00),
  ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', CURRENT_DATE, '10:30', 'follow-up', 'confirmed', 'Post-treatment review', 95.00),
  ('55555555-5555-5555-5555-555555555553', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444443', CURRENT_DATE - INTERVAL '2 day', '14:00', 'consultation', 'completed', 'Orthopedic consultation', 150.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO medical_records (
  id, organization_id, patient_id, doctor_id,
  record_type, status, record_date, notes
)
VALUES
  ('66666666-6666-6666-6666-666666666661', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333331', '44444444-4444-4444-4444-444444444441', 'Lab Results', 'completed', CURRENT_DATE - INTERVAL '1 day', 'Lipid profile normal'),
  ('66666666-6666-6666-6666-666666666662', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333332', '44444444-4444-4444-4444-444444444442', 'X-Ray', 'pending review', CURRENT_DATE - INTERVAL '2 day', 'Requires specialist review')
ON CONFLICT (id) DO NOTHING;

INSERT INTO activity_logs (id, organization_id, event_type, title, entity_name, event_time)
VALUES
  ('77777777-7777-7777-7777-777777777771', '11111111-1111-1111-1111-111111111111', 'registration', 'New patient registered', 'Sarah Johnson', NOW() - INTERVAL '10 minute'),
  ('77777777-7777-7777-7777-777777777772', '11111111-1111-1111-1111-111111111111', 'record', 'Medical record updated', 'Mike Chen', NOW() - INTERVAL '25 minute'),
  ('77777777-7777-7777-7777-777777777773', '11111111-1111-1111-1111-111111111111', 'appointment', 'Appointment scheduled', 'Emma Davis', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

