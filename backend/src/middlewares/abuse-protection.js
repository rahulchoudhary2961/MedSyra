const env = require("../config/env");
const createRateLimiter = require("./rate-limit");

const byIp = (scope) => (req) => `${scope}:${req.ip}`;
const byIpAndEmail = (scope) => (req) => `${scope}:${req.ip}:${(req.body?.email || "").toLowerCase()}`;
const byUserOrIp = (scope) => (req) => {
  const userId = req.user?.sub || "anonymous";
  return `${scope}:${req.ip}:${userId}`;
};

const applyToMethods = (methods, middleware) => {
  const allowed = new Set(methods.map((method) => method.toUpperCase()));
  return (req, res, next) => {
    if (!allowed.has(req.method.toUpperCase())) {
      return next();
    }

    return middleware(req, res, next);
  };
};

const globalApiLimiter = createRateLimiter({
  windowMs: env.apiRateLimitWindowMs,
  max: env.apiRateLimitMax,
  message: "Too many API requests. Please slow down and try again.",
  keyGenerator: byIp("api")
});

const signupLimiter = createRateLimiter({
  windowMs: env.signupRateLimitWindowMs,
  max: env.signupRateLimitMax,
  message: "Too many account creation attempts. Please try again later.",
  keyGenerator: byIp("signup")
});

const leadCaptureLimiter = createRateLimiter({
  windowMs: env.signupRateLimitWindowMs,
  max: env.signupRateLimitMax,
  message: "Too many demo requests. Please try again later.",
  keyGenerator: byIp("lead-capture")
});

const signinLimiter = createRateLimiter({
  windowMs: env.loginRateLimitWindowMs,
  max: env.loginRateLimitMax,
  message: "Too many sign-in attempts. Please try again later.",
  keyGenerator: byIpAndEmail("signin")
});

const recoveryLimiter = createRateLimiter({
  windowMs: env.recoveryRateLimitWindowMs,
  max: env.recoveryRateLimitMax,
  message: "Too many account recovery attempts. Please try again later.",
  keyGenerator: byIpAndEmail("recovery")
});

const protectedReadLimiter = applyToMethods(
  ["GET"],
  createRateLimiter({
    windowMs: env.readRateLimitWindowMs,
    max: env.readRateLimitMax,
    message: "Too many read requests. Please slow down.",
    keyGenerator: byUserOrIp("read")
  })
);

const protectedWriteLimiter = applyToMethods(
  ["POST", "PATCH", "PUT", "DELETE"],
  createRateLimiter({
    windowMs: env.writeRateLimitWindowMs,
    max: env.writeRateLimitMax,
    message: "Too many write requests. Please slow down.",
    keyGenerator: byUserOrIp("write")
  })
);

const aiGenerationLimiter = applyToMethods(
  ["POST"],
  createRateLimiter({
    windowMs: env.aiRateLimitWindowMs,
    max: env.aiRateLimitMax,
    message: "Too many AI generation requests. Please wait before trying again.",
    keyGenerator: byUserOrIp("ai")
  })
);

module.exports = {
  globalApiLimiter,
  leadCaptureLimiter,
  signupLimiter,
  signinLimiter,
  recoveryLimiter,
  protectedReadLimiter,
  protectedWriteLimiter,
  aiGenerationLimiter
};
