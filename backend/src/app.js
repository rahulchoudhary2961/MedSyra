const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const env = require("./config/env");
const routes = require("./routes");
const notFoundHandler = require("./middlewares/not-found");
const errorHandler = require("./middlewares/error-handler");
const enforceJsonContentType = require("./middlewares/enforce-json-content-type");
const enforceHttps = require("./middlewares/enforce-https");
const requestSecurityMonitor = require("./middlewares/request-security-monitor");
const botProtection = require("./middlewares/bot-protection");
const { globalApiLimiter } = require("./middlewares/abuse-protection");

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
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

app.use("/api/v1", routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
