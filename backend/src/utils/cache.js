const env = require("../config/env");
const logger = require("./logger");

const memoryCache = new Map();
const redisUrl = env.redisUrl;
const defaultTtlSeconds = env.cacheDefaultTtlSeconds;

let redisClient = null;
let redisEnabled = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tryInitRedis = async () => {
  if (!redisUrl) {
    return;
  }

  try {
    const redisModule = require("redis");
    redisClient = redisModule.createClient({ url: redisUrl });

    redisClient.on("error", (error) => {
      redisEnabled = false;
      logger.logWarn("redis_client_error", {
        error: error?.message || String(error || "unknown")
      });
    });

    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await redisClient.connect();
        redisEnabled = true;
        logger.logInfo("redis_connected", { attempts: attempt });
        break;
      } catch (connectError) {
        redisEnabled = false;
        if (attempt === maxAttempts) {
          throw connectError;
        }
        const delayMs = 500 * attempt;
        logger.logWarn("redis_connect_retry", {
          attempt,
          delayMs,
          error: connectError?.message || String(connectError || "unknown")
        });
        await wait(delayMs);
      }
    }
  } catch (error) {
    redisEnabled = false;
    logger.logWarn("redis_unavailable_fallback_to_memory", {
      error: error?.message || String(error || "unknown")
    });
  }
};

void tryInitRedis();

const getFromMemory = (key) => {
  const entry = memoryCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
};

const setInMemory = (key, value, ttlSeconds) => {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
};

const get = async (key) => {
  if (redisEnabled && redisClient) {
    const raw = await redisClient.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  }

  return getFromMemory(key);
};

const set = async (key, value, ttlSeconds = defaultTtlSeconds) => {
  if (redisEnabled && redisClient) {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    return;
  }

  setInMemory(key, value, ttlSeconds);
};

const invalidateByPrefix = async (prefix) => {
  if (redisEnabled && redisClient) {
    const keys = [];
    for await (const key of redisClient.scanIterator({ MATCH: `${prefix}*` })) {
      if (typeof key === "string" && key.length > 0) {
        keys.push(key);
      }
    }

    const uniqueKeys = [...new Set(keys)];

    if (uniqueKeys.length > 0) {
      await redisClient.sendCommand(["DEL", ...uniqueKeys]);
    }
    return;
  }

  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
};

module.exports = {
  get,
  set,
  invalidateByPrefix
};
