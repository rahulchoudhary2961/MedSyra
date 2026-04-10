const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("../utils/api-error");
const { getAuthTokenFromRequest } = require("../utils/auth-cookie");

const requireAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  const cookieToken = getAuthTokenFromRequest(req);
  const resolvedToken = scheme === "Bearer" && token ? token : cookieToken;

  if (!resolvedToken) {
    return next(new ApiError(401, "Authorization token is required"));
  }

  try {
    const decoded = jwt.verify(resolvedToken, env.jwtSecret);
    req.user = decoded;
    return next();
  } catch (error) {
    return next(new ApiError(401, "Invalid or expired token"));
  }
};

module.exports = requireAuth;
