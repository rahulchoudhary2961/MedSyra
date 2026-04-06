const ApiError = require("../utils/api-error");
const doctorsRepository = require("../models/doctors.model");
const authModel = require("../models/auth.model");
const cache = require("../utils/cache");
const { parseHolidayDates, parseWeeklyOffDays } = require("../utils/doctor-availability");
const { logAuditEventSafe } = require("./audit.service");

const allowedWeeklyOffDays = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
]);

const doctorsListCachePrefix = (organizationId) => `doctors:list:${organizationId}:`;

const listDoctors = async (organizationId, query) => {
  const page = Number.parseInt(query.page, 10) || 1;
  const limit = Number.parseInt(query.limit, 10) || 10;
  const q = query.q || "";
  const status = query.status || "";

  const cacheKey =
    `${doctorsListCachePrefix(organizationId)}` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await doctorsRepository.listDoctors(organizationId, query);
  await cache.set(cacheKey, result, 60);
  return result;
};

const createDoctor = async (organizationId, payload, actor = null, requestMeta = null) => {
  if (!payload.fullName || !payload.specialty) {
    throw new ApiError(400, "fullName and specialty are required");
  }

  if ((payload.workStartTime && !payload.workEndTime) || (!payload.workStartTime && payload.workEndTime)) {
    throw new ApiError(400, "Both workStartTime and workEndTime are required together");
  }

  if (payload.workStartTime && payload.workEndTime && payload.workStartTime >= payload.workEndTime) {
    throw new ApiError(400, "workEndTime must be later than workStartTime");
  }

  if ((payload.breakStartTime && !payload.breakEndTime) || (!payload.breakStartTime && payload.breakEndTime)) {
    throw new ApiError(400, "Both breakStartTime and breakEndTime are required together");
  }

  if (payload.breakStartTime && payload.breakEndTime) {
    if (payload.breakStartTime >= payload.breakEndTime) {
      throw new ApiError(400, "breakEndTime must be later than breakStartTime");
    }

    if (
      payload.workStartTime &&
      payload.workEndTime &&
      (payload.breakStartTime < payload.workStartTime || payload.breakEndTime > payload.workEndTime)
    ) {
      throw new ApiError(400, "Break time must stay within doctor working hours");
    }
  }

  if (payload.holidayDates) {
    const invalidHoliday = parseHolidayDates(payload.holidayDates).some((value) => !/^\d{4}-\d{2}-\d{2}$/.test(value));
    if (invalidHoliday) {
      throw new ApiError(400, "holidayDates must use comma-separated YYYY-MM-DD dates");
    }
  }

  if (payload.weeklyOffDays) {
    const invalidWeekday = parseWeeklyOffDays(payload.weeklyOffDays).some((value) => !allowedWeeklyOffDays.has(value));
    if (invalidWeekday) {
      throw new ApiError(400, "weeklyOffDays must use comma-separated weekday names");
    }
  }

  if (payload.consultationFee !== undefined && Number(payload.consultationFee) < 0) {
    throw new ApiError(400, "consultationFee cannot be negative");
  }

  let linkedUserId = payload.userId || null;

  if (linkedUserId) {
    const user = await authModel.findUserById(linkedUserId);
    if (!user || user.organization_id !== organizationId) {
      throw new ApiError(404, "Linked user not found for this organization");
    }
    if (user.role !== "doctor") {
      throw new ApiError(400, "Only doctor-role users can be linked to doctor profiles");
    }

    const existingDoctor = await doctorsRepository.getDoctorByUserId(organizationId, linkedUserId);
    if (existingDoctor) {
      throw new ApiError(409, "This user is already linked to another doctor profile");
    }
  } else if (payload.email) {
    const matchedUser = await authModel.findUserByEmail(payload.email.toLowerCase().trim());
    if (matchedUser && matchedUser.organization_id === organizationId && matchedUser.role === "doctor") {
      const existingDoctor = await doctorsRepository.getDoctorByUserId(organizationId, matchedUser.id);
      if (!existingDoctor) {
        linkedUserId = matchedUser.id;
      }
    }
  }

  const created = await doctorsRepository.createDoctor(organizationId, {
    ...payload,
    userId: linkedUserId
  });
  await Promise.all([
    cache.invalidateByPrefix(doctorsListCachePrefix(organizationId)),
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "doctors",
    action: "doctor_created",
    summary: `Doctor created: ${created.full_name}`,
    entityType: "doctor",
    entityId: created.id,
    entityLabel: created.full_name,
    metadata: {
      specialty: created.specialty || null,
      linkedUserId: created.user_id || null
    },
    afterState: created
  });

  return created;
};

const deleteDoctor = async (organizationId, id, actor = null, requestMeta = null) => {
  const doctor = await doctorsRepository.getDoctorById(organizationId, id);
  if (!doctor) {
    throw new ApiError(404, "Doctor not found");
  }

  const usage = await doctorsRepository.getDoctorUsage(organizationId, id);
  if (usage.has_appointments || usage.has_medical_records || usage.has_invoices) {
    throw new ApiError(
      409,
      "Doctor cannot be deleted because linked appointments, medical records, or invoices already exist"
    );
  }

  await doctorsRepository.deleteDoctor(organizationId, id);
  await Promise.all([
    cache.invalidateByPrefix(doctorsListCachePrefix(organizationId)),
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "doctors",
    action: "doctor_deleted",
    summary: `Doctor deleted: ${doctor.full_name}`,
    entityType: "doctor",
    entityId: doctor.id,
    entityLabel: doctor.full_name,
    severity: "warning",
    isDestructive: true,
    metadata: {
      specialty: doctor.specialty || null
    },
    beforeState: doctor,
    afterState: null
  });
};

module.exports = {
  listDoctors,
  createDoctor,
  deleteDoctor
};
