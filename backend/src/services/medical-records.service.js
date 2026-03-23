const ApiError = require("../utils/api-error");
const medicalRecordsRepository = require("../models/medical-records.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const cache = require("../utils/cache");

const listCachePrefix = (organizationId) => `medical-records:list:${organizationId}:`;
const invalidateMedicalRecordCaches = async (organizationId) => {
  await cache.invalidateByPrefix(listCachePrefix(organizationId));
};

const listMedicalRecords = async (organizationId, query) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 10;
  const q = query.q || "";
  const status = query.status || "";
  const cacheKey =
    `${listCachePrefix(organizationId)}` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await medicalRecordsRepository.listMedicalRecords(organizationId, query);
  await cache.set(cacheKey, result, 60);
  return result;
};

const createMedicalRecord = async (organizationId, payload) => {
  const required = ["patientId", "doctorId", "recordType", "recordDate"];
  const missing = required.filter((field) => !payload[field]);

  if (missing.length > 0) {
    throw new ApiError(400, `Missing required fields: ${missing.join(", ")}`);
  }

  const [patient, doctor] = await Promise.all([
    patientsModel.getPatientById(organizationId, payload.patientId),
    doctorsModel.getDoctorById(organizationId, payload.doctorId)
  ]);

  if (!patient) {
    throw new ApiError(404, "Patient not found for this organization");
  }

  if (!doctor) {
    throw new ApiError(404, "Doctor not found for this organization");
  }

  const created = await medicalRecordsRepository.createMedicalRecord(organizationId, payload);
  await invalidateMedicalRecordCaches(organizationId);
  return created;
};

const getMedicalRecordById = async (organizationId, id) => {
  const record = await medicalRecordsRepository.getMedicalRecordById(organizationId, id);
  if (!record) {
    throw new ApiError(404, "Medical record not found");
  }

  return record;
};

const updateMedicalRecord = async (organizationId, id, payload) => {
  if (payload.patientId || payload.doctorId) {
    const [patient, doctor] = await Promise.all([
      payload.patientId ? patientsModel.getPatientById(organizationId, payload.patientId) : Promise.resolve(true),
      payload.doctorId ? doctorsModel.getDoctorById(organizationId, payload.doctorId) : Promise.resolve(true)
    ]);

    if (!patient) {
      throw new ApiError(404, "Patient not found for this organization");
    }

    if (!doctor) {
      throw new ApiError(404, "Doctor not found for this organization");
    }
  }

  const updated = await medicalRecordsRepository.updateMedicalRecord(organizationId, id, payload);
  if (!updated) {
    throw new ApiError(404, "Medical record not found");
  }

  await invalidateMedicalRecordCaches(organizationId);
  return updated;
};

const deleteMedicalRecord = async (organizationId, id) => {
  const deleted = await medicalRecordsRepository.deleteMedicalRecord(organizationId, id);
  if (!deleted) {
    throw new ApiError(404, "Medical record not found");
  }

  await invalidateMedicalRecordCaches(organizationId);
};

module.exports = {
  listMedicalRecords,
  createMedicalRecord,
  getMedicalRecordById,
  updateMedicalRecord,
  deleteMedicalRecord
};
