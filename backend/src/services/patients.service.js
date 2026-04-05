const ApiError = require("../utils/api-error");
const parsePagination = require("../utils/pagination");
const patientsRepository = require("../models/patients.model");
const cache = require("../utils/cache");

const invalidatePatientAndDashboardCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(`patients:list:${organizationId}`),
    cache.invalidateByPrefix(`patients:item:${organizationId}`),
    cache.invalidateByPrefix(`patients:profile:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);
};

const SUMMARY_WINDOW_DAYS = 60;
const MAX_MEDICINES = 3;

const parseDateValue = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseDateTimeValue = (dateValue, timeValue = "00:00:00") => {
  if (!dateValue || typeof dateValue !== "string") {
    return null;
  }

  const normalizedTime = typeof timeValue === "string" && timeValue.length >= 5 ? timeValue.slice(0, 8) : "00:00:00";
  const date = new Date(`${dateValue}T${normalizedTime}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatShortDate = (value) => {
  const date = parseDateValue(value);
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(date);
};

const startOfUtcDay = (value = new Date()) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const diffInDays = (laterDate, earlierDate) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((laterDate.getTime() - earlierDate.getTime()) / msPerDay);
};

const normalizeLabel = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
};

const titleCasePhrase = (value) => {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const splitPrescriptionItems = (value) => {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,;]+/)
    .map((item) => normalizeLabel(item))
    .filter(Boolean)
    .slice(0, MAX_MEDICINES);
};

const pickVisitReason = (visit) => {
  const candidates = [visit.planned_procedures, visit.notes, visit.category];
  const match = candidates.find((value) => normalizeLabel(value));

  if (!match) {
    return "General consultation";
  }

  if (match === visit.category) {
    return titleCasePhrase(match);
  }

  return match;
};

const inferOngoingIssue = (visits, medicalRecords) => {
  const diagnosisCounts = new Map();

  for (const record of medicalRecords.slice(0, 6)) {
    const diagnosis = normalizeLabel(record.diagnosis);
    if (!diagnosis) {
      continue;
    }

    const key = diagnosis.toLowerCase();
    const current = diagnosisCounts.get(key) || { count: 0, label: diagnosis };
    diagnosisCounts.set(key, { count: current.count + 1, label: current.label });
  }

  const recurringDiagnosis = [...diagnosisCounts.values()].sort((a, b) => b.count - a.count)[0];
  if (recurringDiagnosis && recurringDiagnosis.count >= 2) {
    return {
      label: "Ongoing issue",
      value: recurringDiagnosis.label
    };
  }

  const latestDiagnosis = medicalRecords
    .map((record) => normalizeLabel(record.diagnosis))
    .find(Boolean);
  if (latestDiagnosis) {
    return {
      label: "Ongoing issue",
      value: latestDiagnosis
    };
  }

  const recentCategory = visits
    .map((visit) => normalizeLabel(visit.category))
    .find((value) => value && !["consultation", "walk-in"].includes(value.toLowerCase()));
  if (recentCategory) {
    return {
      label: "Ongoing issue",
      value: titleCasePhrase(recentCategory)
    };
  }

  return null;
};

const inferFollowUp = (visits, medicalRecords) => {
  const now = startOfUtcDay();
  const recordFollowUp = medicalRecords
    .map((record) => record.follow_up_date)
    .find(Boolean);

  if (recordFollowUp) {
    const dueDate = parseDateValue(recordFollowUp);
    if (dueDate) {
      const dayDelta = diffInDays(dueDate, now);
      if (dayDelta === 0) {
        return { label: "Follow-up", value: "Due today" };
      }
      if (dayDelta > 0) {
        return { label: "Follow-up", value: `Due in ${dayDelta} day${dayDelta === 1 ? "" : "s"}` };
      }
      const overdueDays = Math.abs(dayDelta);
      return { label: "Follow-up", value: `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}` };
    }
  }

  const activeVisits = visits.filter((visit) => !["cancelled", "completed"].includes((visit.status || "").toLowerCase()));
  const followUpVisits = activeVisits.filter((visit) => {
    const category = normalizeLabel(visit.category).toLowerCase();
    const notes = normalizeLabel(visit.notes).toLowerCase();
    const procedures = normalizeLabel(visit.planned_procedures).toLowerCase();
    return category === "follow-up" || category === "review" || notes.includes("follow-up") || procedures.includes("follow-up");
  });

  if (followUpVisits.length === 0) {
    return null;
  }

  const sorted = [...followUpVisits].sort((a, b) => {
    const aDate = parseDateTimeValue(a.appointment_date, a.appointment_time)?.getTime() || 0;
    const bDate = parseDateTimeValue(b.appointment_date, b.appointment_time)?.getTime() || 0;
    return aDate - bDate;
  });

  const upcoming = sorted.find((visit) => {
    const date = parseDateValue(visit.appointment_date);
    return date && date.getTime() >= now.getTime();
  });
  const targetVisit = upcoming || sorted[sorted.length - 1];
  const dueDate = parseDateValue(targetVisit?.appointment_date);

  if (!targetVisit || !dueDate) {
    return null;
  }

  const dayDelta = diffInDays(dueDate, now);
  if (dayDelta === 0) {
    return { label: "Follow-up", value: "Due today" };
  }

  if (dayDelta > 0) {
    return { label: "Follow-up", value: `Due in ${dayDelta} day${dayDelta === 1 ? "" : "s"}` };
  }

  const overdueDays = Math.abs(dayDelta);
  return { label: "Follow-up", value: `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}` };
};

const buildSmartSummary = (profile) => {
  const visits = Array.isArray(profile.visits) ? profile.visits : [];
  const medicalRecords = Array.isArray(profile.medicalRecords) ? profile.medicalRecords : [];
  const completedVisits = visits.filter((visit) => (visit.status || "").toLowerCase() === "completed");
  const lastVisitSource = completedVisits[0] || visits[0] || null;
  const lastVisit =
    lastVisitSource && lastVisitSource.appointment_date
      ? {
          label: "Last visit",
          value: `${formatShortDate(lastVisitSource.appointment_date) || lastVisitSource.appointment_date} - ${pickVisitReason(lastVisitSource)}`
        }
      : null;

  const windowStart = startOfUtcDay();
  windowStart.setUTCDate(windowStart.getUTCDate() - SUMMARY_WINDOW_DAYS);
  const recentVisitCount = visits.filter((visit) => {
    const visitDate = parseDateValue(visit.appointment_date);
    return visitDate && visitDate.getTime() >= windowStart.getTime();
  }).length;

  const visitFrequency = {
    label: "Visit frequency",
    value: `${recentVisitCount} visit${recentVisitCount === 1 ? "" : "s"} in last 2 months`
  };

  const ongoingIssue = inferOngoingIssue(visits, medicalRecords);
  const followUp = inferFollowUp(visits, medicalRecords);

  const lastPrescriptionRecord = medicalRecords.find((record) => splitPrescriptionItems(record.prescription).length > 0);
  const medicines = lastPrescriptionRecord ? splitPrescriptionItems(lastPrescriptionRecord.prescription) : [];
  const lastPrescribed =
    medicines.length > 0
      ? {
          label: "Last prescribed",
          value: medicines.join(", ")
        }
      : null;

  return [lastVisit, visitFrequency, ongoingIssue, followUp, lastPrescribed].filter(Boolean);
};

const normalizePatientPayload = (payload) => {
  const calculateAgeFromDateOfBirth = (value) => {
    const dateOfBirth = parseDateValue(value);
    if (!dateOfBirth) {
      return null;
    }

    const now = new Date();
    let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const hasBirthdayPassed =
      now.getUTCMonth() > dateOfBirth.getUTCMonth() ||
      (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() >= dateOfBirth.getUTCDate());

    if (!hasBirthdayPassed) {
      age -= 1;
    }

    return Math.max(age, 0);
  };

  const normalizeDigits = (value) => {
    if (typeof value !== "string") {
      return value;
    }

    return value.replace(/\D/g, "");
  };

  const normalizedPayload = {
    ...payload,
    phone: typeof payload.phone === "string" ? normalizeDigits(payload.phone.trim()) : payload.phone,
    emergencyContact:
      typeof payload.emergencyContact === "string"
        ? normalizeDigits(payload.emergencyContact.trim())
        : payload.emergencyContact,
    email: payload.email ? payload.email.trim().toLowerCase() : null,
    dateOfBirth: payload.dateOfBirth || undefined
  };

  if (normalizedPayload.dateOfBirth) {
    normalizedPayload.age = calculateAgeFromDateOfBirth(normalizedPayload.dateOfBirth);
  }

  return normalizedPayload;
};

const listPatients = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const q = query.q || "";
  const status = query.status || "";
  const cacheKey =
    `patients:list:${organizationId}:` +
    `page=${page}:limit=${limit}:q=${q.toLowerCase()}:status=${status.toLowerCase()}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await patientsRepository.listPatients({
    organizationId,
    search: q,
    status,
    limit,
    offset
  });

  const payload = {
    items: result.items,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit) || 1
    }
  };

  await cache.set(cacheKey, payload, 60);
  return payload;
};

const createPatient = async (organizationId, payload) => {
  if (!payload.fullName || !payload.phone || !payload.gender) {
    throw new ApiError(400, "fullName, phone and gender are required");
  }

  const normalizedPayload = normalizePatientPayload(payload);

  const duplicate = await patientsRepository.findDuplicatePatient(organizationId, {
    phone: normalizedPayload.phone,
    email: normalizedPayload.email
  });

  if (duplicate) {
    throw new ApiError(409, "Patient already exists. Use the existing record.", {
      existingPatientId: duplicate.id
    });
  }

  const created = await patientsRepository.createPatient(organizationId, normalizedPayload);
  await invalidatePatientAndDashboardCaches(organizationId);
  return created;
};

const getPatientById = async (organizationId, id) => {
  const cacheKey = `patients:item:${organizationId}:${id}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const patient = await patientsRepository.getPatientById(organizationId, id);
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }
  await cache.set(cacheKey, patient, 60);
  return patient;
};

const getPatientProfile = async (organizationId, id) => {
  const cacheKey = `patients:profile:${organizationId}:${id}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const profile = await patientsRepository.getPatientProfile(organizationId, id);
  if (!profile.patient) {
    throw new ApiError(404, "Patient not found");
  }

  const payload = {
    patient: profile.patient,
    visits: profile.visits,
    medicalRecords: profile.medicalRecords,
    invoices: profile.invoices,
    smartSummary: buildSmartSummary(profile),
    summary: {
      totalVisits: Number(profile.summary.total_visits || 0),
      totalSpent: Number(profile.summary.total_spent || 0),
      lastVisitDate: profile.summary.last_visit_date || null,
      pendingAmount: Number(profile.summary.pending_amount || 0)
    }
  };

  await cache.set(cacheKey, payload, 60);
  return payload;
};

const updatePatient = async (organizationId, id, payload) => {
  const normalizedPayload = normalizePatientPayload(payload);

  if (normalizedPayload.phone || normalizedPayload.email) {
    const existing = await patientsRepository.getPatientById(organizationId, id);
    if (!existing) {
      throw new ApiError(404, "Patient not found");
    }

    const duplicate = await patientsRepository.findDuplicatePatient(organizationId, {
      phone: normalizedPayload.phone || existing.phone,
      email: normalizedPayload.email || existing.email || null,
      excludeId: id
    });

    if (duplicate) {
      throw new ApiError(409, "Another patient already uses this contact information.", {
        existingPatientId: duplicate.id
      });
    }
  }

  const patient = await patientsRepository.updatePatient(organizationId, id, normalizedPayload);
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  await invalidatePatientAndDashboardCaches(organizationId);
  return patient;
};

const deletePatient = async (organizationId, id) => {
  const deleted = await patientsRepository.softDeletePatient(organizationId, id);
  if (!deleted) {
    throw new ApiError(404, "Patient not found");
  }

  await invalidatePatientAndDashboardCaches(organizationId);
};

module.exports = {
  listPatients,
  createPatient,
  getPatientById,
  getPatientProfile,
  updatePatient,
  deletePatient
};
