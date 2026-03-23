const ApiError = require("../utils/api-error");
const env = require("../config/env");

const enforceHttps = (req, _res, next) => {
  if (!env.requireHttps) {
    return next();
  }

  const forwardedProto = (req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  if (req.secure || forwardedProto === "https") {
    return next();
  }

  return next(new ApiError(426, "HTTPS is required for all API requests"));
};

module.exports = enforceHttps;
