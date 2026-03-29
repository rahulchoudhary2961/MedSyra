const dashboardRepository = require("../models/dashboard.model");
const cache = require("../utils/cache");

const summaryCacheKey = (organizationId) => `dashboard:summary:${organizationId}`;
const reportsCacheKey = (organizationId) => `dashboard:reports:${organizationId}`;

const getSummary = async (organizationId) => {
  const key = summaryCacheKey(organizationId);
  const cached = await cache.get(key);
  if (cached) {
    return cached;
  }

  const result = await dashboardRepository.getSummary(organizationId);
  await cache.set(key, result, 30);
  return result;
};

const getReports = async (organizationId, query = {}) => {
  const key = `${reportsCacheKey(organizationId)}:${query.period || "90d"}`;
  const cached = await cache.get(key);
  if (cached) {
    return cached;
  }

  const result = await dashboardRepository.getReports(organizationId, query);
  await cache.set(key, result, 60);
  return result;
};

module.exports = { getSummary, getReports };
