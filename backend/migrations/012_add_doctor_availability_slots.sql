ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS work_start_time TIME,
  ADD COLUMN IF NOT EXISTS work_end_time TIME,
  ADD COLUMN IF NOT EXISTS break_start_time TIME,
  ADD COLUMN IF NOT EXISTS break_end_time TIME,
  ADD COLUMN IF NOT EXISTS holiday_dates TEXT;

UPDATE doctors
SET
  work_start_time = COALESCE(work_start_time, '10:00'),
  work_end_time = COALESCE(work_end_time, '18:00'),
  break_start_time = COALESCE(break_start_time, '13:00'),
  break_end_time = COALESCE(break_end_time, '13:30');
