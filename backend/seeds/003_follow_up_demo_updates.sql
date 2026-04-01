UPDATE medical_records
SET
  follow_up_date = CURRENT_DATE - INTERVAL '28 day',
  follow_up_reminder_status = 'sent',
  follow_up_reminder_sent_at = CURRENT_TIMESTAMP - INTERVAL '29 day',
  follow_up_reminder_error = NULL,
  follow_up_reminder_last_attempt_at = CURRENT_TIMESTAMP - INTERVAL '29 day'
WHERE id = '66666666-6666-6666-6666-666666666663';

UPDATE medical_records
SET
  follow_up_date = CURRENT_DATE + INTERVAL '3 day',
  follow_up_reminder_status = 'pending',
  follow_up_reminder_sent_at = NULL,
  follow_up_reminder_error = NULL,
  follow_up_reminder_last_attempt_at = NULL
WHERE id = '66666666-6666-6666-6666-666666666664';
