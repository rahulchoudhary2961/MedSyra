const env = require("../config/env");
const { getRuntimeDiagnosticsSnapshot } = require("../services/runtime-diagnostics.service");
const { getRequestMeta, logWarn } = require("../utils/logger");

const requestPerformanceMonitor = (req, res, next) => {
  if (!env.runtimeDiagnosticsEnabled || env.slowRequestThresholdMs <= 0) {
    return next();
  }

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (durationMs < env.slowRequestThresholdMs) {
      return;
    }

    const snapshot = getRuntimeDiagnosticsSnapshot();

    setImmediate(() => {
      logWarn("slow_request_detected", {
        ...getRequestMeta(req),
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        responseLength: res.getHeader("content-length") || null,
        memory: snapshot.memory,
        eventLoop: snapshot.eventLoop
      });
    });
  });

  next();
};

module.exports = requestPerformanceMonitor;
