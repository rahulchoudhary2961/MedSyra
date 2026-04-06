const ApiError = require("../utils/api-error");
const cache = require("../utils/cache");
const crmModel = require("../models/crm.model");
const patientsModel = require("../models/patients.model");
const authModel = require("../models/auth.model");
const appointmentsModel = require("../models/appointments.model");
const medicalRecordsModel = require("../models/medical-records.model");

const invalidateCrmRelatedCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(`patients:profile:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);
};

const normalizeDateTime = (value, fieldName) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${fieldName} must be a valid datetime`);
  }

  return date.toISOString();
};

const buildTaskTitle = (taskType, patientName) => {
  if (taskType === "recall") {
    return `Recall ${patientName}`;
  }

  if (taskType === "retention") {
    return `Retention check for ${patientName}`;
  }

  return `Follow up with ${patientName}`;
};

const validateReferences = async (organizationId, payload) => {
  const patient = await patientsModel.getPatientById(organizationId, payload.patientId);
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  if (payload.assignedUserId) {
    const assignedUser = await authModel.findUserByIdAndOrganization(organizationId, payload.assignedUserId);
    if (!assignedUser) {
      throw new ApiError(404, "Assigned staff member not found");
    }
  }

  if (payload.sourceAppointmentId) {
    const appointment = await appointmentsModel.getAppointmentById(organizationId, payload.sourceAppointmentId);
    if (!appointment) {
      throw new ApiError(404, "Appointment not found");
    }
  }

  if (payload.sourceRecordId) {
    const record = await medicalRecordsModel.getMedicalRecordById(organizationId, payload.sourceRecordId);
    if (!record) {
      throw new ApiError(404, "Medical record not found");
    }
  }

  return patient;
};

const syncTasks = async (organizationId) => {
  await crmModel.syncAutoTasks(organizationId);
};

const listTasks = async (organizationId, query) => {
  await syncTasks(organizationId);
  return crmModel.listTasks(organizationId, query);
};

const createTask = async (organizationId, payload, actor = null) => {
  const patient = await validateReferences(organizationId, payload);
  const normalizedPayload = {
    ...payload,
    title: payload.title?.trim() || buildTaskTitle(payload.taskType, patient.full_name),
    nextActionAt: normalizeDateTime(payload.nextActionAt, "nextActionAt"),
    completedAt:
      payload.status && ["scheduled", "closed", "dismissed"].includes(payload.status)
        ? new Date().toISOString()
        : null,
    createdByUserId: actor?.sub || null
  };

  const created = await crmModel.createTask(organizationId, normalizedPayload);
  await invalidateCrmRelatedCaches(organizationId);
  return created;
};

const updateTask = async (organizationId, id, payload) => {
  const current = await crmModel.getTaskById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "CRM task not found");
  }

  if (payload.assignedUserId) {
    const assignedUser = await authModel.findUserByIdAndOrganization(organizationId, payload.assignedUserId);
    if (!assignedUser) {
      throw new ApiError(404, "Assigned staff member not found");
    }
  }

  const normalizedPayload = {
    ...payload,
    nextActionAt: normalizeDateTime(payload.nextActionAt, "nextActionAt"),
    lastContactedAt:
      payload.lastContactedAt !== undefined
        ? normalizeDateTime(payload.lastContactedAt, "lastContactedAt")
        : ["contacted", "not_reachable"].includes(payload.status || "")
          ? new Date().toISOString()
          : undefined,
    completedAt:
      payload.status && ["scheduled", "closed", "dismissed"].includes(payload.status)
        ? new Date().toISOString()
        : payload.status && ["open", "contacted", "not_reachable"].includes(payload.status)
          ? null
          : undefined
  };

  const updated = await crmModel.updateTask(organizationId, id, normalizedPayload);
  if (!updated) {
    throw new ApiError(404, "CRM task not found");
  }

  await invalidateCrmRelatedCaches(organizationId);
  return updated;
};

module.exports = {
  syncTasks,
  listTasks,
  createTask,
  updateTask
};
