const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "passwordhash",
  "password_hash"
];

const maskSensitive = (value, key = "") => {
  if (value === null || value === undefined) {
    return value;
  }

  const loweredKey = key.toLowerCase();
  if (SENSITIVE_KEYS.some((sensitiveKey) => loweredKey.includes(sensitiveKey))) {
    return "[REDACTED]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitive(item));
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [nestedKey, nestedValue]) => {
      acc[nestedKey] = maskSensitive(nestedValue, nestedKey);
      return acc;
    }, {});
  }

  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}...[truncated]`;
  }

  return value;
};

const writeLog = (level, event, payload = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...maskSensitive(payload)
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
};

const getRequestMeta = (req) => ({
  method: req.method,
  path: req.originalUrl,
  ip: req.ip,
  userAgent: req.get("user-agent") || null,
  requestId: req.get("x-request-id") || null
});

module.exports = {
  logInfo: (event, payload) => writeLog("info", event, payload),
  logWarn: (event, payload) => writeLog("warn", event, payload),
  logError: (event, payload) => writeLog("error", event, payload),
  logSecurity: (event, payload) => writeLog("warn", event, payload),
  getRequestMeta
};
