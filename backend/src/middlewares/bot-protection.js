const env = require("../config/env");
const ApiError = require("../utils/api-error");
const { getRequestMeta, logSecurity } = require("../utils/logger");

const AUTOMATION_USER_AGENT_PATTERN = /(bot|crawler|spider|scrapy|headless|selenium|puppeteer)/i;

const botProtection = (req, _res, next) => {
  if (!env.blockAutomationUserAgents) {
    return next();
  }

  const userAgent = req.get("user-agent") || "";
  if (AUTOMATION_USER_AGENT_PATTERN.test(userAgent)) {
    logSecurity("automation_user_agent_blocked", {
      ...getRequestMeta(req),
      userAgent
    });
    return next(new ApiError(403, "Automated traffic is not allowed"));
  }

  return next();
};

module.exports = botProtection;
