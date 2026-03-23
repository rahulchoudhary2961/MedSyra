const env = require("../config/env");

const sendVerificationEmail = async ({ email, token }) => {
  if (env.nodeEnv === "production") {
    console.info(`[AUTH] Verification email queued for ${email}`);
    return;
  }

  console.info(`[AUTH][DEV] Email verification token for ${email}: ${token}`);
};

const sendPasswordResetEmail = async ({ email, token }) => {
  if (env.nodeEnv === "production") {
    console.info(`[AUTH] Password reset email queued for ${email}`);
    return;
  }

  console.info(`[AUTH][DEV] Password reset token for ${email}: ${token}`);
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
