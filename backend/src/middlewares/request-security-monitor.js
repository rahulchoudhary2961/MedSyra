const env = require("../config/env");
const { logSecurity, getRequestMeta } = require("../utils/logger");

const minuteHits = new Map();

const registerTrafficHit = (ip, now) => {
  const currentWindow = Math.floor(now / 60000);
  const existing = minuteHits.get(ip);

  if (!existing || existing.window !== currentWindow) {
    const initial = { window: currentWindow, count: 1, alerted: false };
    minuteHits.set(ip, initial);
    return initial;
  }

  existing.count += 1;
  minuteHits.set(ip, existing);
  return existing;
};

const suspiciousInputPattern = /(<script|%3cscript|\/\.\.|union(?:\s|\+)select|drop(?:\s|\+)table|or(?:\s|\+)1=1|cmd=)/i;

const requestSecurityMonitor = (req, _res, next) => {
  const now = Date.now();
  const hit = registerTrafficHit(req.ip || "unknown", now);

  if (!hit.alerted && hit.count > env.unusualTrafficThresholdPerMinute) {
    hit.alerted = true;
    minuteHits.set(req.ip || "unknown", hit);
    logSecurity("unusual_traffic_rate", {
      ...getRequestMeta(req),
      requestsInMinute: hit.count
    });
  }

  const fullPath = `${req.originalUrl || ""}`;
  if (suspiciousInputPattern.test(fullPath)) {
    logSecurity("suspicious_request_pattern", {
      ...getRequestMeta(req),
      matchedOn: "url"
    });
  }

  if (typeof req.url === "string" && req.url.length > env.maxUrlLength) {
    logSecurity("oversized_url_detected", {
      ...getRequestMeta(req),
      urlLength: req.url.length
    });
  }

  next();
};

module.exports = requestSecurityMonitor;
