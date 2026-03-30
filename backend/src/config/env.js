const dotenv = require("dotenv");

dotenv.config();

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const required = ["PORT", "DATABASE_URL", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  redisUrl: process.env.REDIS_URL || "",
  cacheDefaultTtlSeconds: Number(process.env.CACHE_DEFAULT_TTL_SECONDS || 60),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  trustProxy: parseBoolean(process.env.TRUST_PROXY, process.env.NODE_ENV === "production"),
  requireHttps: parseBoolean(process.env.REQUIRE_HTTPS, process.env.NODE_ENV === "production"),
  unusualTrafficThresholdPerMinute: Number(process.env.UNUSUAL_TRAFFIC_THRESHOLD_PER_MINUTE || 120),
  maxUrlLength: Number(process.env.MAX_URL_LENGTH || 2048),
  apiRateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX || 300),
  loginRateLimitWindowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  signupRateLimitWindowMs: Number(process.env.SIGNUP_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000),
  signupRateLimitMax: Number(process.env.SIGNUP_RATE_LIMIT_MAX || 5),
  recoveryRateLimitWindowMs: Number(process.env.RECOVERY_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  recoveryRateLimitMax: Number(process.env.RECOVERY_RATE_LIMIT_MAX || 10),
  readRateLimitWindowMs: Number(process.env.READ_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  readRateLimitMax: Number(process.env.READ_RATE_LIMIT_MAX || 120),
  writeRateLimitWindowMs: Number(process.env.WRITE_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  writeRateLimitMax: Number(process.env.WRITE_RATE_LIMIT_MAX || 90),
  aiRateLimitWindowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  aiRateLimitMax: Number(process.env.AI_RATE_LIMIT_MAX || 20),
  blockAutomationUserAgents: parseBoolean(
    process.env.BLOCK_AUTOMATION_USER_AGENTS,
    process.env.NODE_ENV === "production"
  ),
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  emailVerificationTokenMinutes: Number(process.env.EMAIL_VERIFICATION_TOKEN_MINUTES || 60),
  passwordResetTokenMinutes: Number(process.env.PASSWORD_RESET_TOKEN_MINUTES || 30),
  leadsEmailTo: process.env.LEADS_EMAIL_TO || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL || ""
};

const weakJwtSecret = env.jwtSecret.length < 32 || env.jwtSecret.toLowerCase().includes("change-this-secret");

if (env.nodeEnv === "production" && weakJwtSecret) {
  throw new Error("JWT_SECRET must be at least 32 characters and must not use default placeholder values");
}

if (env.nodeEnv === "production" && env.corsOrigin === "*") {
  throw new Error("CORS_ORIGIN cannot be '*' in production");
}

module.exports = env;
