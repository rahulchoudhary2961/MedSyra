const ApiError = require("../utils/api-error");
const appointmentsRepository = require("../models/appointments.model");
const doctorsModel = require("../models/doctors.model");
const patientsModel = require("../models/patients.model");
const medicalRecordsService = require("../services/medical-records.service");
const { sendNoShowNotifications } = require("./appointment-notification.service");
const notificationsService = require("./notifications.service");
const cache = require("../utils/cache");
const { isDoctorAvailableForSlot } = require("../utils/doctor-availability");
const { logAuditEventSafe } = require("./audit.service");

const cachePrefix = (organizationId) => `appointments:list:${organizationId}:`;
const dashboardSummaryCachePrefix = (organizationId) => `dashboard:summary:${organizationId}`;
const dashboardReportsCachePrefix = (organizationId) => `dashboard:reports:${organizationId}`;
const patientItemCachePrefix = (organizationId) => `patients:item:${organizationId}`;
const patientProfileCachePrefix = (organizationId) => `patients:profile:${organizationId}`;
const patientListCachePrefix = (organizationId) => `patients:list:${organizationId}`;
const resolveBranchScopeId = (branchContext = null, fallback = null) =>
  branchContext?.readBranchId || branchContext?.writeBranchId || fallback || null;

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

const parseAppointmentDateTime = (appointmentDate, appointmentTime) => {
  if (!appointmentDate || !appointmentTime) {
    return null;
  }

  const [year, month, day] = String(appointmentDate)
    .slice(0, 10)
    .split("-")
    .map(Number);
  const [hours, minutes] = String(appointmentTime)
    .slice(0, 5)
    .split(":")
    .map(Number);

  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0);
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

const determineAppointmentReminderStage = (appointmentDate) => {
  const targetDate = parseDateValue(appointmentDate);
  const today = startOfToday();

  if (!targetDate) {
    return { key: "unavailable", label: "Reminder available only on appointment day", tracked: false, dayDelta: null };
  }

  const dayDelta = diffInDays(targetDate, today);

  if (dayDelta < 0) {
    return { key: "past", label: "Past Appointment", tracked: false, dayDelta };
  }
  if (dayDelta === 0) {
    return { key: "same_day", label: "Same-Day Reminder", tracked: true, dayDelta };
  }

  return { key: "upcoming", label: "Reminder available only on appointment day", tracked: false, dayDelta };
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
  if (stage.key === "same_day") {
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

const getSmartAppointmentWindow = (preferences, appointmentDate, appointmentTime) => {
  if (preferences?.smart_timing_enabled !== true) {
    return { allowed: true, leadMinutes: null, availableAt: null };
  }

  const leadMinutes = Number(preferences?.appointment_lead_minutes || 120);
  const appointmentMoment = parseAppointmentDateTime(appointmentDate, appointmentTime);
  if (!appointmentMoment) {
    return { allowed: true, leadMinutes, availableAt: null };
  }

  const availableAt = new Date(appointmentMoment.getTime() - leadMinutes * 60 * 1000);
  if (Date.now() < availableAt.getTime()) {
    return {
      allowed: false,
      leadMinutes,
      availableAt
    };
  }

  return { allowed: true, leadMinutes, availableAt };
};

const invalidateAppointmentCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(cachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardSummaryCachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardReportsCachePrefix(organizationId))
  ]);
};

const invalidatePatientCaches = async (organizationId, patientId = null) => {
  const itemPrefix = patientId ? `${patientItemCachePrefix(organizationId)}:${patientId}` : patientItemCachePrefix(organizationId);
  const profilePrefix = patientId ? `${patientProfileCachePrefix(organizationId)}:${patientId}` : patientProfileCachePrefix(organizationId);

  await Promise.all([
    cache.invalidateByPrefix(itemPrefix),
    cache.invalidateByPrefix(profilePrefix),
    cache.invalidateByPrefix(patientListCachePrefix(organizationId))
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
      patientIdentifier: patient.patient_code || patient.id,
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
      patientIdentifier: patient.patient_code || patient.id,
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
    `page=${page}:limit=${limit}:year=${effectiveQuery.year || ""}:month=${effectiveQuery.month || ""}:day=${effectiveQuery.day || ""}:date=${effectiveQuery.date || ""}:patientId=${effectiveQuery.patientId || ""}:doctorId=${effectiveQuery.doctorId || ""}:branchId=${effectiveQuery.branchId || ""}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await appointmentsRepository.listAppointments(organizationId, effectiveQuery);
  await cache.set(cacheKey, result, 60);
  return result;
};

const createAppointment = async (organizationId, payload, actor = null, requestMeta = null, branchContext = null) => {
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
    branchId: payload.branchId || resolveBranchScopeId(branchContext),
    patientId: patient.patientId,
    patientIdentifier: patient.patientIdentifier,
    patientName: patient.patientName,
    mobileNumber: patient.mobileNumber,
    email: patient.email
  };

  if (!normalizedPayload.branchId) {
    throw new ApiError(400, "A branch must be selected before creating an appointment");
  }

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

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "appointments",
    action: "appointment_created",
    summary: `Appointment created for ${created.patient_name || created.title}`,
    entityType: "appointment",
    entityId: created.id,
    entityLabel: created.patient_identifier || created.patient_name || created.title,
    metadata: {
      doctorId: created.doctor_id || null,
      status: created.status || null,
      appointmentDate: created.appointment_date,
      appointmentTime: created.appointment_time,
      category: created.category || null
    },
    afterState: created
  });

  return created;
};

const updateAppointment = async (organizationId, appointmentId, payload, actor = null, requestMeta = null, branchContext = null) => {
  const scopeBranchId = resolveBranchScopeId(branchContext);
  const current = await appointmentsRepository.getAppointmentById(organizationId, appointmentId, scopeBranchId);
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
    branchId: payload.branchId || current.branch_id || resolveBranchScopeId(branchContext),
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
  merged.patientIdentifier = patient.patientIdentifier;
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
    if (updated.patient_id || merged.patientId) {
      const targetPatientId = updated.patient_id || merged.patientId;
      await patientsModel.updatePatient(organizationId, targetPatientId, {
        lastVisitAt: updated.appointment_date
      });
      await invalidatePatientCaches(organizationId, targetPatientId);
    }
  }
  await invalidateAppointmentCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "appointments",
    action: "appointment_updated",
    summary: `Appointment updated for ${updated.patient_name || updated.title}`,
    entityType: "appointment",
    entityId: updated.id,
    entityLabel: updated.patient_identifier || updated.patient_name || updated.title,
    metadata: {
      doctorId: updated.doctor_id || null,
      status: updated.status || null,
      appointmentDate: updated.appointment_date,
      appointmentTime: updated.appointment_time
    },
    beforeState: current,
    afterState: updated
  });

  return updated;
};

const completeConsultation = async (organizationId, appointmentId, payload, actor = null, requestMeta = null, branchContext = null) => {
  const scopeBranchId = resolveBranchScopeId(branchContext);
  const current = await appointmentsRepository.getAppointmentById(organizationId, appointmentId, scopeBranchId);
  if (!current) {
    throw new ApiError(404, "Appointment not found");
  }

  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  if (actorDoctor && current.doctor_id !== actorDoctor.id) {
    throw new ApiError(403, "You can only complete your own appointments");
  }

  const updatedAppointment = await appointmentsRepository.updateAppointment(organizationId, appointmentId, {
    branchId: current.branch_id || payload.branchId || resolveBranchScopeId(branchContext),
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
    branchId: updatedAppointment.branch_id || current.branch_id || payload.branchId || resolveBranchScopeId(branchContext),
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
    sendFollowUpReminder: payload.sendFollowUpReminder === true,
    notes: payload.notes || updatedAppointment.notes || null
  });

  if (updatedAppointment.patient_id || current.patient_id) {
    const targetPatientId = updatedAppointment.patient_id || current.patient_id;
    await patientsModel.updatePatient(organizationId, targetPatientId, {
      lastVisitAt: updatedAppointment.appointment_date
    });
    await invalidatePatientCaches(organizationId, targetPatientId);
  }

  await invalidateAppointmentCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "appointments",
    action: "consultation_completed",
    summary: `Consultation completed for ${updatedAppointment.patient_name || updatedAppointment.title}`,
    entityType: "appointment",
    entityId: updatedAppointment.id,
    entityLabel: updatedAppointment.patient_identifier || updatedAppointment.patient_name || updatedAppointment.title,
    metadata: {
      medicalRecordId: medicalRecord?.id || null,
      followUpDate: medicalRecord?.follow_up_date || null,
      appointmentDate: updatedAppointment.appointment_date
    },
    beforeState: current,
    afterState: updatedAppointment
  });

  return {
    appointment: updatedAppointment,
    medicalRecord
  };
};

const deleteAppointment = async (organizationId, appointmentId, actor = null, requestMeta = null, branchContext = null) => {
  if (actor?.role === "doctor") {
    throw new ApiError(403, "Doctors cannot delete appointments");
  }

  const scopeBranchId = resolveBranchScopeId(branchContext);
  const current = await appointmentsRepository.getAppointmentById(organizationId, appointmentId, scopeBranchId);
  if (!current) {
    throw new ApiError(404, "Appointment not found");
  }

  await appointmentsRepository.deleteAppointment(organizationId, appointmentId, scopeBranchId);
  await invalidateAppointmentCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "appointments",
    action: "appointment_deleted",
    summary: `Appointment deleted for ${current.patient_name || current.title}`,
    entityType: "appointment",
    entityId: current.id,
    entityLabel: current.patient_identifier || current.patient_name || current.title,
    severity: "warning",
    isDestructive: true,
    metadata: {
      appointmentDate: current.appointment_date,
      appointmentTime: current.appointment_time
    },
    beforeState: current,
    afterState: null
  });
};

const bulkCancelAppointments = async (organizationId, payload, actor = null, requestMeta = null, branchContext = null) => {
  if (actor?.role === "doctor") {
    throw new ApiError(403, "Doctors cannot bulk cancel appointments");
  }

  const updatedCount = await appointmentsRepository.bulkCancelAppointments(organizationId, {
    ...payload,
    branchId: payload.branchId || resolveBranchScopeId(branchContext)
  });
  await invalidateAppointmentCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "appointments",
    action: "appointments_bulk_cancelled",
    summary: `${updatedCount} appointments cancelled for ${payload.appointmentDate}`,
    entityType: "appointment_batch",
    severity: updatedCount > 0 ? "warning" : "info",
    isDestructive: updatedCount > 0,
    metadata: {
      appointmentDate: payload.appointmentDate,
      doctorId: payload.doctorId || null,
      updatedCount
    }
  });

  return { updatedCount };
};

const generateAppointmentReminder = async (organizationId, appointmentId, actor = null, branchContext = null) => {
  const scopeBranchId = resolveBranchScopeId(branchContext);
  const appointment = await appointmentsRepository.getAppointmentById(organizationId, appointmentId, scopeBranchId);
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

  const context = await appointmentsRepository.getAppointmentReminderContext(organizationId, appointmentId, scopeBranchId);
  if (!context) {
    throw new ApiError(404, "Appointment reminder context not found");
  }

  const stage = determineAppointmentReminderStage(context.appointment_date);
  if (stage.key === "past") {
    throw new ApiError(400, "Cannot send reminders for past appointments");
  }
  if (stage.key !== "same_day") {
    throw new ApiError(400, "Appointment reminders are available only on the appointment day");
  }

  const message = buildAppointmentReminderMessage({
    patientName: context.patient_name || context.title,
    clinicName: context.clinic_name,
    doctorName: context.doctor_name,
    appointmentDate: context.appointment_date,
    appointmentTime: context.appointment_time,
    stage
  });

  const preferencesResponse = await notificationsService.getNotificationPreferences(organizationId);
  const timingWindow = getSmartAppointmentWindow(
    preferencesResponse.preferences,
    context.appointment_date,
    context.appointment_time
  );
  if (!timingWindow.allowed) {
    throw new ApiError(
      400,
      `Smart timing is enabled. This reminder becomes available at ${timingWindow.availableAt.toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit"
      })}.`
    );
  }

  const deliveries = await notificationsService.sendReminderDeliveries({
    organizationId,
    branchId: appointment.branch_id || scopeBranchId || null,
    actorUserId: actor?.sub || null,
    notificationType: "appointment_reminder",
    referenceId: appointmentId,
    phone: context.mobile_number || context.patient_phone,
    body: message,
    metadata: {
      appointmentId,
      patientName: context.patient_name || context.title,
      doctorName: context.doctor_name || null,
      appointmentDate: context.appointment_date,
      appointmentTime: context.appointment_time,
      smartLeadMinutes: timingWindow.leadMinutes
    },
    preferences: preferencesResponse.preferences
  });

  if (deliveries.length === 0) {
    throw new ApiError(400, "No appointment reminder channels are enabled in notification settings");
  }

  const successfulDelivery = deliveries.find((item) => item.status === "sent");
  if (!successfulDelivery) {
    throw new ApiError(502, "Failed to send appointment reminder using the configured channels");
  }

  const updatedAppointment =
    stage.tracked
      ? await appointmentsRepository.markAppointmentReminderSent(organizationId, appointmentId, stage.key, scopeBranchId)
      : appointment;

  await invalidateAppointmentCaches(organizationId);

  return {
    appointment: updatedAppointment,
    reminder: {
      stage: stage.key,
      label: stage.label,
      tracked: stage.tracked,
      message,
      deliveries
    }
  };
};

const markAppointmentNoShow = async (organizationId, appointmentId, payload = {}, actor = null, requestMeta = null, branchContext = null) => {
  const scopeBranchId = resolveBranchScopeId(branchContext);
  const current = await appointmentsRepository.getAppointmentById(organizationId, appointmentId, scopeBranchId);
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
    branchId: current.branch_id || payload.branchId || resolveBranchScopeId(branchContext),
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

  const reminderContext = await appointmentsRepository.getAppointmentReminderContext(organizationId, appointmentId, scopeBranchId);
  const notifications = await sendNoShowNotifications({
    appointment: updatedAppointment,
    context: reminderContext,
    organizationId,
    notifySms: payload.notifySms === true,
    notifyEmail: payload.notifyEmail === true
  });

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "appointments",
    action: "appointment_marked_no_show",
    summary: `Appointment marked no-show for ${updatedAppointment.patient_name || updatedAppointment.title}`,
    entityType: "appointment",
    entityId: updatedAppointment.id,
    entityLabel: updatedAppointment.patient_identifier || updatedAppointment.patient_name || updatedAppointment.title,
    severity: "warning",
    metadata: {
      notifySms: payload.notifySms === true,
      notifyEmail: payload.notifyEmail === true,
      notificationCount: Array.isArray(notifications) ? notifications.length : 0
    },
    beforeState: current,
    afterState: updatedAppointment
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
