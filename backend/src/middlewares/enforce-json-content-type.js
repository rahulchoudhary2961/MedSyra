const ApiError = require("../utils/api-error");

const METHODS_REQUIRING_JSON = new Set(["POST", "PUT", "PATCH"]);

const enforceJsonContentType = (req, _res, next) => {
  if (!METHODS_REQUIRING_JSON.has(req.method)) {
    return next();
  }

  const contentType = req.headers["content-type"] || "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    return next(new ApiError(415, "File uploads are not supported"));
  }

  if (!req.is("application/json")) {
    return next(new ApiError(415, "Content-Type must be application/json"));
  }

  return next();
};

module.exports = enforceJsonContentType;
