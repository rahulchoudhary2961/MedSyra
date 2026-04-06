const dashboardRepository = require("../models/dashboard.model");
const cache = require("../utils/cache");

const summaryCacheKey = (organizationId, branchId = null) => `dashboard:summary:${organizationId}:branch=${branchId || "all"}`;
const reportsCacheKey = (organizationId, branchId = null) => `dashboard:reports:${organizationId}:branch=${branchId || "all"}`;

const getSummary = async (organizationId, branchId = null) => {
  const key = summaryCacheKey(organizationId, branchId);
  const cached = await cache.get(key);
  if (cached) {
    return cached;
  }

  const result = await dashboardRepository.getSummary(organizationId, branchId);
  await cache.set(key, result, 30);
  return result;
};

const getReports = async (organizationId, query = {}) => {
  const key = `${reportsCacheKey(organizationId, query.branchId || null)}:${query.period || "90d"}`;
  const cached = await cache.get(key);
  if (cached) {
    return cached;
  }

  const result = await dashboardRepository.getReports(organizationId, query);
  await cache.set(key, result, 60);
  return result;
};

module.exports = { getSummary, getReports };
