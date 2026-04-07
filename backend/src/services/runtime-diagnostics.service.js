const { monitorEventLoopDelay } = require("perf_hooks");
const env = require("../config/env");
const { logInfo, logWarn } = require("../utils/logger");

let histogram = null;
let diagnosticsInterval = null;
let started = false;

const roundNumber = (value) => Number(Number(value || 0).toFixed(2));
const toMegabytes = (value) => roundNumber(Number(value || 0) / (1024 * 1024));
const toMilliseconds = (value) => {
  const numeric = Number(value || 0);

  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1e15) {
    return 0;
  }

  return roundNumber(numeric / 1e6);
};

const getMemorySnapshot = () => {
  const usage = process.memoryUsage();

  return {
    rssMb: toMegabytes(usage.rss),
    heapUsedMb: toMegabytes(usage.heapUsed),
    heapTotalMb: toMegabytes(usage.heapTotal),
    externalMb: toMegabytes(usage.external),
    arrayBuffersMb: toMegabytes(usage.arrayBuffers)
  };
};

const getEventLoopSnapshot = () => {
  if (!histogram) {
    return null;
  }

  return {
    minMs: toMilliseconds(histogram.min),
    meanMs: toMilliseconds(histogram.mean),
    p95Ms: toMilliseconds(histogram.percentile(95)),
    maxMs: toMilliseconds(histogram.max),
    stddevMs: toMilliseconds(histogram.stddev)
  };
};

const getRuntimeDiagnosticsSnapshot = () => ({
  uptimeSeconds: Math.round(process.uptime()),
  memory: getMemorySnapshot(),
  eventLoop: getEventLoopSnapshot()
});

const startRuntimeDiagnostics = () => {
  if (started || !env.runtimeDiagnosticsEnabled) {
    return;
  }

  histogram = monitorEventLoopDelay({ resolution: env.eventLoopResolutionMs });
  histogram.enable();

  diagnosticsInterval = setInterval(() => {
    const snapshot = getRuntimeDiagnosticsSnapshot();
    const shouldWarn =
      snapshot.memory.rssMb >= env.memoryUsageWarnMb ||
      (snapshot.eventLoop && snapshot.eventLoop.maxMs >= env.eventLoopDelayWarnMs);

    if (shouldWarn) {
      setImmediate(() => {
        logWarn("runtime_performance_snapshot", {
          ...snapshot,
          thresholds: {
            memoryUsageWarnMb: env.memoryUsageWarnMb,
            eventLoopDelayWarnMs: env.eventLoopDelayWarnMs
          }
        });
      });
    }

    histogram.reset();
  }, env.diagnosticsLogIntervalMs);

  diagnosticsInterval.unref();
  started = true;

  logInfo("runtime_diagnostics_started", {
    slowRequestThresholdMs: env.slowRequestThresholdMs,
    diagnosticsLogIntervalMs: env.diagnosticsLogIntervalMs,
    eventLoopResolutionMs: env.eventLoopResolutionMs,
    eventLoopDelayWarnMs: env.eventLoopDelayWarnMs,
    memoryUsageWarnMb: env.memoryUsageWarnMb
  });
};

module.exports = {
  getRuntimeDiagnosticsSnapshot,
  startRuntimeDiagnostics
};
