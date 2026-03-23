const asyncHandler = require("../utils/async-handler");
const authService = require("../services/auth.service");
const { getRequestMeta, logInfo, logSecurity } = require("../utils/logger");

const normalizeEmail = (email) => (typeof email === "string" ? email.trim().toLowerCase() : null);

const signup = asyncHandler(async (req, res) => {
  try {
    const result = await authService.signup(req.body);
    logInfo("auth_signup_success", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email)
    });

    res.status(201).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    logSecurity("auth_signup_failed", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email),
      statusCode: error.statusCode || 500,
      reason: error.message
    });
    throw error;
  }
});

const signin = asyncHandler(async (req, res) => {
  try {
    const result = await authService.signin(req.body);
    logInfo("auth_signin_success", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email)
    });

    res.json({
      success: true,
      message: "Signed in successfully",
      data: result
    });
  } catch (error) {
    logSecurity("auth_signin_failed", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email),
      statusCode: error.statusCode || 500,
      reason: error.message
    });
    throw error;
  }
});

const verifyEmail = asyncHandler(async (req, res) => {
  try {
    const result = await authService.verifyEmail(req.body);
    logInfo("auth_verify_email_success", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email)
    });
    res.json({ success: true, message: result.message });
  } catch (error) {
    logSecurity("auth_verify_email_failed", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email),
      statusCode: error.statusCode || 500,
      reason: error.message
    });
    throw error;
  }
});

const resendVerificationEmail = asyncHandler(async (req, res) => {
  const result = await authService.resendVerificationEmail(req.body);
  res.json({ success: true, message: result.message });
});

const requestPasswordReset = asyncHandler(async (req, res) => {
  const result = await authService.requestPasswordReset(req.body);
  logInfo("auth_password_reset_requested", {
    ...getRequestMeta(req),
    email: normalizeEmail(req.body?.email)
  });
  res.json({ success: true, message: result.message });
});

const resetPassword = asyncHandler(async (req, res) => {
  try {
    const result = await authService.resetPassword(req.body);
    logInfo("auth_password_reset_success", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email)
    });
    res.json({ success: true, message: result.message });
  } catch (error) {
    logSecurity("auth_password_reset_failed", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email),
      statusCode: error.statusCode || 500,
      reason: error.message
    });
    throw error;
  }
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.sub);

  res.json({
    success: true,
    data: user
  });
});

module.exports = {
  signup,
  signin,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPassword,
  me
};
