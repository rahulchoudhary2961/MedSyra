const ApiError = require("../utils/api-error");
const { getRequestMeta, logSecurity } = require("../utils/logger");

const createRateLimiter = ({
  windowMs,
  max,
  keyGenerator,
  message = "Too many requests, please try again later"
}) => {
  const hits = new Map();

  const cleanup = (now) => {
    for (const [key, entry] of hits.entries()) {
      if (entry.expiresAt <= now) {
        hits.delete(key);
      }
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    cleanup(now);

    const key = keyGenerator ? keyGenerator(req) : req.ip;
    const current = hits.get(key);

    if (!current || current.expiresAt <= now) {
      hits.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    current.count += 1;
    hits.set(key, current);

    const remaining = Math.max(max - current.count, 0);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(current.expiresAt / 1000)));

    if (current.count > max) {
      const retryAfterSeconds = Math.max(Math.ceil((current.expiresAt - now) / 1000), 1);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      logSecurity("rate_limit_exceeded", {
        ...getRequestMeta(req),
        key,
        requestsInWindow: current.count,
        windowMs
      });
      return next(new ApiError(429, message));
    }

    return next();
  };
};

module.exports = createRateLimiter;
