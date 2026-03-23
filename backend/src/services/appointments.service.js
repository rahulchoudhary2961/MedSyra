const ApiError = require("../utils/api-error");
const appointmentsRepository = require("../models/appointments.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const cache = require("../utils/cache");

const ALLOWED_TRANSITIONS = {
  pending: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["completed"]),
  completed: new Set([]),
  cancelled: new Set([])
};

const invalidateDashboardCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(`appointments:list:${organizationId}`),
    cache.invalidateByPrefix(`appointments:item:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);
};

const listAppointments = async (organizationId, query) => {
  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    throw new ApiError(400, "startDate must be before or equal to endDate");
  }

  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 10;
  const q = query.q || "";
  const status = query.status || "";
  const doctorId = query.doctorId || "";
  const date = query.date || "";
  const startDate = query.startDate || "";
  const endDate = query.endDate || "";
  const order = query.order || "desc";

  const cacheKey =
    `appointments:list:${organizationId}:` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}:` +
    `doctor=${doctorId}:date=${date}:start=${startDate}:end=${endDate}:order=${order}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await appointmentsRepository.listAppointments(organizationId, query);
  await cache.set(cacheKey, result, 30);
  return result;
};

const createAppointment = async (organizationId, payload) => {
  const required = ["patientId", "doctorId", "appointmentDate", "appointmentTime", "appointmentType"];
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

  const conflict = await appointmentsRepository.findDoctorSlotConflict(organizationId, {
    doctorId: payload.doctorId,
    appointmentDate: payload.appointmentDate,
    appointmentTime: payload.appointmentTime
  });

  if (conflict) {
    throw new ApiError(409, "Doctor is already booked for this time slot");
  }

  const created = await appointmentsRepository.createAppointment(organizationId, payload);
  await invalidateDashboardCaches(organizationId);
  return created;
};

const getAppointmentById = async (organizationId, id) => {
  const cacheKey = `appointments:item:${organizationId}:${id}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const appointment = await appointmentsRepository.getAppointmentById(organizationId, id);
  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  await cache.set(cacheKey, appointment, 30);
  return appointment;
};

const validateStatusTransition = (currentStatus, nextStatus) => {
  if (currentStatus === nextStatus) {
    return true;
  }

  const transitions = ALLOWED_TRANSITIONS[currentStatus] || new Set();
  return transitions.has(nextStatus);
};

const updateAppointment = async (organizationId, id, payload) => {
  const existing = await appointmentsRepository.getAppointmentById(organizationId, id);
  if (!existing) {
    throw new ApiError(404, "Appointment not found");
  }

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

  const nextStatus = payload.status || existing.status;
  if (!validateStatusTransition(existing.status, nextStatus)) {
    throw new ApiError(400, `Invalid status transition from ${existing.status} to ${nextStatus}`);
  }

  const doctorId = payload.doctorId || existing.doctor_id;
  const appointmentDate = payload.appointmentDate || existing.appointment_date;
  const appointmentTime = payload.appointmentTime || existing.appointment_time;

  if (
    doctorId !== existing.doctor_id ||
    appointmentDate !== existing.appointment_date ||
    appointmentTime !== existing.appointment_time
  ) {
    const conflict = await appointmentsRepository.findDoctorSlotConflict(organizationId, {
      doctorId,
      appointmentDate,
      appointmentTime,
      excludeId: id
    });

    if (conflict) {
      throw new ApiError(409, "Doctor is already booked for this time slot");
    }
  }

  const updated = await appointmentsRepository.updateAppointment(organizationId, id, payload);
  if (!updated) {
    throw new ApiError(404, "Appointment not found");
  }

  if (updated.status === "completed") {
    await patientsModel.updateLastVisitFromAppointment(organizationId, updated.patient_id, updated.appointment_date);
  }

  await invalidateDashboardCaches(organizationId);
  return updated;
};

const updateAppointmentStatus = async (organizationId, id, status) => {
  if (!status) {
    throw new ApiError(400, "status is required");
  }

  const existing = await appointmentsRepository.getAppointmentById(organizationId, id);
  if (!existing) {
    throw new ApiError(404, "Appointment not found");
  }

  if (!validateStatusTransition(existing.status, status)) {
    throw new ApiError(400, `Invalid status transition from ${existing.status} to ${status}`);
  }

  const updated = await appointmentsRepository.updateAppointmentStatus(organizationId, id, status);
  if (!updated) {
    throw new ApiError(404, "Appointment not found");
  }

  if (status === "completed") {
    await patientsModel.updateLastVisitFromAppointment(organizationId, updated.patient_id, updated.appointment_date);
  }

  await invalidateDashboardCaches(organizationId);
  return updated;
};

const cancelAppointment = async (organizationId, id) => {
  const existing = await appointmentsRepository.getAppointmentById(organizationId, id);
  if (!existing) {
    throw new ApiError(404, "Appointment not found");
  }

  if (!validateStatusTransition(existing.status, "cancelled")) {
    throw new ApiError(400, `Invalid status transition from ${existing.status} to cancelled`);
  }

  const cancelled = await appointmentsRepository.cancelAppointment(organizationId, id);
  if (!cancelled) {
    throw new ApiError(404, "Appointment not found");
  }

  await invalidateDashboardCaches(organizationId);
  return cancelled;
};

module.exports = {
  listAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment
};
