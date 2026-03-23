const express = require("express");
const controller = require("../controllers/auth.controller");
const requireAuth = require("../middlewares/require-auth");
const validateRequest = require("../middlewares/validate-request");
const { signupLimiter, signinLimiter, recoveryLimiter } = require("../middlewares/abuse-protection");
const { authSchemas } = require("../validators/schemas");

const router = express.Router();

router.post(
  "/signup",
  signupLimiter,
  validateRequest({ body: authSchemas.signupBody }),
  controller.signup
);
router.post(
  "/signin",
  signinLimiter,
  validateRequest({ body: authSchemas.signinBody }),
  controller.signin
);
router.post(
  "/verify-email",
  recoveryLimiter,
  validateRequest({ body: authSchemas.verifyEmailBody }),
  controller.verifyEmail
);
router.post(
  "/resend-verification",
  recoveryLimiter,
  validateRequest({ body: authSchemas.resendVerificationBody }),
  controller.resendVerificationEmail
);
router.post(
  "/request-password-reset",
  recoveryLimiter,
  validateRequest({ body: authSchemas.requestPasswordResetBody }),
  controller.requestPasswordReset
);
router.post(
  "/reset-password",
  recoveryLimiter,
  validateRequest({ body: authSchemas.resetPasswordBody }),
  controller.resetPassword
);
router.get("/me", requireAuth, controller.me);

module.exports = router;
