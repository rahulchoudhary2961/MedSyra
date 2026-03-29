const ApiError = require("../utils/api-error");
const appointmentsRepository = require("../models/appointments.model");
const doctorsModel = require("../models/doctors.model");
const patientsModel = require("../models/patients.model");
const medicalRecordsService = require("../services/medical-records.service");
const cache = require("../utils/cache");
const { isDoctorAvailableForSlot } = require("../utils/doctor-availability");

const cachePrefix = (organizationId) => `appointments:list:${organizationId}:`;
const dashboardSummaryCachePrefix = (organizationId) => `dashboard:summary:${organizationId}`;
const dashboardReportsCachePrefix = (organizationId) => `dashboard:reports:${organizationId}`;

const invalidateAppointmentCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(cachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardSummaryCachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardReportsCachePrefix(organizationId))
  ]);
};

const validateNotInPast = (appointmentDate, appointmentTime) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (appointmentDate !== today) {
    return;
  }

  const [hours, minutes] = appointmentTime.slice(0, 5).split(":").map(Number);
  const appointmentDateTime = new Date(now);
  appointmentDateTime.setHours(hours, minutes, 0, 0);

  if (appointmentDateTime.getTime() < now.getTime()) {
    throw new ApiError(400, "Cannot book an appointment in the past");
  }
};

const buildWalkInPhone = () => {
  const digits = `${Date.now()}${Math.floor(Math.random() * 1000)}`
    .replace(/\D/g, "")
    .slice(-9);
  return `9${digits.padStart(9, "0")}`;
};

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

const resolveAppointmentPatient = async (organizationId, payload) => {
  if (payload.patientId) {
    const patient = await patientsModel.getPatientById(organizationId, payload.patientId);
    if (!patient) {
      throw new ApiError(404, "Patient not found for this organization");
    }

    return {
      patientId: patient.id,
      patientName: patient.full_name,
      mobileNumber: payload.mobileNumber || patient.phone || null,
      email: payload.email || patient.email || null
    };
  }

  if (payload.category !== "walk-in") {
    throw new ApiError(400, "patientId is required");
  }

  if (!payload.patientName) {
    throw new ApiError(400, "patientName is required for walk-in appointments");
  }

  const phone = (payload.mobileNumber || "").trim();
  const duplicate =
    phone.length > 0
      ? await patientsModel.findDuplicatePatient(organizationId, {
          phone,
          email: payload.email || null
        })
      : null;

  if (duplicate) {
    const patient = await patientsModel.getPatientById(organizationId, duplicate.id);
    return {
      patientId: patient.id,
      patientName: patient.full_name,
      mobileNumber: patient.phone || phone || null,
      email: patient.email || payload.email || null
    };
  }

  const patient = await patientsModel.createPatient(organizationId, {
    fullName: payload.patientName.trim(),
    gender: "other",
    phone: phone || buildWalkInPhone(),
    email: payload.email || null,
    status: "active"
  });

  return {
    patientId: patient.id,
    patientName: patient.full_name,
    mobileNumber: patient.phone || null,
    email: patient.email || null
  };
};

const listAppointments = async (organizationId, query, actor = null) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 100;
  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  const effectiveQuery = actorDoctor ? { ...query, doctorId: actorDoctor.id } : query;
  const cacheKey =
    `${cachePrefix(organizationId)}` +
    `page=${page}:limit=${limit}:year=${effectiveQuery.year || ""}:month=${effectiveQuery.month || ""}:day=${effectiveQuery.day || ""}:date=${effectiveQuery.date || ""}:patientId=${effectiveQuery.patientId || ""}:doctorId=${effectiveQuery.doctorId || ""}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await appointmentsRepository.listAppointments(organizationId, effectiveQuery);
  await cache.set(cacheKey, result, 60);
  return result;
};

const createAppointment = async (organizationId, payload, actor = null) => {
  if (actor?.role === "doctor") {
    throw new ApiError(403, "Doctors cannot create appointments");
  }

  const required = ["patientName", "appointmentDate", "appointmentTime", "category", "durationMinutes"];
  const missing = required.filter((field) => !payload[field]);

  if (missing.length > 0) {
    throw new ApiError(400, `Missing required fields: ${missing.join(", ")}`);
  }

  validateNotInPast(payload.appointmentDate, payload.appointmentTime);

  const patient = await resolveAppointmentPatient(organizationId, payload);
  const normalizedPayload = {
    ...payload,
    patientId: patient.patientId,
    patientName: patient.patientName,
    mobileNumber: patient.mobileNumber,
    email: patient.email
  };

  if (normalizedPayload.doctorId) {
    const doctor = await doctorsModel.getDoctorById(organizationId, normalizedPayload.doctorId);
    if (!doctor) {
      throw new ApiError(404, "Doctor not found for this organization");
    }
    if (
      !isDoctorAvailableForSlot(
        doctor,
        normalizedPayload.appointmentDate,
        normalizedPayload.appointmentTime,
        normalizedPayload.durationMinutes
      )
    ) {
      throw new ApiError(400, "Selected time is outside this doctor's working hours, break time, or holiday schedule");
    }
  }

  const conflict = normalizedPayload.doctorId
    ? await appointmentsRepository.findDoctorConflicts(organizationId, normalizedPayload)
    : null;
  if (conflict) {
    throw new ApiError(409, "This doctor already has an overlapping appointment");
  }

  const created = await appointmentsRepository.createAppointment(organizationId, normalizedPayload);
  await invalidateAppointmentCaches(organizationId);
  return created;
};

const updateAppointment = async (organizationId, appointmentId, payload, actor = null) => {
  const current = await appointmentsRepository.getAppointmentById(organizationId, appointmentId);
  if (!current) {
    throw new ApiError(404, "Appointment not found");
  }

  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  if (actorDoctor && current.doctor_id !== actorDoctor.id) {
    throw new ApiError(403, "You can only update your own appointments");
  }

  if (actor?.role === "doctor") {
    const allowedKeys = new Set(["status"]);
    const invalidKey = Object.keys(payload).find((key) => !allowedKeys.has(key));
    if (invalidKey) {
      throw new ApiError(403, "Doctors can only update appointment status");
    }
  }

  const merged = {
    patientName: payload.patientName ?? current.patient_name ?? current.title,
    patientId: payload.patientId ?? current.patient_id ?? null,
    mobileNumber: payload.mobileNumber ?? current.mobile_number,
    email: payload.email ?? current.email,
    doctorId: payload.doctorId ?? current.doctor_id,
    category: payload.category ?? current.category ?? "consultation",
    status: payload.status ?? current.status ?? "pending",
    appointmentDate: payload.appointmentDate ?? current.appointment_date,
    appointmentTime: payload.appointmentTime ?? current.appointment_time,
    durationMinutes: payload.durationMinutes ?? current.duration_minutes,
    plannedProcedures: payload.plannedProcedures ?? current.planned_procedures,
    notes: payload.notes ?? current.notes
  };

  const patient = await resolveAppointmentPatient(organizationId, merged);
  merged.patientId = patient.patientId;
  merged.patientName = patient.patientName;
  merged.mobileNumber = patient.mobileNumber;
  merged.email = patient.email;

  if (merged.doctorId) {
    const doctor = await doctorsModel.getDoctorById(organizationId, merged.doctorId);
    if (!doctor) {
      throw new ApiError(404, "Doctor not found for this organization");
    }
    if (!isDoctorAvailableForSlot(doctor, merged.appointmentDate, merged.appointmentTime, merged.durationMinutes)) {
      throw new ApiError(400, "Selected time is outside this doctor's working hours, break time, or holiday schedule");
    }
  }

  validateNotInPast(merged.appointmentDate, merged.appointmentTime);

  if (merged.status !== "cancelled" && merged.doctorId) {
    const conflict = await appointmentsRepository.findDoctorConflicts(organizationId, merged, appointmentId);
    if (conflict) {
      throw new ApiError(409, "This doctor already has an overlapping appointment");
    }
  }

  const updated = await appointmentsRepository.updateAppointment(organizationId, appointmentId, merged);
  if (updated.status === "completed" && current.status !== "completed") {
    await medicalRecordsService.createAppointmentRecordIfMissing(organizationId, {
      appointmentId: updated.id,
      patientId: updated.patient_id || merged.patientId,
      doctorId: updated.doctor_id || merged.doctorId,
      recordType: "Visit Note",
      recordDate: updated.appointment_date,
      notes: updated.notes || null
    });
  }
  await invalidateAppointmentCaches(organizationId);
  return updated;
};

const completeConsultation = async (organizationId, appointmentId, payload, actor = null) => {
  const current = await appointmentsRepository.getAppointmentById(organizationId, appointmentId);
  if (!current) {
    throw new ApiError(404, "Appointment not found");
  }

  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  if (actorDoctor && current.doctor_id !== actorDoctor.id) {
    throw new ApiError(403, "You can only complete your own appointments");
  }

  const updatedAppointment = await appointmentsRepository.updateAppointment(organizationId, appointmentId, {
    patientName: current.patient_name || current.title,
    patientId: current.patient_id,
    mobileNumber: current.mobile_number,
    email: current.email,
    doctorId: current.doctor_id,
    category: current.category || "consultation",
    status: "completed",
    appointmentDate: current.appointment_date,
    appointmentTime: current.appointment_time,
    durationMinutes: current.duration_minutes,
    plannedProcedures: current.planned_procedures,
    notes: payload.notes ?? current.notes
  });

  const medicalRecord = await medicalRecordsService.upsertAppointmentConsultationRecord(organizationId, {
    appointmentId: updatedAppointment.id,
    patientId: updatedAppointment.patient_id || current.patient_id,
    doctorId: updatedAppointment.doctor_id || current.doctor_id,
    recordType: "Consultation",
    status: "completed",
    recordDate: updatedAppointment.appointment_date,
    symptoms: payload.symptoms || null,
    diagnosis: payload.diagnosis || null,
    prescription: payload.prescription || null,
    notes: payload.notes || updatedAppointment.notes || null
  });

  await invalidateAppointmentCaches(organizationId);
  return {
    appointment: updatedAppointment,
    medicalRecord
  };
};

const deleteAppointment = async (organizationId, appointmentId, actor = null) => {
  if (actor?.role === "doctor") {
    throw new ApiError(403, "Doctors cannot delete appointments");
  }

  const current = await appointmentsRepository.getAppointmentById(organizationId, appointmentId);
  if (!current) {
    throw new ApiError(404, "Appointment not found");
  }

  await appointmentsRepository.deleteAppointment(organizationId, appointmentId);
  await invalidateAppointmentCaches(organizationId);
};

const bulkCancelAppointments = async (organizationId, payload, actor = null) => {
  if (actor?.role === "doctor") {
    throw new ApiError(403, "Doctors cannot bulk cancel appointments");
  }

  const updatedCount = await appointmentsRepository.bulkCancelAppointments(organizationId, payload);
  await invalidateAppointmentCaches(organizationId);
  return { updatedCount };
};

module.exports = {
  listAppointments,
  createAppointment,
  updateAppointment,
  completeConsultation,
  deleteAppointment,
  bulkCancelAppointments
};
