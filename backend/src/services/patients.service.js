const ApiError = require("../utils/api-error");
const parsePagination = require("../utils/pagination");
const patientsRepository = require("../models/patients.model");
const cache = require("../utils/cache");

const invalidatePatientAndDashboardCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(`patients:list:${organizationId}`),
    cache.invalidateByPrefix(`patients:item:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);
};

const normalizePatientPayload = (payload) => {
  const normalizeDigits = (value) => {
    if (typeof value !== "string") {
      return value;
    }

    return value.replace(/\D/g, "");
  };

  return {
    ...payload,
    phone: typeof payload.phone === "string" ? normalizeDigits(payload.phone.trim()) : payload.phone,
    emergencyContact:
      typeof payload.emergencyContact === "string"
        ? normalizeDigits(payload.emergencyContact.trim())
        : payload.emergencyContact,
    email: payload.email ? payload.email.trim().toLowerCase() : null
  };
};

const listPatients = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const q = query.q || "";
  const status = query.status || "";
  const cacheKey =
    `patients:list:${organizationId}:` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await patientsRepository.listPatients({
    organizationId,
    search: q,
    status,
    limit,
    offset
  });

  const payload = {
    items: result.items,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit) || 1
    }
  };

  await cache.set(cacheKey, payload, 60);
  return payload;
};

const createPatient = async (organizationId, payload) => {
  if (!payload.fullName || !payload.phone || !payload.gender) {
    throw new ApiError(400, "fullName, phone and gender are required");
  }

  const normalizedPayload = normalizePatientPayload(payload);

  const duplicate = await patientsRepository.findDuplicatePatient(organizationId, {
    phone: normalizedPayload.phone,
    email: normalizedPayload.email
  });

  if (duplicate) {
    throw new ApiError(409, "Patient already exists. Use the existing record.", {
      existingPatientId: duplicate.id
    });
  }

  const created = await patientsRepository.createPatient(organizationId, normalizedPayload);
  await invalidatePatientAndDashboardCaches(organizationId);
  return created;
};

const getPatientById = async (organizationId, id) => {
  const cacheKey = `patients:item:${organizationId}:${id}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const patient = await patientsRepository.getPatientById(organizationId, id);
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }
  await cache.set(cacheKey, patient, 60);
  return patient;
};

const updatePatient = async (organizationId, id, payload) => {
  const normalizedPayload = normalizePatientPayload(payload);

  if (normalizedPayload.phone || normalizedPayload.email) {
    const existing = await patientsRepository.getPatientById(organizationId, id);
    if (!existing) {
      throw new ApiError(404, "Patient not found");
    }

    const duplicate = await patientsRepository.findDuplicatePatient(organizationId, {
      phone: normalizedPayload.phone || existing.phone,
      email: normalizedPayload.email || existing.email || null,
      excludeId: id
    });

    if (duplicate) {
      throw new ApiError(409, "Another patient already uses this contact information.", {
        existingPatientId: duplicate.id
      });
    }
  }

  const patient = await patientsRepository.updatePatient(organizationId, id, normalizedPayload);
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  await invalidatePatientAndDashboardCaches(organizationId);
  return patient;
};

const deletePatient = async (organizationId, id) => {
  const deleted = await patientsRepository.softDeletePatient(organizationId, id);
  if (!deleted) {
    throw new ApiError(404, "Patient not found");
  }

  await invalidatePatientAndDashboardCaches(organizationId);
};

module.exports = {
  listPatients,
  createPatient,
  getPatientById,
  updatePatient,
  deletePatient
};
