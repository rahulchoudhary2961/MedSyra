const ApiError = require("../utils/api-error");
const medicalRecordsRepository = require("../models/medical-records.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const cache = require("../utils/cache");
const {
  saveMedicalRecordAttachment,
  loadMedicalRecordAttachment
} = require("../utils/file-storage");
const notificationsService = require("./notifications.service");
const { logAuditEventSafe } = require("./audit.service");

const listCachePrefix = (organizationId) => `medical-records:list:${organizationId}:`;
const resolveBranchScopeId = (branchContext = null, fallback = null) =>
  branchContext?.readBranchId || branchContext?.writeBranchId || fallback || null;
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

const parseBaseDateValue = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = normalized.includes("T")
      ? new Date(normalized)
      : new Date(`${normalized}T00:00:00Z`);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const deriveFollowUpDate = (payload, baseDateValue) => {
  if (payload.followUpDate) {
    return payload.followUpDate;
  }

  if (!payload.followUpInDays) {
    return undefined;
  }

  const baseDate = parseBaseDateValue(baseDateValue);
  if (!baseDate) {
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

const shouldDeferFollowUpReminder = (preferences) => {
  if (preferences?.smart_timing_enabled !== true) {
    return false;
  }

  const sendHour = Number(preferences?.follow_up_send_hour || 9);
  const currentHour = new Date().getHours();
  return currentHour < sendHour;
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
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}:patientId=${effectiveQuery.patientId || ""}:doctorId=${effectiveQuery.doctorId || ""}:appointmentId=${effectiveQuery.appointmentId || ""}:branchId=${effectiveQuery.branchId || ""}`;

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

const createMedicalRecord = async (organizationId, payload, actor = null, requestMeta = null, branchContext = null) => {
  const required = ["patientId", "doctorId", "recordType", "recordDate"];
  const missing = required.filter((field) => !payload[field]);

  if (missing.length > 0) {
    throw new ApiError(400, `Missing required fields: ${missing.join(", ")}`);
  }

  const allowedDoctorId = await ensureMedicalRecordAccess(organizationId, actor, payload.doctorId);
  const normalizedPayload = {
    ...payload,
    branchId: payload.branchId || resolveBranchScopeId(branchContext),
    doctorId: allowedDoctorId || payload.doctorId,
    followUpDate: deriveFollowUpDate(payload, payload.recordDate)
  };
  if (!normalizedPayload.branchId) {
    throw new ApiError(400, "A branch must be selected before creating a medical record");
  }
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

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "medical_records",
    action: "medical_record_created",
    summary: `Medical record created for ${created.patient_name}`,
    entityType: "medical_record",
    entityId: created.id,
    entityLabel: `${created.record_type} - ${created.patient_name}`,
    metadata: {
      recordType: created.record_type,
      status: created.status,
      patientId: created.patient_id,
      doctorId: created.doctor_id || null
    },
    afterState: created
  });

  return created;
};

const getMedicalRecordById = async (organizationId, id, actor = null, branchContext = null) => {
  const record = await medicalRecordsRepository.getMedicalRecordById(
    organizationId,
    id,
    resolveBranchScopeId(branchContext)
  );
  if (!record) {
    throw new ApiError(404, "Medical record not found");
  }

  const allowedDoctorId = await ensureMedicalRecordAccess(organizationId, actor, record.doctor_id);
  if (actor?.role === "doctor" && record.doctor_id !== allowedDoctorId) {
    throw new ApiError(403, "You can only access your own medical records");
  }

  return record;
};

const updateMedicalRecord = async (organizationId, id, payload, actor = null, requestMeta = null, branchContext = null) => {
  const current = await medicalRecordsRepository.getMedicalRecordById(
    organizationId,
    id,
    resolveBranchScopeId(branchContext)
  );
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

  normalizedPayload.branchId = normalizedPayload.branchId || current.branch_id || resolveBranchScopeId(branchContext);

  const updated = await medicalRecordsRepository.updateMedicalRecord(organizationId, id, normalizedPayload);

  await invalidateMedicalRecordCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "medical_records",
    action: "medical_record_updated",
    summary: `Medical record updated for ${updated.patient_name}`,
    entityType: "medical_record",
    entityId: updated.id,
    entityLabel: `${updated.record_type} - ${updated.patient_name}`,
    metadata: {
      recordType: updated.record_type,
      status: updated.status
    },
    beforeState: current,
    afterState: updated
  });

  return updated;
};

const deleteMedicalRecord = async (organizationId, id, actor = null, requestMeta = null, branchContext = null) => {
  const scopeBranchId = resolveBranchScopeId(branchContext);
  const current = await medicalRecordsRepository.getMedicalRecordById(organizationId, id, scopeBranchId);
  if (!current) {
    throw new ApiError(404, "Medical record not found");
  }

  const deleted = await medicalRecordsRepository.deleteMedicalRecord(organizationId, id, scopeBranchId);
  if (!deleted) {
    throw new ApiError(404, "Medical record not found");
  }

  await invalidateMedicalRecordCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "medical_records",
    action: "medical_record_deleted",
    summary: `Medical record deleted for ${current.patient_name}`,
    entityType: "medical_record",
    entityId: current.id,
    entityLabel: `${current.record_type} - ${current.patient_name}`,
    severity: "warning",
    isDestructive: true,
    metadata: {
      recordType: current.record_type,
      patientId: current.patient_id
    },
    beforeState: current,
    afterState: null
  });
};

const uploadMedicalRecordAttachment = async (_organizationId, payload) => {
  return saveMedicalRecordAttachment(payload);
};

const getMedicalRecordAttachmentDownload = async (organizationId, id, actor = null, branchContext = null) => {
  const record = await getMedicalRecordById(organizationId, id, actor, branchContext);

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

  const existing = await medicalRecordsRepository.getMedicalRecordByAppointmentId(
    organizationId,
    payload.appointmentId,
    payload.branchId || null
  );
  if (existing) {
    return existing;
  }

  const created = await medicalRecordsRepository.createMedicalRecord(organizationId, payload);
  await invalidateMedicalRecordCaches(organizationId);
  return created;
};

const upsertAppointmentConsultationRecord = async (organizationId, payload) => {
  const existing = await medicalRecordsRepository.getMedicalRecordByAppointmentId(
    organizationId,
    payload.appointmentId,
    payload.branchId || null
  );

  if (existing) {
    const updated = await medicalRecordsRepository.updateMedicalRecord(organizationId, existing.id, {
      branchId: payload.branchId || existing.branch_id || null,
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

  const normalizedPayload = {
    ...payload,
    branchId: payload.branchId || null,
    followUpDate: deriveFollowUpDate(payload, payload.recordDate),
  };
  normalizedPayload.followUpReminderStatus = deriveFollowUpReminderStatus(
    payload,
    normalizedPayload.followUpDate,
    payload.followUpReminderStatus
  );

  const created = await medicalRecordsRepository.createMedicalRecord(organizationId, normalizedPayload);
  await invalidateMedicalRecordCaches(organizationId);
  return created;
};

const sendMedicalRecordFollowUpReminder = async (organizationId, id, actor = null, branchContext = null) => {
  const scopeBranchId = resolveBranchScopeId(branchContext);
  const record = await getMedicalRecordById(organizationId, id, actor, branchContext);
  const reminderContext = await medicalRecordsRepository.getMedicalRecordReminderContext(
    organizationId,
    id,
    scopeBranchId
  );
  if (!reminderContext) {
    throw new ApiError(404, "Medical record reminder context not found");
  }

  if (!record.follow_up_date) {
    throw new ApiError(400, "No follow-up date saved for this medical record");
  }

  const preferencesResponse = await notificationsService.getNotificationPreferences(organizationId);
  const deliveries = await notificationsService.sendReminderDeliveries({
    organizationId,
    branchId: record.branch_id || scopeBranchId || null,
    actorUserId: actor?.sub || null,
    notificationType: "follow_up_reminder",
    referenceId: record.id,
    phone: reminderContext.patient_phone,
    templateContext: {
      patientName: reminderContext.patient_name,
      clinicName: reminderContext.clinic_name,
      doctorName: record.doctor_name || "Doctor",
      followUpDate: record.follow_up_date,
      diagnosis: record.diagnosis || ""
    },
    metadata: {
      medicalRecordId: record.id,
      patientName: reminderContext.patient_name,
      doctorName: record.doctor_name || "Doctor",
      followUpDate: record.follow_up_date,
      diagnosis: record.diagnosis || ""
    },
    preferences: preferencesResponse.preferences
  });

  if (deliveries.length === 0) {
    throw new ApiError(400, "No follow-up reminder channels are enabled in notification settings");
  }

  const hasSuccessfulDelivery = deliveries.some((item) => item.status === "sent");
  if (!hasSuccessfulDelivery) {
    throw new ApiError(502, "Failed to send follow-up reminder using the configured channels");
  }

  const updated = await medicalRecordsRepository.updateMedicalRecord(organizationId, id, {
    branchId: record.branch_id || scopeBranchId || null,
    followUpReminderStatus: "sent",
    followUpReminderSentAt: new Date().toISOString(),
    followUpReminderLastAttemptAt: new Date().toISOString(),
    followUpReminderError: null
  });

  await invalidateMedicalRecordCaches(organizationId);

  return {
    record: updated,
    deliveries
  };
};

const processDueFollowUpReminders = async (organizationId = null) => {
  const records = await medicalRecordsRepository.listDueFollowUpReminders(organizationId);
  const results = [];

  for (const record of records) {
    try {
      const targetOrganizationId = record.organization_id || organizationId;
      const preferencesResponse = await notificationsService.getNotificationPreferences(targetOrganizationId);
      if (shouldDeferFollowUpReminder(preferencesResponse.preferences)) {
        results.push({ id: record.id, status: "deferred" });
        continue;
      }

      const deliveries = await notificationsService.sendReminderDeliveries({
        organizationId: targetOrganizationId,
        branchId: record.branch_id || null,
        notificationType: "follow_up_reminder",
        referenceId: record.id,
        phone: record.patient_phone,
        templateContext: {
          patientName: record.patient_name,
          clinicName: record.clinic_name,
          doctorName: record.doctor_name || "Doctor",
          followUpDate: record.follow_up_date,
          diagnosis: record.diagnosis || ""
        },
        metadata: {
          medicalRecordId: record.id,
          patientName: record.patient_name,
          doctorName: record.doctor_name || "Doctor",
          followUpDate: record.follow_up_date,
          diagnosis: record.diagnosis || ""
        },
        preferences: preferencesResponse.preferences
      });

      if (deliveries.length === 0) {
        await medicalRecordsRepository.updateMedicalRecord(targetOrganizationId, record.id, {
          followUpReminderStatus: "disabled",
          followUpReminderLastAttemptAt: new Date().toISOString(),
          followUpReminderError: "No follow-up reminder channels are enabled"
        });
        await invalidateMedicalRecordCaches(targetOrganizationId);
        results.push({ id: record.id, status: "disabled" });
        continue;
      }

      const hasSuccessfulDelivery = deliveries.some((item) => item.status === "sent");
      if (!hasSuccessfulDelivery) {
        throw new Error("Failed to send follow-up reminder using the configured channels");
      }

      await medicalRecordsRepository.updateMedicalRecord(targetOrganizationId, record.id, {
        followUpReminderStatus: "sent",
        followUpReminderSentAt: new Date().toISOString(),
        followUpReminderLastAttemptAt: new Date().toISOString(),
        followUpReminderError: null
      });

      await invalidateMedicalRecordCaches(targetOrganizationId);

      results.push({ id: record.id, status: "sent", deliveries });
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
