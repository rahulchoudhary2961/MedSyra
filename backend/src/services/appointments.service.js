const ApiError = require("../utils/api-error");
const appointmentsRepository = require("../models/appointments.model");
const doctorsModel = require("../models/doctors.model");
const patientsModel = require("../models/patients.model");
const medicalRecordsService = require("../services/medical-records.service");
const { sendNoShowNotifications } = require("./appointment-notification.service");
const cache = require("../utils/cache");
const { isDoctorAvailableForSlot } = require("../utils/doctor-availability");

const cachePrefix = (organizationId) => `appointments:list:${organizationId}:`;
const dashboardSummaryCachePrefix = (organizationId) => `dashboard:summary:${organizationId}`;
const dashboardReportsCachePrefix = (organizationId) => `dashboard:reports:${organizationId}`;

const parseDateValue = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const diffInDays = (futureDate, currentDate) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((futureDate.getTime() - currentDate.getTime()) / msPerDay);
};

const formatAppointmentTimeLabel = (value) => {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit"
  });
};

const formatWhatsappRecipient = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }

  return digits.length === 10 ? `91${digits}` : digits;
};

const determineAppointmentReminderStage = (appointmentDate) => {
  const targetDate = parseDateValue(appointmentDate);
  const today = startOfToday();

  if (!targetDate) {
    return { key: "manual_preview", label: "Manual Reminder", tracked: false, dayDelta: null };
  }

  const dayDelta = diffInDays(targetDate, today);

  if (dayDelta < 0) {
    return { key: "past", label: "Past Appointment", tracked: false, dayDelta };
  }
  if (dayDelta === 0) {
    return { key: "same_day", label: "Today Reminder", tracked: true, dayDelta };
  }
  if (dayDelta === 1) {
    return { key: "one_day", label: "Tomorrow Reminder", tracked: true, dayDelta };
  }
  if (dayDelta === 3) {
    return { key: "three_day", label: "3-Day Reminder", tracked: true, dayDelta };
  }

  return { key: "manual_preview", label: "Manual Reminder", tracked: false, dayDelta };
};

const buildAppointmentReminderMessage = ({ patientName, clinicName, doctorName, appointmentDate, appointmentTime, stage }) => {
  const firstName = String(patientName || "Patient").trim().split(/\s+/)[0] || "Patient";
  const clinic = clinicName || "your clinic";
  const doctor = doctorName || "Doctor";
  const timeLabel = formatAppointmentTimeLabel(appointmentTime || "10:00");
  const date = parseDateValue(appointmentDate);
  const formattedDate = date
    ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : appointmentDate;

  let timingLine = `You have an appointment at ${clinic} on ${formattedDate} at ${timeLabel}.`;
  if (stage.key === "three_day") {
    timingLine = `This is a reminder that you have an appointment at ${clinic} in 3 days on ${formattedDate} at ${timeLabel}.`;
  } else if (stage.key === "one_day") {
    timingLine = `This is a reminder that you have an appointment at ${clinic} tomorrow at ${timeLabel}.`;
  } else if (stage.key === "same_day") {
    timingLine = `This is a reminder that you have an appointment at ${clinic} today at ${timeLabel}.`;
  }

  return [
    `Hello ${firstName},`,
    timingLine,
    "Please visit on time.",
    "",
    `- ${doctor}`
  ].join("\n");
};

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
    followUpDate: payload.followUpDate,
    followUpInDays: payload.followUpInDays,
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

const generateAppointmentReminder = async (organizationId, appointmentId, actor = null) => {
  const appointment = await appointmentsRepository.getAppointmentById(organizationId, appointmentId);
  if (!appointment) {
    throw new ApiError(404, "Appointment not found");
  }

  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  if (actorDoctor && appointment.doctor_id !== actorDoctor.id) {
    throw new ApiError(403, "You can only send reminders for your own appointments");
  }

  const status = (appointment.status || "").toLowerCase();
  if (["completed", "cancelled", "no-show"].includes(status)) {
    throw new ApiError(400, "Reminders can only be sent for upcoming appointments");
  }

  const context = await appointmentsRepository.getAppointmentReminderContext(organizationId, appointmentId);
  if (!context) {
    throw new ApiError(404, "Appointment reminder context not found");
  }

  const recipient = formatWhatsappRecipient(context.mobile_number || context.patient_phone);
  if (!recipient) {
    throw new ApiError(400, "Patient phone number is missing or invalid for WhatsApp reminders");
  }

  const stage = determineAppointmentReminderStage(context.appointment_date);
  if (stage.key === "past") {
    throw new ApiError(400, "Cannot send reminders for past appointments");
  }

  const message = buildAppointmentReminderMessage({
    patientName: context.patient_name || context.title,
    clinicName: context.clinic_name,
    doctorName: context.doctor_name,
    appointmentDate: context.appointment_date,
    appointmentTime: context.appointment_time,
    stage
  });

  const whatsappUrl = `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
  const updatedAppointment = stage.tracked
    ? await appointmentsRepository.markAppointmentReminderSent(organizationId, appointmentId, stage.key)
    : appointment;

  await invalidateAppointmentCaches(organizationId);

  return {
    appointment: updatedAppointment,
    reminder: {
      stage: stage.key,
      label: stage.label,
      tracked: stage.tracked,
      whatsappUrl,
      message
    }
  };
};

const markAppointmentNoShow = async (organizationId, appointmentId, payload = {}, actor = null) => {
  const current = await appointmentsRepository.getAppointmentById(organizationId, appointmentId);
  if (!current) {
    throw new ApiError(404, "Appointment not found");
  }

  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  if (actorDoctor && current.doctor_id !== actorDoctor.id) {
    throw new ApiError(403, "You can only update your own appointments");
  }

  const status = (current.status || "").toLowerCase();
  if (["completed", "cancelled", "no-show"].includes(status)) {
    throw new ApiError(400, "This appointment cannot be marked as no-show");
  }

  const updatedAppointment = await appointmentsRepository.updateAppointment(organizationId, appointmentId, {
    patientName: current.patient_name || current.title,
    patientId: current.patient_id,
    mobileNumber: current.mobile_number,
    email: current.email,
    doctorId: current.doctor_id,
    category: current.category || "consultation",
    status: "no-show",
    appointmentDate: current.appointment_date,
    appointmentTime: current.appointment_time,
    durationMinutes: current.duration_minutes,
    plannedProcedures: current.planned_procedures,
    notes: current.notes
  });

  await invalidateAppointmentCaches(organizationId);

  const reminderContext = await appointmentsRepository.getAppointmentReminderContext(organizationId, appointmentId);
  const notifications = await sendNoShowNotifications({
    appointment: updatedAppointment,
    context: reminderContext,
    organizationId,
    notifySms: payload.notifySms === true,
    notifyEmail: payload.notifyEmail === true
  });

  return {
    appointment: updatedAppointment,
    notifications
  };
};

module.exports = {
  listAppointments,
  createAppointment,
  updateAppointment,
  completeConsultation,
  generateAppointmentReminder,
  markAppointmentNoShow,
  deleteAppointment,
  bulkCancelAppointments
};
