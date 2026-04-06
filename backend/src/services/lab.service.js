const ApiError = require("../utils/api-error");
const cache = require("../utils/cache");
const labModel = require("../models/lab.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const appointmentsModel = require("../models/appointments.model");
const {
  saveLabReportAttachment,
  loadLabReportAttachment
} = require("../utils/file-storage");

const patientProfileCachePrefix = (organizationId) => `patients:profile:${organizationId}`;
const dashboardSummaryCachePrefix = (organizationId) => `dashboard:summary:${organizationId}`;
const dashboardReportsCachePrefix = (organizationId) => `dashboard:reports:${organizationId}`;

const invalidateLabRelatedCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(patientProfileCachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardSummaryCachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardReportsCachePrefix(organizationId))
  ]);
};

const parseDateKey = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
};

const toDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }

  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0")
  ].join("-");
};

const addDaysToDateKey = (value, days) => {
  const baseDate = parseDateKey(value);
  if (!baseDate) {
    return null;
  }

  baseDate.setUTCDate(baseDate.getUTCDate() + days);
  return toDateKey(baseDate);
};

const nowIso = () => new Date().toISOString();

const resolveActorDoctor = async (organizationId, actor) => {
  if (actor?.role !== "doctor") {
    return null;
  }

  const doctor =
    (await doctorsModel.getDoctorByUserId(organizationId, actor.sub)) ||
    (await doctorsModel.getDoctorByEmail(organizationId, actor.email));

  if (!doctor) {
    throw new ApiError(403, "Doctor account is not linked to a doctor profile");
  }

  return doctor;
};

const ensureLabDoctorAccess = async (organizationId, actor, doctorId = null) => {
  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  if (!actorDoctor) {
    return doctorId || null;
  }

  if (doctorId && doctorId !== actorDoctor.id) {
    throw new ApiError(403, "You can only access lab orders assigned to your own doctor profile");
  }

  return actorDoctor.id;
};

const resolveOrderItems = async (organizationId, items) => {
  const normalizedItems = [];
  let maxTurnaroundHours = 0;

  for (const item of items || []) {
    if (item.labTestId) {
      const labTest = await labModel.getLabTestById(organizationId, item.labTestId);
      if (!labTest) {
        throw new ApiError(404, "Lab test not found");
      }

      maxTurnaroundHours = Math.max(maxTurnaroundHours, Number(labTest.turnaround_hours || 0));
      normalizedItems.push({
        labTestId: labTest.id,
        testName: item.testName || labTest.name,
        price: item.price !== undefined ? item.price : Number(labTest.price || 0),
        resultSummary: item.resultSummary || null
      });
      continue;
    }

    if (item.price === undefined) {
      throw new ApiError(400, "Custom lab tests require a price");
    }

    normalizedItems.push({
      labTestId: null,
      testName: item.testName,
      price: item.price,
      resultSummary: item.resultSummary || null
    });
  }

  return {
    items: normalizedItems,
    maxTurnaroundHours
  };
};

const deriveDueDate = (orderedDate, payloadDueDate, maxTurnaroundHours) => {
  if (payloadDueDate) {
    return payloadDueDate;
  }

  if (!orderedDate || !maxTurnaroundHours) {
    return null;
  }

  const leadDays = Math.max(1, Math.ceil(maxTurnaroundHours / 24));
  return addDaysToDateKey(orderedDate, leadDays);
};

const buildStatusTimelineFields = (status, currentOrder = null) => {
  const fields = {};
  const timestamp = nowIso();

  if (!status) {
    return fields;
  }

  if (["sample_collected", "processing", "report_ready", "completed"].includes(status) && !currentOrder?.sample_collected_at) {
    fields.sampleCollectedAt = timestamp;
  }

  if (["processing", "report_ready", "completed"].includes(status) && !currentOrder?.processing_started_at) {
    fields.processingStartedAt = timestamp;
  }

  if (["report_ready", "completed"].includes(status) && !currentOrder?.report_ready_at) {
    fields.reportReadyAt = timestamp;
  }

  if (status === "completed" && !currentOrder?.completed_at) {
    fields.completedAt = timestamp;
  }

  return fields;
};

const validateOrderReferences = async (organizationId, payload) => {
  const patient = await patientsModel.getPatientById(organizationId, payload.patientId);
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  let doctor = null;
  if (payload.doctorId) {
    doctor = await doctorsModel.getDoctorById(organizationId, payload.doctorId);
    if (!doctor) {
      throw new ApiError(404, "Doctor not found");
    }
  }

  let appointment = null;
  if (payload.appointmentId) {
    appointment = await appointmentsModel.getAppointmentById(organizationId, payload.appointmentId);
    if (!appointment) {
      throw new ApiError(404, "Appointment not found");
    }

    if (appointment.patient_id && appointment.patient_id !== payload.patientId) {
      throw new ApiError(400, "Lab order patient must match the selected appointment patient");
    }
  }

  return { patient, doctor, appointment };
};

const listLabTests = async (organizationId, query) => labModel.listLabTests(organizationId, query);

const createLabTest = async (organizationId, payload) => {
  const created = await labModel.createLabTest(organizationId, payload);
  await invalidateLabRelatedCaches(organizationId);
  return created;
};

const updateLabTest = async (organizationId, id, payload) => {
  const current = await labModel.getLabTestById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Lab test not found");
  }

  const updated = await labModel.updateLabTest(organizationId, id, payload);
  await invalidateLabRelatedCaches(organizationId);
  return updated;
};

const listLabOrders = async (organizationId, query, actor = null) => {
  const scopedDoctorId = await ensureLabDoctorAccess(organizationId, actor, query.doctorId || null);
  const effectiveQuery = actor?.role === "doctor" ? { ...query, doctorId: scopedDoctorId } : query;
  return labModel.listLabOrders(organizationId, effectiveQuery);
};

const getLabOrderById = async (organizationId, id, actor = null) => {
  const order = await labModel.getLabOrderById(organizationId, id);
  if (!order) {
    throw new ApiError(404, "Lab order not found");
  }

  const scopedDoctorId = await ensureLabDoctorAccess(organizationId, actor, order.doctor_id);
  if (actor?.role === "doctor" && scopedDoctorId && order.doctor_id !== scopedDoctorId) {
    throw new ApiError(403, "You can only access your own lab orders");
  }

  return order;
};

const createLabOrder = async (organizationId, payload, actor = null) => {
  const scopedDoctorId = await ensureLabDoctorAccess(organizationId, actor, payload.doctorId || null);
  const normalizedPayload = {
    ...payload,
    doctorId: scopedDoctorId || payload.doctorId || null,
    orderedByUserId: actor?.sub || null
  };

  await validateOrderReferences(organizationId, normalizedPayload);

  const resolvedItems = await resolveOrderItems(organizationId, normalizedPayload.items || []);
  normalizedPayload.items = resolvedItems.items;
  normalizedPayload.dueDate = deriveDueDate(normalizedPayload.orderedDate, normalizedPayload.dueDate, resolvedItems.maxTurnaroundHours);
  Object.assign(normalizedPayload, buildStatusTimelineFields(normalizedPayload.status || "ordered"));

  const created = await labModel.createLabOrder(organizationId, normalizedPayload);
  await invalidateLabRelatedCaches(organizationId);
  return created;
};

const updateLabOrder = async (organizationId, id, payload, actor = null) => {
  const current = await getLabOrderById(organizationId, id, actor);
  const scopedDoctorId = await ensureLabDoctorAccess(organizationId, actor, payload.doctorId || current.doctor_id || null);

  const normalizedPayload = {
    ...payload,
    doctorId: scopedDoctorId || payload.doctorId || current.doctor_id || null,
    patientId: current.patient_id
  };

  if (normalizedPayload.appointmentId || normalizedPayload.doctorId || normalizedPayload.patientId) {
    await validateOrderReferences(organizationId, {
      patientId: normalizedPayload.patientId,
      doctorId: normalizedPayload.doctorId,
      appointmentId: normalizedPayload.appointmentId || current.appointment_id
    });
  }

  if (Array.isArray(normalizedPayload.items)) {
    const resolvedItems = await resolveOrderItems(organizationId, normalizedPayload.items);
    normalizedPayload.items = resolvedItems.items;
    normalizedPayload.dueDate = deriveDueDate(
      normalizedPayload.orderedDate || current.ordered_date,
      normalizedPayload.dueDate || current.due_date,
      resolvedItems.maxTurnaroundHours
    );
  }

  Object.assign(normalizedPayload, buildStatusTimelineFields(normalizedPayload.status, current));
  delete normalizedPayload.patientId;

  const updated = await labModel.updateLabOrder(organizationId, id, normalizedPayload);
  if (!updated) {
    throw new ApiError(404, "Lab order not found");
  }

  await invalidateLabRelatedCaches(organizationId);
  return updated;
};

const uploadLabOrderReport = async (organizationId, id, payload, actor = null) => {
  const current = await getLabOrderById(organizationId, id, actor);
  const uploaded = await saveLabReportAttachment(payload);
  const nextStatus = current.status === "completed" ? "completed" : "report_ready";

  const updated = await labModel.updateLabOrder(organizationId, id, {
    reportFileUrl: uploaded.fileUrl,
    status: nextStatus,
    ...buildStatusTimelineFields(nextStatus, current)
  });

  await invalidateLabRelatedCaches(organizationId);

  return {
    order: updated,
    attachment: uploaded
  };
};

const getLabOrderReportDownload = async (organizationId, id, actor = null) => {
  const order = await getLabOrderById(organizationId, id, actor);
  if (!order.report_file_url) {
    throw new ApiError(404, "Lab report not found");
  }

  if (/^https?:\/\//i.test(order.report_file_url)) {
    throw new ApiError(400, "External lab reports cannot be downloaded through MedSyra");
  }

  return loadLabReportAttachment(order.report_file_url);
};

module.exports = {
  listLabTests,
  createLabTest,
  updateLabTest,
  listLabOrders,
  getLabOrderById,
  createLabOrder,
  updateLabOrder,
  uploadLabOrderReport,
  getLabOrderReportDownload
};
