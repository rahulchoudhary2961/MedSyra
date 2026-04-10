const env = require("../config/env");

const DURATION_UNITS_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
};

const parseCookies = (cookieHeader = "") =>
  String(cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) {
        return acc;
      }

      const name = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!name) {
        return acc;
      }

      try {
        acc[name] = decodeURIComponent(value);
      } catch {
        acc[name] = value;
      }

      return acc;
    }, {});

const parseJwtExpiresInToMs = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  const match = normalized.match(/^(\d+)([smhd])$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = DURATION_UNITS_MS[unit];

  if (!Number.isFinite(amount) || !multiplier) {
    return null;
  }

  return amount * multiplier;
};

const buildAuthCookieOptions = () => {
  const maxAge = parseJwtExpiresInToMs(env.jwtExpiresIn);
  const options = {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    path: env.authCookiePath
  };

  if (env.authCookieDomain) {
    options.domain = env.authCookieDomain;
  }

  if (maxAge) {
    options.maxAge = maxAge;
  }

  return options;
};

const buildAuthCookieClearOptions = () => {
  const options = {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    path: env.authCookiePath
  };

  if (env.authCookieDomain) {
    options.domain = env.authCookieDomain;
  }

  return options;
};

const setAuthCookie = (res, token) => {
  res.cookie(env.authCookieName, token, buildAuthCookieOptions());
};

const clearAuthCookie = (res) => {
  res.clearCookie(env.authCookieName, buildAuthCookieClearOptions());
};

const getAuthTokenFromRequest = (req) => {
  const cookies = parseCookies(req.headers?.cookie || "");
  const value = cookies[env.authCookieName];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

module.exports = {
  setAuthCookie,
  clearAuthCookie,
  getAuthTokenFromRequest
};
