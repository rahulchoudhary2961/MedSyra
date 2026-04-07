const { getRequestMeta, logError, logWarn } = require("../utils/logger");

const errorHandler = (error, req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";

  const payload = {
    ...getRequestMeta(req),
    statusCode,
    message,
    details: error.details || null,
    stack: statusCode >= 500 ? error.stack : undefined
  };

  if (statusCode >= 500) {
    logError("api_error", payload);
  } else if (statusCode >= 400) {
    logWarn("api_client_error", payload);
  }

  if (res.headersSent) {
    return res.end();
  }

  res.status(statusCode).json({
    success: false,
    message,
    details: error.details || null
  });
};

module.exports = errorHandler;
