const { sendMail } = require("./mail.service");

const sendVerificationEmail = async ({ email, token }) => {
  const text = [
    "Verify your MedSyra account",
    "",
    "Use the verification token below to verify your email:",
    token
  ].join("\n");

  const sent = await sendMail({
    to: email,
    subject: "Verify your MedSyra email",
    text
  });

  if (!sent) {
    console.info(`[AUTH][DEV] Email verification token for ${email}: ${token}`);
  }
};

const sendPasswordResetEmail = async ({ email, token }) => {
  const text = [
    "Reset your MedSyra password",
    "",
    "Use the reset token below to change your password:",
    token
  ].join("\n");

  const sent = await sendMail({
    to: email,
    subject: "Reset your MedSyra password",
    text
  });

  if (!sent) {
    console.info(`[AUTH][DEV] Password reset token for ${email}: ${token}`);
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
