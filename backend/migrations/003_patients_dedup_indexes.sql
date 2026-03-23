CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_phone_active
ON patients (organization_id, regexp_replace(phone, '[^0-9]', '', 'g'))
WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_email_active
ON patients (organization_id, lower(email))
WHERE is_active = true AND email IS NOT NULL;
