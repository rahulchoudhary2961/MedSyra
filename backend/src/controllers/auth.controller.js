const asyncHandler = require("../utils/async-handler");
const authService = require("../services/auth.service");
const { logAuditEventSafe } = require("../services/audit.service");
const { getRequestMeta, logInfo, logSecurity } = require("../utils/logger");
const { clearAuthCookie, setAuthCookie } = require("../utils/auth-cookie");

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
    setAuthCookie(res, result.token);
    logAuditEventSafe({
      organizationId: result.user.organization_id,
      actor: {
        sub: result.user.id,
        role: result.user.role
      },
      requestMeta: getRequestMeta(req),
      module: "auth",
      action: "signin_success",
      summary: `User signed in: ${result.user.full_name}`,
      entityType: "user",
      entityId: result.user.id,
      entityLabel: result.user.email,
      metadata: {
        role: result.user.role
      },
      afterState: {
        id: result.user.id,
        full_name: result.user.full_name,
        email: result.user.email,
        role: result.user.role
      }
    });
    logInfo("auth_signin_success", {
      ...getRequestMeta(req),
      email: normalizeEmail(req.body?.email)
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      message: "Signed in successfully",
      data: {
        token: result.token,
        user: result.user
      }
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

const logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    success: true,
    message: "Signed out successfully"
  });
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

const listUsers = asyncHandler(async (req, res) => {
  const data = await authService.listUsers(req.user.organizationId, req.query);
  res.json({ success: true, data: { items: data } });
});

const createStaff = asyncHandler(async (req, res) => {
  const data = await authService.createStaff(req.user.organizationId, req.body);
  logAuditEventSafe({
    organizationId: req.user.organizationId,
    actor: req.user,
    requestMeta: getRequestMeta(req),
    module: "auth",
    action: "staff_created",
    summary: `Staff account created: ${data.full_name}`,
    entityType: "user",
    entityId: data.id,
    entityLabel: data.email,
    metadata: {
      role: data.role
    },
    afterState: data
  });
  res.status(201).json({
    success: true,
    message: "Staff member added and setup email sent",
    data
  });
});

const resendStaffSetup = asyncHandler(async (req, res) => {
  const data = await authService.resendStaffSetup(req.user.organizationId, req.params.id);
  logAuditEventSafe({
    organizationId: req.user.organizationId,
    actor: req.user,
    requestMeta: getRequestMeta(req),
    module: "auth",
    action: "staff_setup_resent",
    summary: `Staff setup resent: ${data.full_name}`,
    entityType: "user",
    entityId: data.id,
    entityLabel: data.email,
    metadata: {
      role: data.role
    }
  });
  res.json({
    success: true,
    message: "Setup email sent",
    data
  });
});

const updateStaffNotificationPreferences = asyncHandler(async (req, res) => {
  const data = await authService.updateStaffNotificationPreferences(req.user.organizationId, req.params.id, req.body);
  logAuditEventSafe({
    organizationId: req.user.organizationId,
    actor: req.user,
    requestMeta: getRequestMeta(req),
    module: "auth",
    action: "staff_notifications_updated",
    summary: `Staff notification preferences updated: ${data.full_name}`,
    entityType: "user",
    entityId: data.id,
    entityLabel: data.email,
    metadata: {
      notifyDailyScheduleSms: data.notify_daily_schedule_sms === true,
      notifyDailyScheduleEmail: data.notify_daily_schedule_email === true
    },
    afterState: data
  });
  res.json({
    success: true,
    message: "Staff notification preferences updated",
    data
  });
});

module.exports = {
  signup,
  signin,
  logout,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset,
  resetPassword,
  me,
  listUsers,
  createStaff,
  resendStaffSetup,
  updateStaffNotificationPreferences
};
