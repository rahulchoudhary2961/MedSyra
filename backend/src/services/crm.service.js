const ApiError = require("../utils/api-error");
const cache = require("../utils/cache");
const crmModel = require("../models/crm.model");
const patientsModel = require("../models/patients.model");
const authModel = require("../models/auth.model");
const appointmentsModel = require("../models/appointments.model");
const medicalRecordsModel = require("../models/medical-records.model");
const { logAuditEventSafe } = require("./audit.service");
const { getCurrentDateKey } = require("../utils/date");
const resolveBranchScopeId = (branchContext = null, fallback = null) =>
  branchContext?.readBranchId || branchContext?.writeBranchId || fallback || null;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const FOLLOW_UP_RULES = [
  {
    key: "acute_review",
    pattern: /(fever|infection|cough|cold|flu|viral|uti|pneumonia|bronch|gastr|diarr|vomit|tonsil|sinus|pain abdomen)/i,
    label: "Acute review",
    suggestedDays: 3,
    priority: "high",
    rationale: "Acute illness should be reassessed quickly if symptoms persist or worsen."
  },
  {
    key: "post_procedure",
    pattern: /(post.?op|post.?operative|surgery|wound|suture|fracture|implant|extraction|root canal|procedure|dressing)/i,
    label: "Post-procedure review",
    suggestedDays: 7,
    priority: "high",
    rationale: "Procedure recovery is usually reviewed within a week to catch complications early."
  },
  {
    key: "short_term_response",
    pattern: /(dermat|eczema|acne|allerg|migraine|anxiety|depression|pain|injury|sprain)/i,
    label: "Short-term response check",
    suggestedDays: 14,
    priority: "medium",
    rationale: "Short-interval review helps confirm response to treatment and adherence."
  },
  {
    key: "chronic_management",
    pattern: /(diabet|hypert|asthma|copd|thyroid|arthritis|ckd|kidney disease|cardiac|coronary|epilep|stroke|obesity|cholesterol|lipid|pcos|pcod)/i,
    label: "Chronic care review",
    suggestedDays: 30,
    priority: "medium",
    rationale: "Chronic conditions benefit from a structured monthly review when no explicit follow-up is set."
  },
  {
    key: "specialty_review",
    pattern: /(pregnan|antenatal|fertility|ivf|postnatal|pediatric|child)/i,
    label: "Specialty continuity review",
    suggestedDays: 14,
    priority: "medium",
    rationale: "Continuity-sensitive cases should stay on a tighter review cycle."
  }
];

const CHRONIC_CONDITION_RULES = [
  { pattern: /(diabet)/i, label: "Diabetes" },
  { pattern: /(hypert|bp)/i, label: "Hypertension" },
  { pattern: /(asthma|copd)/i, label: "Chronic respiratory disease" },
  { pattern: /(thyroid)/i, label: "Thyroid disorder" },
  { pattern: /(arthritis)/i, label: "Arthritis" },
  { pattern: /(ckd|kidney disease)/i, label: "Chronic kidney disease" },
  { pattern: /(cardiac|coronary|heart failure)/i, label: "Cardiac condition" },
  { pattern: /(epilep|seizure)/i, label: "Epilepsy / seizure disorder" },
  { pattern: /(cholesterol|lipid)/i, label: "Lipid disorder" },
  { pattern: /(pcos|pcod)/i, label: "PCOS / hormonal follow-up" }
];

const parseDateOnly = (value) => {
  if (!value) {
    return null;
  }

  const [year, month, day] = String(value).slice(0, 10).split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
};

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const diffDays = (laterDate, earlierDate) => Math.round((laterDate.getTime() - earlierDate.getTime()) / DAY_IN_MS);

const resolveFollowUpRule = (diagnosis) => {
  const normalized = typeof diagnosis === "string" ? diagnosis.trim() : "";
  if (!normalized) {
    return null;
  }

  return FOLLOW_UP_RULES.find((rule) => rule.pattern.test(normalized)) || {
    key: "general_review",
    label: "General review",
    suggestedDays: 14,
    priority: "medium",
    rationale: "No explicit diagnosis rule matched, so a general 2-week review is suggested."
  };
};

const resolveChronicLabel = (diagnosis, repeatDiagnosisCount) => {
  const normalized = typeof diagnosis === "string" ? diagnosis.trim() : "";
  const matchedRule = CHRONIC_CONDITION_RULES.find((rule) => rule.pattern.test(normalized));

  if (matchedRule) {
    return {
      conditionLabel: matchedRule.label,
      trackingReason:
        repeatDiagnosisCount >= 2
          ? `${matchedRule.label} repeated ${repeatDiagnosisCount} times in the last 12 months`
          : `${matchedRule.label} identified from the latest diagnosis`
    };
  }

  if (repeatDiagnosisCount >= 2 && normalized) {
    return {
      conditionLabel: normalized,
      trackingReason: `Diagnosis repeated ${repeatDiagnosisCount} times in the last 12 months`
    };
  }

  return null;
};

const buildSmartFollowUpResponse = (currentDateKey, data) => {
  const today = parseDateOnly(currentDateKey) || new Date();

  const autoSuggestions = (data.autoSuggestions || [])
    .map((item) => {
      const followUpRule = resolveFollowUpRule(item.diagnosis);
      const recordDate = parseDateOnly(item.record_date);
      const suggestedFollowUpDate = recordDate && followUpRule ? addDays(recordDate, followUpRule.suggestedDays) : null;
      const daysUntilSuggestedFollowUp = suggestedFollowUpDate ? diffDays(suggestedFollowUpDate, today) : null;

      if (!followUpRule || !recordDate || !suggestedFollowUpDate) {
        return null;
      }

      return {
        patientId: item.patient_id,
        patientCode: item.patient_code || null,
        patientName: item.patient_name,
        phone: item.phone || null,
        medicalRecordId: item.medical_record_id,
        diagnosis: item.diagnosis,
        recordDate: item.record_date,
        lastVisitAt: item.last_visit_at || null,
        suggestionLabel: followUpRule.label,
        suggestedFollowUpDays: followUpRule.suggestedDays,
        suggestedFollowUpDate: formatDateOnly(suggestedFollowUpDate),
        daysUntilSuggestedFollowUp,
        priority:
          daysUntilSuggestedFollowUp !== null && daysUntilSuggestedFollowUp <= 0
            ? "high"
            : followUpRule.priority,
        rationale: followUpRule.rationale
      };
    })
    .filter(Boolean);

  const missedFollowUps = (data.missedFollowUps || []).map((item) => ({
    patientId: item.patient_id,
    patientCode: item.patient_code || null,
    patientName: item.patient_name,
    phone: item.phone || null,
    medicalRecordId: item.medical_record_id,
    diagnosis: item.diagnosis || null,
    recordDate: item.record_date,
    followUpDate: item.follow_up_date,
    reminderStatus: item.reminder_status || "pending",
    lastVisitAt: item.last_visit_at || null,
    daysOverdue: Number(item.days_overdue || 0)
  }));

  const inactive30Days = (data.inactive30Days || []).map((item) => ({
    patientId: item.patient_id,
    patientCode: item.patient_code || null,
    patientName: item.patient_name,
    phone: item.phone || null,
    lastVisitAt: item.last_visit_at || null,
    daysSinceLastVisit: Number(item.days_since_last_visit || 0)
  }));

  const inactive60Days = (data.inactive60Days || []).map((item) => ({
    patientId: item.patient_id,
    patientCode: item.patient_code || null,
    patientName: item.patient_name,
    phone: item.phone || null,
    lastVisitAt: item.last_visit_at || null,
    daysSinceLastVisit: Number(item.days_since_last_visit || 0)
  }));

  const chronicPatients = (data.chronicPatients || [])
    .map((item) => {
      const chronicCondition = resolveChronicLabel(item.latest_diagnosis, Number(item.repeat_diagnosis_count || 0));
      if (!chronicCondition) {
        return null;
      }

      return {
        patientId: item.patient_id,
        patientCode: item.patient_code || null,
        patientName: item.patient_name,
        phone: item.phone || null,
        lastVisitAt: item.last_visit_at || null,
        nextFollowUpDate: item.next_follow_up_date || null,
        latestDiagnosis: item.latest_diagnosis,
        repeatDiagnosisCount: Number(item.repeat_diagnosis_count || 0),
        conditionLabel: chronicCondition.conditionLabel,
        trackingReason: chronicCondition.trackingReason
      };
    })
    .filter(Boolean);

  return {
    summary: {
      autoSuggestions: autoSuggestions.length,
      missedFollowUps: missedFollowUps.length,
      inactive30Days: inactive30Days.length,
      inactive60Days: inactive60Days.length,
      chronicPatients: chronicPatients.length
    },
    autoSuggestions,
    missedFollowUps,
    inactive30Days,
    inactive60Days,
    chronicPatients
  };
};

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

const getSmartFollowUpInsights = async (organizationId, query) => {
  await syncTasks(organizationId);
  const branchId = query.branchId || null;
  const raw = await crmModel.getSmartFollowUpInsights(organizationId, {
    branchId,
    patientId: query.patientId || null,
    limit: query.limit
  });

  return buildSmartFollowUpResponse(getCurrentDateKey(), raw);
};

const createTask = async (organizationId, payload, actor = null, requestMeta = null, branchContext = null) => {
  const patient = await validateReferences(organizationId, payload);
  const normalizedPayload = {
    ...payload,
    branchId: payload.branchId || resolveBranchScopeId(branchContext),
    title: payload.title?.trim() || buildTaskTitle(payload.taskType, patient.full_name),
    nextActionAt: normalizeDateTime(payload.nextActionAt, "nextActionAt"),
    completedAt:
      payload.status && ["scheduled", "closed", "dismissed"].includes(payload.status)
        ? new Date().toISOString()
        : null,
    createdByUserId: actor?.sub || null
  };

  if (!normalizedPayload.branchId) {
    throw new ApiError(400, "A branch must be selected before creating a CRM task");
  }

  const created = await crmModel.createTask(organizationId, normalizedPayload);
  await invalidateCrmRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "crm",
    action: "task_created",
    summary: `CRM task created: ${created.title}`,
    entityType: "crm_task",
    entityId: created.id,
    entityLabel: created.title,
    metadata: {
      taskType: created.task_type,
      status: created.status,
      patientId: created.patient_id
    },
    afterState: created
  });

  return created;
};

const updateTask = async (organizationId, id, payload, actor = null, requestMeta = null, branchContext = null) => {
  const scopeBranchId = payload.branchId || resolveBranchScopeId(branchContext);
  const current = await crmModel.getTaskById(organizationId, id, scopeBranchId);
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
    branchId: scopeBranchId || current.branch_id || null,
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

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "crm",
    action: "task_updated",
    summary: `CRM task updated: ${updated.title}`,
    entityType: "crm_task",
    entityId: updated.id,
    entityLabel: updated.title,
    metadata: {
      taskType: updated.task_type,
      status: updated.status
    },
    beforeState: current,
    afterState: updated
  });

  return updated;
};

module.exports = {
  syncTasks,
  listTasks,
  getSmartFollowUpInsights,
  createTask,
  updateTask
};
