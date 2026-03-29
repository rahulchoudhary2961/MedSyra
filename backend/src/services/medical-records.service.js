const ApiError = require("../utils/api-error");
const medicalRecordsRepository = require("../models/medical-records.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const cache = require("../utils/cache");
const { saveMedicalRecordAttachment } = require("../utils/file-storage");

const listCachePrefix = (organizationId) => `medical-records:list:${organizationId}:`;
const invalidateMedicalRecordCaches = async (organizationId) => {
  await cache.invalidateByPrefix(listCachePrefix(organizationId));
};

const listMedicalRecords = async (organizationId, query, actor = null) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 10;
  const q = query.q || "";
  const status = query.status || "";
  const scopedDoctorId = await ensureMedicalRecordAccess(organizationId, actor, query.doctorId || null);
  const effectiveQuery =
    actor?.role === "doctor"
      ? { ...query, doctorId: scopedDoctorId }
      : query;
  const cacheKey =
    `${listCachePrefix(organizationId)}` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}:patientId=${effectiveQuery.patientId || ""}:doctorId=${effectiveQuery.doctorId || ""}:appointmentId=${effectiveQuery.appointmentId || ""}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await medicalRecordsRepository.listMedicalRecords(organizationId, effectiveQuery);
  await cache.set(cacheKey, result, 60);
  return result;
};

async function ensureMedicalRecordAccess(organizationId, actor, doctorId = null) {
  if (actor?.role !== "doctor") {
    return doctorId || null;
  }

  const doctor =
    (await doctorsModel.getDoctorByUserId(organizationId, actor.sub)) ||
    (await doctorsModel.getDoctorByEmail(organizationId, actor.email));
  if (!doctor) {
    throw new ApiError(403, "Doctor account is not linked to a doctor profile");
  }

  if (doctorId && doctorId !== doctor.id) {
    throw new ApiError(403, "You can only access your own medical records");
  }

  return doctor.id;
}

const createMedicalRecord = async (organizationId, payload, actor = null) => {
  const required = ["patientId", "doctorId", "recordType", "recordDate"];
  const missing = required.filter((field) => !payload[field]);

  if (missing.length > 0) {
    throw new ApiError(400, `Missing required fields: ${missing.join(", ")}`);
  }

  const allowedDoctorId = await ensureMedicalRecordAccess(organizationId, actor, payload.doctorId);
  const normalizedPayload = {
    ...payload,
    doctorId: allowedDoctorId || payload.doctorId
  };

  const [patient, doctor] = await Promise.all([
    patientsModel.getPatientById(organizationId, normalizedPayload.patientId),
    doctorsModel.getDoctorById(organizationId, normalizedPayload.doctorId)
  ]);

  if (!patient) {
    throw new ApiError(404, "Patient not found for this organization");
  }

  if (!doctor) {
    throw new ApiError(404, "Doctor not found for this organization");
  }

  const created = await medicalRecordsRepository.createMedicalRecord(organizationId, normalizedPayload);
  await invalidateMedicalRecordCaches(organizationId);
  return created;
};

const getMedicalRecordById = async (organizationId, id, actor = null) => {
  const record = await medicalRecordsRepository.getMedicalRecordById(organizationId, id);
  if (!record) {
    throw new ApiError(404, "Medical record not found");
  }

  const allowedDoctorId = await ensureMedicalRecordAccess(organizationId, actor, record.doctor_id);
  if (actor?.role === "doctor" && record.doctor_id !== allowedDoctorId) {
    throw new ApiError(403, "You can only access your own medical records");
  }

  return record;
};

const updateMedicalRecord = async (organizationId, id, payload, actor = null) => {
  const current = await medicalRecordsRepository.getMedicalRecordById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Medical record not found");
  }

  const allowedDoctorId = await ensureMedicalRecordAccess(
    organizationId,
    actor,
    payload.doctorId || current.doctor_id
  );

  if (actor?.role === "doctor" && current.doctor_id !== allowedDoctorId) {
    throw new ApiError(403, "You can only update your own medical records");
  }

  const normalizedPayload = actor?.role === "doctor"
    ? {
        symptoms: payload.symptoms,
        diagnosis: payload.diagnosis,
        prescription: payload.prescription,
        notes: payload.notes,
        status: payload.status
      }
    : {
        ...payload,
        doctorId: allowedDoctorId || payload.doctorId
      };

  if (normalizedPayload.patientId || normalizedPayload.doctorId) {
    const [patient, doctor] = await Promise.all([
      normalizedPayload.patientId
        ? patientsModel.getPatientById(organizationId, normalizedPayload.patientId)
        : Promise.resolve(true),
      normalizedPayload.doctorId
        ? doctorsModel.getDoctorById(organizationId, normalizedPayload.doctorId)
        : Promise.resolve(true)
    ]);

    if (!patient) {
      throw new ApiError(404, "Patient not found for this organization");
    }

    if (!doctor) {
      throw new ApiError(404, "Doctor not found for this organization");
    }
  }

  const updated = await medicalRecordsRepository.updateMedicalRecord(organizationId, id, normalizedPayload);

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

const uploadMedicalRecordAttachment = async (_organizationId, payload) => {
  return saveMedicalRecordAttachment(payload);
};

const createAppointmentRecordIfMissing = async (organizationId, payload) => {
  if (!payload.appointmentId) {
    return null;
  }

  const existing = await medicalRecordsRepository.getMedicalRecordByAppointmentId(organizationId, payload.appointmentId);
  if (existing) {
    return existing;
  }

  const created = await medicalRecordsRepository.createMedicalRecord(organizationId, payload);
  await invalidateMedicalRecordCaches(organizationId);
  return created;
};

const upsertAppointmentConsultationRecord = async (organizationId, payload) => {
  const existing = await medicalRecordsRepository.getMedicalRecordByAppointmentId(organizationId, payload.appointmentId);

  if (existing) {
    const updated = await medicalRecordsRepository.updateMedicalRecord(organizationId, existing.id, {
      doctorId: payload.doctorId || existing.doctor_id,
      recordType: payload.recordType || existing.record_type,
      recordDate: payload.recordDate || existing.record_date,
      status: payload.status || existing.status,
      symptoms: payload.symptoms,
      diagnosis: payload.diagnosis,
      prescription: payload.prescription,
      notes: payload.notes
    });
    await invalidateMedicalRecordCaches(organizationId);
    return updated;
  }

  const created = await medicalRecordsRepository.createMedicalRecord(organizationId, payload);
  await invalidateMedicalRecordCaches(organizationId);
  return created;
};

module.exports = {
  listMedicalRecords,
  createMedicalRecord,
  getMedicalRecordById,
  updateMedicalRecord,
  deleteMedicalRecord,
  uploadMedicalRecordAttachment,
  createAppointmentRecordIfMissing,
  upsertAppointmentConsultationRecord,
  ensureMedicalRecordAccess
};
