const pool = require("../config/db");

const createUser = async ({
  organizationId,
  fullName,
  email,
  phone,
  role,
  passwordHash,
  emailVerifiedAt = null
}) => {
  const query = `
    INSERT INTO users (
      organization_id, full_name, email, phone, role, password_hash, email_verified_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, organization_id, full_name, email, phone, role, email_verified_at, created_at
  `;

  const values = [organizationId, fullName, email.toLowerCase(), phone, role, passwordHash, emailVerifiedAt];
  const { rows } = await pool.query(query, values);
  return rows[0];
};

const findUserByEmail = async (email) => {
  const query = `
    SELECT id, organization_id, full_name, email, phone, role, password_hash,
           email_verified_at, failed_login_attempts, locked_until, created_at
    FROM users
    WHERE LOWER(email) = LOWER($1)
  `;
  const { rows } = await pool.query(query, [email]);
  return rows[0] || null;
};

const findUserById = async (id) => {
  const query = `
    SELECT id, organization_id, full_name, email, phone, role, email_verified_at, created_at
    FROM users
    WHERE id = $1
  `;
  const { rows } = await pool.query(query, [id]);
  return rows[0] || null;
};

const setEmailVerificationToken = async ({ userId, tokenHash, expiresAt }) => {
  const query = `
    UPDATE users
    SET email_verification_token_hash = $2,
        email_verification_expires_at = $3,
        updated_at = NOW()
    WHERE id = $1
  `;
  await pool.query(query, [userId, tokenHash, expiresAt]);
};

const verifyEmailWithToken = async ({ email, tokenHash }) => {
  const query = `
    UPDATE users
    SET email_verified_at = NOW(),
        email_verification_token_hash = NULL,
        email_verification_expires_at = NULL,
        updated_at = NOW()
    WHERE LOWER(email) = LOWER($1)
      AND email_verified_at IS NULL
      AND email_verification_token_hash = $2
      AND email_verification_expires_at IS NOT NULL
      AND email_verification_expires_at > NOW()
    RETURNING id, organization_id, full_name, email, phone, role, email_verified_at, created_at
  `;

  const { rows } = await pool.query(query, [email, tokenHash]);
  return rows[0] || null;
};

const setPasswordResetToken = async ({ userId, tokenHash, expiresAt }) => {
  const query = `
    UPDATE users
    SET password_reset_token_hash = $2,
        password_reset_expires_at = $3,
        updated_at = NOW()
    WHERE id = $1
  `;
  await pool.query(query, [userId, tokenHash, expiresAt]);
};

const resetPasswordWithToken = async ({ email, tokenHash, newPasswordHash }) => {
  const query = `
    UPDATE users
    SET password_hash = $3,
        password_reset_token_hash = NULL,
        password_reset_expires_at = NULL,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
    WHERE LOWER(email) = LOWER($1)
      AND password_reset_token_hash = $2
      AND password_reset_expires_at IS NOT NULL
      AND password_reset_expires_at > NOW()
    RETURNING id
  `;

  const { rows } = await pool.query(query, [email, tokenHash, newPasswordHash]);
  return rows[0] || null;
};

const recordFailedLoginAttempt = async ({ userId, maxAttempts, lockMinutes }) => {
  const query = `
    UPDATE users
    SET failed_login_attempts = CASE
          WHEN locked_until IS NOT NULL AND locked_until > NOW() THEN failed_login_attempts
          ELSE failed_login_attempts + 1
        END,
        locked_until = CASE
          WHEN locked_until IS NOT NULL AND locked_until > NOW() THEN locked_until
          WHEN failed_login_attempts + 1 >= $2 THEN NOW() + ($3::text || ' minutes')::interval
          ELSE NULL
        END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING failed_login_attempts, locked_until
  `;

  const { rows } = await pool.query(query, [userId, maxAttempts, lockMinutes]);
  return rows[0] || null;
};

const recordSuccessfulLogin = async (userId) => {
  const query = `
    UPDATE users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
  `;
  await pool.query(query, [userId]);
};

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  setEmailVerificationToken,
  verifyEmailWithToken,
  setPasswordResetToken,
  resetPasswordWithToken,
  recordFailedLoginAttempt,
  recordSuccessfulLogin
};
