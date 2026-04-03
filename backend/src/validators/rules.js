const ApiError = require("../utils/api-error");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;
const HTML_LIKE_REGEX = /<[^>]*>/;
const SCRIPT_INJECTION_REGEX = /javascript\s*:|<\s*script|on\w+\s*=|data\s*:\s*text\/html/i;

const rejectUnsafeString = (value, fieldName) => {
  if (CONTROL_CHAR_REGEX.test(value)) {
    throw new ApiError(400, `Invalid control characters in ${fieldName}`);
  }

  if (HTML_LIKE_REGEX.test(value) || SCRIPT_INJECTION_REGEX.test(value)) {
    throw new ApiError(400, `Unsafe content detected in ${fieldName}`);
  }
};

const normalizeString = (value, { trim = true, lowercase = false } = {}) => {
  let normalized = value.normalize("NFKC");

  if (trim) {
    normalized = normalized.trim();
  }

  if (lowercase) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
};

const optional = (rule) => (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return rule(value, fieldName);
};

const stringRule = (options = {}) => (value, fieldName) => {
  if (typeof value !== "string") {
    throw new ApiError(400, `${fieldName} must be a string`);
  }

  const normalized = normalizeString(value, {
    trim: options.trim !== false,
    lowercase: options.lowercase === true
  });

  if (!options.allowEmpty && normalized.length === 0) {
    throw new ApiError(400, `${fieldName} cannot be empty`);
  }

  if (options.minLength && normalized.length < options.minLength) {
    throw new ApiError(400, `${fieldName} must be at least ${options.minLength} characters`);
  }

  if (options.maxLength && normalized.length > options.maxLength) {
    throw new ApiError(400, `${fieldName} must be at most ${options.maxLength} characters`);
  }

  if (options.safe !== false) {
    rejectUnsafeString(normalized, fieldName);
  }

  if (options.pattern && !options.pattern.test(normalized)) {
    throw new ApiError(400, `${fieldName} has invalid format`);
  }

  if (options.enumValues && !options.enumValues.includes(normalized)) {
    throw new ApiError(400, `${fieldName} must be one of: ${options.enumValues.join(", ")}`);
  }

  return normalized;
};

const integerRule = (options = {}) => (value, fieldName) => {
  const parsed =
    typeof value === "number"
      ? value
      : options.coerceString && typeof value === "string" && value.trim() !== ""
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed)) {
    throw new ApiError(400, `${fieldName} must be an integer`);
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new ApiError(400, `${fieldName} must be >= ${options.min}`);
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new ApiError(400, `${fieldName} must be <= ${options.max}`);
  }

  return parsed;
};

const numberRule = (options = {}) => (value, fieldName) => {
  const parsed =
    typeof value === "number"
      ? value
      : options.coerceString && typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, `${fieldName} must be a number`);
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new ApiError(400, `${fieldName} must be >= ${options.min}`);
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new ApiError(400, `${fieldName} must be <= ${options.max}`);
  }

  return parsed;
};

const booleanRule = () => (value, fieldName) => {
  if (typeof value !== "boolean") {
    throw new ApiError(400, `${fieldName} must be a boolean`);
  }

  return value;
};

const uuidRule = () => (value, fieldName) => {
  const normalized = stringRule({ minLength: 36, maxLength: 36, safe: false })(value, fieldName);
  if (!UUID_REGEX.test(normalized)) {
    throw new ApiError(400, `${fieldName} must be a valid UUID`);
  }
  return normalized;
};

const emailRule = () => (value, fieldName) => {
  const normalized = stringRule({ minLength: 5, maxLength: 254, lowercase: true })(value, fieldName);
  if (!EMAIL_REGEX.test(normalized)) {
    throw new ApiError(400, `${fieldName} must be a valid email address`);
  }
  return normalized;
};

const phoneRule = (options = {}) => {
  if (options.strictTenDigits) {
    return stringRule({ minLength: 10, maxLength: 10, pattern: /^\d{10}$/ });
  }

  return stringRule({ minLength: 7, maxLength: 20, pattern: /^[+()\-\s\d]+$/ });
};

const dateRule = () => (value, fieldName) => {
  const normalized = stringRule({ minLength: 10, maxLength: 10, safe: false })(value, fieldName);
  if (!DATE_REGEX.test(normalized) || Number.isNaN(Date.parse(normalized))) {
    throw new ApiError(400, `${fieldName} must be a valid date in YYYY-MM-DD format`);
  }
  return normalized;
};

const timeRule = () => (value, fieldName) => {
  const normalized = stringRule({ minLength: 5, maxLength: 8, safe: false })(value, fieldName);
  if (!TIME_REGEX.test(normalized)) {
    throw new ApiError(400, `${fieldName} must be a valid time (HH:MM or HH:MM:SS)`);
  }
  return normalized;
};

const passwordRule = () => (value, fieldName) => {
  const normalized = stringRule({ minLength: 8, maxLength: 128, safe: false })(value, fieldName);

  if (
    !/[a-z]/.test(normalized) ||
    !/[A-Z]/.test(normalized) ||
    !/\d/.test(normalized) ||
    !/[^A-Za-z0-9]/.test(normalized)
  ) {
    throw new ApiError(
      400,
      `${fieldName} must include uppercase, lowercase, number, and special character`
    );
  }

  return normalized;
};

const urlRule = () => (value, fieldName) => {
  const normalized = stringRule({ minLength: 10, maxLength: 2048, safe: false })(value, fieldName);

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (_error) {
    throw new ApiError(400, `${fieldName} must be a valid URL`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ApiError(400, `${fieldName} must use http or https protocol`);
  }

  return normalized;
};

const relativeUploadPathRule = () => (value, fieldName) => {
  const normalized = stringRule({ minLength: 2, maxLength: 2048, safe: false })(value, fieldName);

  if (!normalized.startsWith("/uploads/")) {
    throw new ApiError(400, `${fieldName} must be a valid upload path`);
  }

  if (normalized.includes("..")) {
    throw new ApiError(400, `${fieldName} must not contain path traversal`);
  }

  return normalized;
};

module.exports = {
  optional,
  stringRule,
  integerRule,
  numberRule,
  booleanRule,
  uuidRule,
  emailRule,
  phoneRule,
  dateRule,
  timeRule,
  passwordRule,
  urlRule,
  relativeUploadPathRule
};
