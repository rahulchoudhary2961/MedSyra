const ApiError = require("../utils/api-error");
const medicalRecordsRepository = require("../models/medical-records.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const cache = require("../utils/cache");
const {
  saveMedicalRecordAttachment,
  loadMedicalRecordAttachment
} = require("../utils/file-storage");
const { sendFollowUpReminder } = require("./whatsapp-reminder.service");

const listCachePrefix = (organizationId) => `medical-records:list:${organizationId}:`;
const invalidateMedicalRecordCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(listCachePrefix(organizationId)),
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);
};

const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
};

const deriveFollowUpDate = (payload, baseDateValue) => {
  if (payload.followUpDate) {
    return payload.followUpDate;
  }

  if (!payload.followUpInDays) {
    return undefined;
  }

  const baseDate = new Date(`${baseDateValue}T00:00:00Z`);
  if (Number.isNaN(baseDate.getTime())) {
    return undefined;
  }

  baseDate.setUTCDate(baseDate.getUTCDate() + Number(payload.followUpInDays));
  return toDateKey(baseDate);
};

const deriveFollowUpReminderStatus = (payload, followUpDate, fallbackStatus = null) => {
  if (!followUpDate) {
    return null;
  }

  if (typeof payload.sendFollowUpReminder === "boolean") {
    return payload.sendFollowUpReminder ? "pending" : "disabled";
  }

  return fallbackStatus ?? "pending";
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
    doctorId: allowedDoctorId || payload.doctorId,
    followUpDate: deriveFollowUpDate(payload, payload.recordDate)
  };
  normalizedPayload.followUpReminderStatus = deriveFollowUpReminderStatus(
    payload,
    normalizedPayload.followUpDate,
    payload.followUpReminderStatus
  );

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
        followUpDate: payload.followUpDate,
        notes: payload.notes,
        status: payload.status
      }
    : {
        ...payload,
      doctorId: allowedDoctorId || payload.doctorId
      };

  if (!("followUpDate" in normalizedPayload) && "followUpInDays" in payload) {
    normalizedPayload.followUpDate = deriveFollowUpDate(payload, current.record_date);
  }

  normalizedPayload.followUpReminderStatus = deriveFollowUpReminderStatus(
    payload,
    normalizedPayload.followUpDate,
    current.follow_up_reminder_status
  );

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

const getMedicalRecordAttachmentDownload = async (organizationId, id, actor = null) => {
  const record = await getMedicalRecordById(organizationId, id, actor);

  if (!record.file_url) {
    throw new ApiError(404, "Medical record attachment not found");
  }

  if (/^https?:\/\//i.test(record.file_url)) {
    throw new ApiError(400, "External medical record attachments cannot be downloaded through MedSyra");
  }

  return loadMedicalRecordAttachment(record.file_url);
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
      followUpDate:
        payload.followUpDate !== undefined
          ? payload.followUpDate
          : deriveFollowUpDate(payload, payload.recordDate || existing.record_date) ?? existing.follow_up_date,
      followUpReminderStatus: deriveFollowUpReminderStatus(
        payload,
        payload.followUpDate !== undefined
          ? payload.followUpDate
          : deriveFollowUpDate(payload, payload.recordDate || existing.record_date) ?? existing.follow_up_date,
        existing.follow_up_reminder_status
      ),
      notes: payload.notes
    });
    await invalidateMedicalRecordCaches(organizationId);
    return updated;
  }

  const created = await medicalRecordsRepository.createMedicalRecord(organizationId, payload);
  await invalidateMedicalRecordCaches(organizationId);
  return created;
};

const sendMedicalRecordFollowUpReminder = async (organizationId, id, actor = null) => {
  const record = await getMedicalRecordById(organizationId, id, actor);
  const reminderContext = await medicalRecordsRepository.getMedicalRecordReminderContext(organizationId, id);
  if (!reminderContext) {
    throw new ApiError(404, "Medical record reminder context not found");
  }

  if (!record.follow_up_date) {
    throw new ApiError(400, "No follow-up date saved for this medical record");
  }

  const result = await sendFollowUpReminder({
    organizationId,
    actorUserId: actor?.sub || null,
    referenceId: record.id,
    patientPhone: reminderContext.patient_phone,
    patientName: reminderContext.patient_name,
    clinicName: reminderContext.clinic_name,
    doctorName: record.doctor_name || "Doctor"
  });

  const updated = await medicalRecordsRepository.updateMedicalRecord(organizationId, id, {
    followUpReminderStatus: "sent",
    followUpReminderSentAt: new Date().toISOString(),
    followUpReminderLastAttemptAt: new Date().toISOString(),
    followUpReminderError: null
  });

  await invalidateMedicalRecordCaches(organizationId);

  return {
    record: updated,
    reminder: result
  };
};

const processDueFollowUpReminders = async (organizationId = null) => {
  const records = await medicalRecordsRepository.listDueFollowUpReminders(organizationId);
  const results = [];

  for (const record of records) {
    try {
      const reminder = await sendFollowUpReminder({
        organizationId: record.organization_id || organizationId,
        referenceId: record.id,
        patientPhone: record.patient_phone,
        patientName: record.patient_name,
        clinicName: record.clinic_name,
        doctorName: record.doctor_name || "Doctor"
      });

      await medicalRecordsRepository.updateMedicalRecord(record.organization_id || organizationId, record.id, {
        followUpReminderStatus: "sent",
        followUpReminderSentAt: new Date().toISOString(),
        followUpReminderLastAttemptAt: new Date().toISOString(),
        followUpReminderError: null
      });

      if (record.organization_id || organizationId) {
        await invalidateMedicalRecordCaches(record.organization_id || organizationId);
      }

      results.push({ id: record.id, status: "sent", reminder });
    } catch (error) {
      const targetOrganizationId = record.organization_id || organizationId;
      if (targetOrganizationId) {
        await medicalRecordsRepository.updateMedicalRecord(targetOrganizationId, record.id, {
          followUpReminderStatus: "failed",
          followUpReminderLastAttemptAt: new Date().toISOString(),
          followUpReminderError: error.message
        });
        await invalidateMedicalRecordCaches(targetOrganizationId);
      }
      results.push({ id: record.id, status: "failed", error: error.message });
    }
  }

  return results;
};

module.exports = {
  listMedicalRecords,
  createMedicalRecord,
  getMedicalRecordById,
  updateMedicalRecord,
  deleteMedicalRecord,
  uploadMedicalRecordAttachment,
  getMedicalRecordAttachmentDownload,
  createAppointmentRecordIfMissing,
  upsertAppointmentConsultationRecord,
  ensureMedicalRecordAccess,
  sendMedicalRecordFollowUpReminder,
  processDueFollowUpReminders
};
