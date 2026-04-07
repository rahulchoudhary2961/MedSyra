const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const env = require("./config/env");
const routes = require("./routes");
const notFoundHandler = require("./middlewares/not-found");
const errorHandler = require("./middlewares/error-handler");
const enforceJsonContentType = require("./middlewares/enforce-json-content-type");
const enforceHttps = require("./middlewares/enforce-https");
const requestPerformanceMonitor = require("./middlewares/request-performance-monitor");
const requestSecurityMonitor = require("./middlewares/request-security-monitor");
const botProtection = require("./middlewares/bot-protection");
const { globalApiLimiter } = require("./middlewares/abuse-protection");
const { getHealthStatus } = require("./services/health.service");

const app = express();
app.disable("x-powered-by");

const captureRawBody = (req, _res, buf) => {
  if (buf?.length) {
    req.rawBody = buf.toString("utf8");
  }
};

const allowedOrigins = env.corsOrigin === "*"
  ? true
  : env.corsOrigin
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(requestPerformanceMonitor);
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(enforceHttps);
app.use(botProtection);
app.use(requestSecurityMonitor);
app.use(globalApiLimiter);
app.use(enforceJsonContentType);
app.use(
  "/api/v1/payments/webhooks/razorpay",
  express.json({ limit: env.webhookJsonBodyLimit, verify: captureRawBody })
);
app.use(express.json({ limit: env.jsonBodyLimit }));

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
