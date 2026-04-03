const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const env = require("./config/env");
const routes = require("./routes");
const notFoundHandler = require("./middlewares/not-found");
const errorHandler = require("./middlewares/error-handler");
const enforceJsonContentType = require("./middlewares/enforce-json-content-type");
const enforceHttps = require("./middlewares/enforce-https");
const requestSecurityMonitor = require("./middlewares/request-security-monitor");
const botProtection = require("./middlewares/bot-protection");
const { globalApiLimiter } = require("./middlewares/abuse-protection");
const { getHealthStatus } = require("./services/health.service");

const app = express();

const allowedOrigins = env.corsOrigin === "*"
  ? true
  : env.corsOrigin
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(enforceHttps);
app.use(botProtection);
app.use(requestSecurityMonitor);
app.use(globalApiLimiter);
app.use(enforceJsonContentType);
app.use(express.json({ limit: "10mb" }));

app.get("/health", async (_req, res) => {
  const health = await getHealthStatus();
  res.status(health.ok ? 200 : 503).json({
    success: health.ok,
    data: health
  });
});

app.use("/api/v1", routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
