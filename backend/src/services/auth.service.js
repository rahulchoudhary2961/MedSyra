const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const env = require("../config/env");
const ApiError = require("../utils/api-error");
const { USER_ROLES } = require("../constants/roles");
const authModel = require("../models/auth.model");
const {
  sendVerificationEmail,
  sendPasswordResetEmail
} = require("./auth-notification.service");

const ALLOWED_ROLES = new Set(Object.values(USER_ROLES));

const getDefaultBranch = async (organizationId) => {
  const result = await pool.query(
    `
      SELECT id, name
      FROM branches
      WHERE organization_id = $1
        AND is_default = true
      LIMIT 1
    `,
    [organizationId]
  );

  return result.rows[0] || null;
};

const getOrCreateOrganization = async (name) => {
  const normalizedName = name.trim();

  const selectQuery = "SELECT id FROM organizations WHERE name = $1";
  const existing = await pool.query(selectQuery, [normalizedName]);
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const insertQuery = `
    INSERT INTO organizations (name)
    VALUES ($1)
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  const created = await pool.query(insertQuery, [normalizedName]);
  return created.rows[0].id;
};

const ensureDefaultBranch = async (organizationId) => {
  const existing = await getDefaultBranch(organizationId);
  if (existing) {
    return existing;
  }

  const created = await pool.query(
    `
      INSERT INTO branches (organization_id, branch_code, name, is_default)
      VALUES ($1, 'MAIN', 'Main Branch', true)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `,
    [organizationId]
  );

  if (created.rows[0]) {
    return created.rows[0];
  }

  return getDefaultBranch(organizationId);
};

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const generateToken = () => crypto.randomBytes(32).toString("hex");

const buildAuthToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      organizationId: user.organization_id,
      branchId: user.branch_id || null,
      emailVerified: Boolean(user.email_verified_at)
    },
    env.jwtSecret
  );
};

const buildSetupResetToken = async (userId) => {
  const resetToken = generateToken();
  const resetTokenHash = hashToken(resetToken);
  const resetExpiresAt = new Date(Date.now() + env.passwordResetTokenMinutes * 60 * 1000);

  await authModel.setPasswordResetToken({
    userId,
    tokenHash: resetTokenHash,
    expiresAt: resetExpiresAt
  });

  return resetToken;
};

const provisionSignupAccount = async (payload) => {
  const { fullName, email, phone, role, hospitalName, password } = payload;

  if (!ALLOWED_ROLES.has(role)) {
    throw new ApiError(400, "Invalid role");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await authModel.findUserByEmail(normalizedEmail);
  if (existing) {
    throw new ApiError(409, "Email is already in use");
  }

  const organizationId = await getOrCreateOrganization(hospitalName);
  const defaultBranch = await ensureDefaultBranch(organizationId);
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await authModel.createUser({
    organizationId,
    branchId: defaultBranch.id,
    fullName,
    email: normalizedEmail,
    phone,
    role,
    passwordHash
  });

  const verificationToken = generateToken();
  const verificationTokenHash = hashToken(verificationToken);
  const verificationExpiresAt = new Date(Date.now() + env.emailVerificationTokenMinutes * 60 * 1000);

  await authModel.setEmailVerificationToken({
    userId: user.id,
    tokenHash: verificationTokenHash,
    expiresAt: verificationExpiresAt
  });

  await sendVerificationEmail({ email: normalizedEmail, token: verificationToken });

  return {
    organizationId,
    userId: user.id,
    message: "Account created. Please verify your email before signing in.",
    email: normalizedEmail
  };
};

const signup = async (payload) => {
  const result = await provisionSignupAccount(payload);
  return {
    message: result.message,
    email: result.email
  };
};

const signin = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await authModel.findUserByEmail(normalizedEmail);

  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ApiError(423, "Account temporarily locked due to failed login attempts");
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    await authModel.recordFailedLoginAttempt({
      userId: user.id,
      maxAttempts: env.maxLoginAttempts,
      lockMinutes: env.loginLockMinutes
    });

    throw new ApiError(401, "Invalid email or password");
  }

  if (!user.email_verified_at) {
    throw new ApiError(403, "Email not verified. Please verify your email before signing in.");
  }

  await authModel.recordSuccessfulLogin(user.id);

  const token = buildAuthToken(user);

  return {
    token,
    user: {
      id: user.id,
      organization_id: user.organization_id,
      branch_id: user.branch_id || null,
      branch_name: user.branch_name || null,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      email_verified_at: user.email_verified_at,
      created_at: user.created_at
    }
  };
};

const verifyEmail = async ({ email, token }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const tokenHash = hashToken(token);

  const user = await authModel.verifyEmailWithToken({
    email: normalizedEmail,
    tokenHash
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired verification token");
  }

  return { message: "Email verified successfully" };
};

const resendVerificationEmail = async ({ email }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await authModel.findUserByEmail(normalizedEmail);

  if (!user || user.email_verified_at) {
    return { message: "If the email exists, a verification email has been sent" };
  }

  const verificationToken = generateToken();
  const verificationTokenHash = hashToken(verificationToken);
  const verificationExpiresAt = new Date(Date.now() + env.emailVerificationTokenMinutes * 60 * 1000);

  await authModel.setEmailVerificationToken({
    userId: user.id,
    tokenHash: verificationTokenHash,
    expiresAt: verificationExpiresAt
  });

  await sendVerificationEmail({ email: normalizedEmail, token: verificationToken });

  return { message: "If the email exists, a verification email has been sent" };
};

const requestPasswordReset = async ({ email }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await authModel.findUserByEmail(normalizedEmail);

  if (!user) {
    return { message: "If the email exists, a reset token has been sent" };
  }

  const resetToken = generateToken();
  const resetTokenHash = hashToken(resetToken);
  const resetExpiresAt = new Date(Date.now() + env.passwordResetTokenMinutes * 60 * 1000);

  await authModel.setPasswordResetToken({
    userId: user.id,
    tokenHash: resetTokenHash,
    expiresAt: resetExpiresAt
  });

  await sendPasswordResetEmail({ email: normalizedEmail, token: resetToken });

  return { message: "If the email exists, a reset token has been sent" };
};

const resetPassword = async ({ email, token, newPassword }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const resetTokenHash = hashToken(token);
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  const updated = await authModel.resetPasswordWithToken({
    email: normalizedEmail,
    tokenHash: resetTokenHash,
    newPasswordHash
  });

  if (!updated) {
    throw new ApiError(400, "Invalid or expired reset token");
  }

  return { message: "Password reset successful" };
};

const getMe = async (userId) => {
  const user = await authModel.findUserById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

const listUsers = async (organizationId, query) => {
  return authModel.listUsersByOrganization(organizationId, query.role || null);
};

const createStaff = async (organizationId, payload) => {
  const {
    fullName,
    email,
    phone,
    role,
    branchId,
    notifyDailyScheduleSms = false,
    notifyDailyScheduleEmail = true
  } = payload;
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await authModel.findUserByEmail(normalizedEmail);

  if (existing) {
    if (existing.organization_id === organizationId) {
      throw new ApiError(409, "A staff account with this email already exists in your organization");
    }

    throw new ApiError(409, "Email is already in use by another organization");
  }

  const temporaryPassword = generateToken();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const defaultBranch = await ensureDefaultBranch(organizationId);
  const user = await authModel.createUser({
    organizationId,
    branchId: branchId || defaultBranch.id,
    fullName,
    email: normalizedEmail,
    phone,
    role,
    passwordHash,
    emailVerifiedAt: new Date(),
    notifyDailyScheduleSms,
    notifyDailyScheduleEmail
  });

  const resetToken = await buildSetupResetToken(user.id);
  await sendPasswordResetEmail({ email: normalizedEmail, token: resetToken });

  return {
    ...user,
    setup_sent: true
  };
};

const updateStaffNotificationPreferences = async (organizationId, userId, payload) => {
  const updated = await authModel.updateStaffNotificationPreferences({
    organizationId,
    userId,
    notifyDailyScheduleSms: payload.notifyDailyScheduleSms === true,
    notifyDailyScheduleEmail: payload.notifyDailyScheduleEmail === true
  });

  if (!updated) {
    throw new ApiError(404, "Staff member not found");
  }

  return updated;
};

const resendStaffSetup = async (organizationId, userId) => {
  const user = await authModel.findUserByIdAndOrganization(organizationId, userId);
  if (!user) {
    throw new ApiError(404, "Staff member not found");
  }

  const resetToken = await buildSetupResetToken(user.id);
  await sendPasswordResetEmail({ email: user.email, token: resetToken });

  return {
    ...user,
    setup_sent: true
  };
};

module.exports = {
  provisionSignupAccount,
  signup,
  signin,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPassword,
  getMe,
  listUsers,
  createStaff,
  resendStaffSetup,
  updateStaffNotificationPreferences
};
