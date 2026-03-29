ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_doctors_org_user_id
ON doctors (organization_id, user_id)
WHERE user_id IS NOT NULL;

UPDATE doctors d
SET user_id = u.id
FROM users u
WHERE d.user_id IS NULL
  AND d.organization_id = u.organization_id
  AND u.role = 'doctor'
  AND d.email IS NOT NULL
  AND LOWER(d.email) = LOWER(u.email);
