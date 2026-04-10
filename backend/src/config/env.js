const dotenv = require("dotenv");

dotenv.config();

const resolvedNodeEnv = process.env.NODE_ENV || "development";
const isProduction = resolvedNodeEnv === "production";

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
  nodeEnv: resolvedNodeEnv,
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  dbApplicationName: process.env.DB_APPLICATION_NAME || "medsyra-api",
  dbPoolMax: Number(process.env.DB_POOL_MAX || 15),
  dbMaxUses: Number(process.env.DB_MAX_USES || 7500),
  dbIdleTimeoutMs: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  dbConnectionTimeoutMs: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
  dbStatementTimeoutMs: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 0),
  dbQueryTimeoutMs: Number(process.env.DB_QUERY_TIMEOUT_MS || 0),
  dbLockTimeoutMs: Number(process.env.DB_LOCK_TIMEOUT_MS || 0),
  dbIdleInTransactionSessionTimeoutMs: Number(process.env.DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS || 0),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  redisUrl: process.env.REDIS_URL || "",
  cacheDefaultTtlSeconds: Number(process.env.CACHE_DEFAULT_TTL_SECONDS || 60),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "10mb",
  webhookJsonBodyLimit: process.env.WEBHOOK_JSON_BODY_LIMIT || "1mb",
  trustProxy: parseBoolean(process.env.TRUST_PROXY, process.env.NODE_ENV === "production"),
  requireHttps: parseBoolean(process.env.REQUIRE_HTTPS, process.env.NODE_ENV === "production"),
  authCookieName: process.env.AUTH_COOKIE_NAME || "medsyra_session",
  authCookieSameSite: String(process.env.AUTH_COOKIE_SAME_SITE || "lax").toLowerCase(),
  authCookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, process.env.NODE_ENV === "production"),
  authCookieDomain: process.env.AUTH_COOKIE_DOMAIN || "",
  authCookiePath: process.env.AUTH_COOKIE_PATH || "/",
  fileStorageProvider: String(process.env.FILE_STORAGE_PROVIDER || "local").toLowerCase(),
  r2AccountId: process.env.R2_ACCOUNT_ID || "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  r2BucketName: process.env.R2_BUCKET_NAME || "",
  r2Endpoint: process.env.R2_ENDPOINT || "",
  r2Region: process.env.R2_REGION || "auto",
  runtimeDiagnosticsEnabled: parseBoolean(process.env.RUNTIME_DIAGNOSTICS_ENABLED, true),
  slowRequestThresholdMs: Number(process.env.SLOW_REQUEST_THRESHOLD_MS || 750),
  diagnosticsLogIntervalMs: Number(process.env.DIAGNOSTICS_LOG_INTERVAL_MS || 5 * 60 * 1000),
  eventLoopResolutionMs: Number(process.env.EVENT_LOOP_RESOLUTION_MS || 20),
  eventLoopDelayWarnMs: Number(process.env.EVENT_LOOP_DELAY_WARN_MS || 120),
  memoryUsageWarnMb: Number(process.env.MEMORY_USAGE_WARN_MB || 768),
  unusualTrafficThresholdPerMinute: Number(process.env.UNUSUAL_TRAFFIC_THRESHOLD_PER_MINUTE || 120),
  maxUrlLength: Number(process.env.MAX_URL_LENGTH || 2048),
  apiRateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX || (isProduction ? 300 : 5000)),
  loginRateLimitWindowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  signupRateLimitWindowMs: Number(process.env.SIGNUP_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000),
  signupRateLimitMax: Number(process.env.SIGNUP_RATE_LIMIT_MAX || 5),
  recoveryRateLimitWindowMs: Number(process.env.RECOVERY_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  recoveryRateLimitMax: Number(process.env.RECOVERY_RATE_LIMIT_MAX || 10),
  readRateLimitWindowMs: Number(process.env.READ_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  readRateLimitMax: Number(process.env.READ_RATE_LIMIT_MAX || (isProduction ? 120 : 5000)),
  writeRateLimitWindowMs: Number(process.env.WRITE_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  writeRateLimitMax: Number(process.env.WRITE_RATE_LIMIT_MAX || (isProduction ? 90 : 2000)),
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
  brevoApiKey: process.env.BREVO_API_KEY || "",
  brevoFromEmail: process.env.BREVO_FROM_EMAIL || "",
  brevoFromName: process.env.BREVO_FROM_NAME || "",
  httpsmsApiKey: process.env.HTTPSMS_API_KEY || "",
  httpsmsFromNumber: process.env.HTTPSMS_FROM_NUMBER || "",
  smsProvider: process.env.SMS_PROVIDER || "httpsms",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
  nvidiaApiKey: process.env.NVIDIA_API_KEY || "",
  nvidiaBaseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
  nvidiaModel: process.env.NVIDIA_MODEL || "openai/gpt-oss-120b",
  ycloudApiKey: process.env.YCLOUD_API_KEY || "",
  ycloudWhatsappFrom: process.env.YCLOUD_WHATSAPP_FROM || "",
  whatsappReminderEnabled: parseBoolean(process.env.WHATSAPP_REMINDER_ENABLED, false),
  smsReminderEnabled: parseBoolean(process.env.SMS_REMINDER_ENABLED, false),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  appBaseUrl: process.env.APP_BASE_URL || process.env.CORS_ORIGIN || "http://localhost:3000"
};

const weakJwtSecret = env.jwtSecret.length < 32 || env.jwtSecret.toLowerCase().includes("change-this-secret");

if (env.nodeEnv === "production" && weakJwtSecret) {
  throw new Error("JWT_SECRET must be at least 32 characters and must not use default placeholder values");
}

if (env.nodeEnv === "production" && env.corsOrigin === "*") {
  throw new Error("CORS_ORIGIN cannot be '*' in production");
}

if (!["lax", "strict", "none"].includes(env.authCookieSameSite)) {
  throw new Error("AUTH_COOKIE_SAME_SITE must be one of: lax, strict, none");
}

if (env.authCookieSameSite === "none" && !env.authCookieSecure) {
  throw new Error("AUTH_COOKIE_SECURE must be enabled when AUTH_COOKIE_SAME_SITE is 'none'");
}

if (!["local", "r2"].includes(env.fileStorageProvider)) {
  throw new Error("FILE_STORAGE_PROVIDER must be either 'local' or 'r2'");
}

if (env.fileStorageProvider === "r2") {
  const missingR2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"].filter((key) => !process.env[key]);
  if (missingR2.length > 0) {
    throw new Error(`Missing required R2 environment variables: ${missingR2.join(", ")}`);
  }
}

module.exports = env;
