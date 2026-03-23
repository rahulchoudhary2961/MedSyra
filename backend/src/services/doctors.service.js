const ApiError = require("../utils/api-error");
const doctorsRepository = require("../models/doctors.model");
const cache = require("../utils/cache");

const doctorsListCachePrefix = (organizationId) => `doctors:list:${organizationId}:`;

const listDoctors = async (organizationId, query) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 10;
  const q = query.q || "";
  const status = query.status || "";

  const cacheKey =
    `${doctorsListCachePrefix(organizationId)}` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await doctorsRepository.listDoctors(organizationId, query);
  await cache.set(cacheKey, result, 60);
  return result;
};

const createDoctor = async (organizationId, payload) => {
  if (!payload.fullName || !payload.specialty) {
    throw new ApiError(400, "fullName and specialty are required");
  }

  const created = await doctorsRepository.createDoctor(organizationId, payload);
  await Promise.all([
    cache.invalidateByPrefix(doctorsListCachePrefix(organizationId)),
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);

  return created;
};

module.exports = {
  listDoctors,
  createDoctor
};
