const env = require("../config/env");
const ApiError = require("../utils/api-error");
const aiPrescriptionModel = require("../models/ai-prescription.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const appointmentsModel = require("../models/appointments.model");
const medicalRecordsModel = require("../models/medical-records.model");
const patientsService = require("./patients.service");
const { logAuditEventSafe } = require("./audit.service");

const DISCLAIMER =
  "AI suggestion is a draft for licensed-clinician review only. Do not dispense or share it with the patient until a doctor approves it.";

const RESTRICTED_MEDICATION_KEYWORDS = [
  "morphine",
  "oxycodone",
  "hydrocodone",
  "fentanyl",
  "tramadol",
  "codeine",
  "alprazolam",
  "diazepam",
  "lorazepam",
  "clonazepam",
  "amphetamine",
  "methylphenidate",
  "lisdexamfetamine",
  "warfarin",
  "heparin",
  "enoxaparin",
  "insulin",
  "chemotherapy",
  "methotrexate"
];

const MAX_SUGGESTION_ITEMS = 6;
const MAX_TEXT_LENGTH = 1800;
const resolveBranchScopeId = (branchContext = null, fallback = null) =>
  branchContext?.readBranchId || branchContext?.writeBranchId || fallback || null;

const normalizeString = (value, maxLength = 500) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
};

const normalizeMultiline = (value, maxLength = MAX_TEXT_LENGTH) => {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxLength);
};

const normalizeTextList = (value, maxItems = 6, maxLength = 220) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
};

const containsRestrictedKeyword = (value) => {
  const normalized = normalizeString(value, 2000).toLowerCase();
  if (!normalized) {
    return false;
  }

  return RESTRICTED_MEDICATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const parseJsonObject = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const match = value.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
};

const askNvidia = async ({ systemPrompt, userPrompt, temperature = 0.2 }) => {
  if (!env.nvidiaApiKey) {
    throw new ApiError(503, "AI prescription suggestions are not configured");
  }

  const response = await fetch(`${env.nvidiaBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.nvidiaApiKey}`
    },
    body: JSON.stringify({
      model: env.nvidiaModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature,
      top_p: 1,
      max_tokens: 1400,
      stream: false
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `AI prescription request failed with status ${response.status}`;
    throw new ApiError(502, message);
  }

  const reply = payload?.choices?.[0]?.message?.content?.trim() || "";
  if (!reply) {
    throw new ApiError(502, "AI prescription service returned an empty response");
  }

  return reply;
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

const buildRecentHistory = (profile) => {
  const records = Array.isArray(profile?.medicalRecords) ? profile.medicalRecords.slice(0, 4) : [];
  if (records.length === 0) {
    return ["Recent clinical history: none"];
  }

  return [
    "Recent clinical history:",
    ...records.map((record) => {
      const diagnosis = normalizeString(record.diagnosis, 160) || "No diagnosis";
      const prescription = normalizeString(record.prescription, 160) || "No recorded prescription";
      return `- ${record.record_date}: ${diagnosis}. Prescription: ${prescription}.`;
    })
  ];
};

const buildPrompt = ({ patient, doctor, profile, symptoms, diagnosis, notes }) => {
  const smartSummary = Array.isArray(profile?.smartSummary) ? profile.smartSummary : [];
  const summaryLines =
    smartSummary.length > 0
      ? smartSummary.map((item) => `- ${normalizeString(item.label, 80)}: ${normalizeString(item.value, 160)}`)
      : ["- No smart summary available"];

  return [
    "Patient context:",
    `- Name: ${patient.full_name}`,
    `- Age: ${patient.age ?? "unknown"}`,
    `- Gender: ${patient.gender || "unknown"}`,
    `- Blood type: ${patient.blood_type || "unknown"}`,
    `- Last visit: ${patient.last_visit_at || "unknown"}`,
    `- Reviewing doctor: ${doctor?.full_name || "unknown"}`,
    `- Doctor specialty: ${doctor?.specialty || "unknown"}`,
    "",
    "Smart summary:",
    ...summaryLines,
    "",
    ...buildRecentHistory(profile),
    "",
    "Current consultation draft:",
    `- Symptoms: ${normalizeString(symptoms, 700) || "not provided"}`,
    `- Working diagnosis: ${normalizeString(diagnosis, 500) || "not provided"}`,
    `- Additional notes: ${normalizeString(notes, 700) || "not provided"}`,
    "",
    "Return strict JSON only."
  ].join("\n");
};

const buildFallbackPrescriptionText = (suggestionItems, carePlan, followUpAdvice) => {
  const lines = suggestionItems.map((item) =>
    [item.name, item.dosage, item.frequency, item.duration].filter(Boolean).join(" | ")
  );

  if (carePlan.length > 0) {
    lines.push("", "Care plan:");
    carePlan.forEach((item) => lines.push(`- ${item}`));
  }

  if (followUpAdvice) {
    lines.push("", `Follow-up: ${followUpAdvice}`);
  }

  return normalizeMultiline(lines.join("\n"));
};

const sanitizeSuggestionItems = (value, guardrails) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items = [];

  for (const rawItem of value.slice(0, MAX_SUGGESTION_ITEMS)) {
    const item = {
      name: normalizeString(rawItem?.name, 120),
      dosage: normalizeString(rawItem?.dosage, 120),
      frequency: normalizeString(rawItem?.frequency, 120),
      duration: normalizeString(rawItem?.duration, 120),
      instructions: normalizeString(rawItem?.instructions, 220),
      reason: normalizeString(rawItem?.reason, 220)
    };

    if (!item.name) {
      continue;
    }

    const serialized = JSON.stringify(item);
    if (containsRestrictedKeyword(serialized)) {
      guardrails.push(`Restricted medicine removed from AI draft: ${item.name}. Manual prescribing is required.`);
      continue;
    }

    items.push(item);
  }

  return items;
};

const sanitizeSuggestionPayload = (payload, patient) => {
  const guardrails = normalizeTextList(payload?.guardrails, 8, 260);
  const redFlags = normalizeTextList(payload?.redFlags, 8, 220);
  const carePlan = normalizeTextList(payload?.carePlan, 6, 220);
  const suggestionItems = sanitizeSuggestionItems(payload?.suggestionItems, guardrails);

  if (!normalizeString(payload?.diagnosisSupport, 200)) {
    guardrails.push("Review the diagnosis clinically before using the AI draft.");
  }

  if (patient?.age !== null && patient?.age !== undefined && Number(patient.age) < 12) {
    guardrails.push("Pediatric patient: verify all doses manually using weight and local pediatric guidance.");
  }

  if (!normalizeString(payload?.prescriptionText, MAX_TEXT_LENGTH) && suggestionItems.length === 0) {
    guardrails.push("AI could not produce a safe medication draft from the available data.");
  }

  let prescriptionText = normalizeMultiline(payload?.prescriptionText || "");
  if (containsRestrictedKeyword(prescriptionText)) {
    guardrails.push("Restricted medication text was removed from the AI draft. Manual prescribing is required.");
    prescriptionText = "";
  }

  if (!prescriptionText) {
    prescriptionText = buildFallbackPrescriptionText(
      suggestionItems,
      carePlan,
      normalizeString(payload?.followUpAdvice, 220)
    );
  }

  return {
    clinicalSummary: normalizeString(payload?.clinicalSummary, 500),
    diagnosisSupport: normalizeString(payload?.diagnosisSupport, 200),
    prescriptionText,
    suggestionItems,
    carePlan,
    followUpAdvice: normalizeString(payload?.followUpAdvice, 220),
    guardrails: Array.from(new Set(guardrails)).slice(0, 8),
    redFlags,
    confidence: ["low", "medium", "high"].includes(String(payload?.confidence || "").toLowerCase())
      ? String(payload.confidence).toLowerCase()
      : "low"
  };
};

const ensureSuggestionAccess = async (organizationId, actor, doctorId = null) => {
  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  if (!actorDoctor) {
    return doctorId || null;
  }

  if (doctorId && doctorId !== actorDoctor.id) {
    throw new ApiError(403, "You can only review AI suggestions for your own consultations");
  }

  return actorDoctor.id;
};

const listSuggestions = async (organizationId, query = {}, actor = null, branchContext = null) => {
  const scopedDoctorId = await ensureSuggestionAccess(organizationId, actor, query.doctorId || null);
  const effectiveQuery = {
    ...query,
    branchId: query.branchId || resolveBranchScopeId(branchContext),
    doctorId: actor?.role === "doctor" ? scopedDoctorId : query.doctorId || null,
    limit: Math.min(Number(query.limit || 5), 20)
  };

  return {
    items: await aiPrescriptionModel.listSuggestions(organizationId, effectiveQuery)
  };
};

const resolveGenerationReferences = async (organizationId, payload, actor, branchContext) => {
  const scopeBranchId = resolveBranchScopeId(branchContext);
  const allowedDoctorId = await ensureSuggestionAccess(organizationId, actor, payload.doctorId || null);
  const references = {
    appointment: null,
    medicalRecord: null
  };

  if (payload.appointmentId) {
    references.appointment = await appointmentsModel.getAppointmentById(
      organizationId,
      payload.appointmentId,
      scopeBranchId
    );
    if (!references.appointment) {
      throw new ApiError(404, "Appointment not found for AI prescription generation");
    }
  }

  if (payload.medicalRecordId) {
    references.medicalRecord = await medicalRecordsModel.getMedicalRecordById(
      organizationId,
      payload.medicalRecordId,
      scopeBranchId
    );
    if (!references.medicalRecord) {
      throw new ApiError(404, "Medical record not found for AI prescription generation");
    }
  }

  const patientId =
    payload.patientId ||
    references.medicalRecord?.patient_id ||
    references.appointment?.patient_id ||
    null;
  const doctorId =
    allowedDoctorId ||
    payload.doctorId ||
    references.medicalRecord?.doctor_id ||
    references.appointment?.doctor_id ||
    null;
  const branchId =
    references.medicalRecord?.branch_id ||
    references.appointment?.branch_id ||
    payload.branchId ||
    scopeBranchId ||
    null;

  if (!patientId) {
    throw new ApiError(400, "patientId is required to generate an AI prescription suggestion");
  }

  if (!doctorId) {
    throw new ApiError(400, "doctorId is required to generate an AI prescription suggestion");
  }

  if (!branchId) {
    throw new ApiError(400, "A branch must be selected before generating an AI prescription suggestion");
  }

  return {
    ...references,
    patientId,
    doctorId,
    branchId
  };
};

const generateSuggestion = async (organizationId, payload, actor = null, requestMeta = null, branchContext = null) => {
  const symptoms = normalizeMultiline(payload.symptoms || "", 1000);
  const diagnosis = normalizeMultiline(payload.diagnosis || "", 800);
  const notes = normalizeMultiline(payload.notes || "", 1000);

  if (!symptoms && !diagnosis) {
    throw new ApiError(400, "Symptoms or diagnosis is required to generate an AI prescription suggestion");
  }

  const references = await resolveGenerationReferences(organizationId, payload, actor, branchContext);
  const [patient, doctor, patientProfile] = await Promise.all([
    patientsModel.getPatientById(organizationId, references.patientId),
    doctorsModel.getDoctorById(organizationId, references.doctorId),
    patientsService.getPatientProfile(organizationId, references.patientId)
  ]);

  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  if (!doctor) {
    throw new ApiError(404, "Doctor not found");
  }

  const rawReply = await askNvidia({
    systemPrompt:
      "You are MedSyra AI Prescription Support. Provide only conservative outpatient draft suggestions for clinician review. Never provide controlled substances, chemotherapy, anticoagulants, insulin changes, or anything requiring specialist supervision. If diagnosis is missing, keep the draft symptomatic and low-confidence. Always include guardrails and red flags. Return strict JSON with keys: clinicalSummary, diagnosisSupport, prescriptionText, suggestionItems, carePlan, followUpAdvice, guardrails, redFlags, confidence. suggestionItems must be an array of objects with keys name, dosage, frequency, duration, instructions, reason.",
    userPrompt: buildPrompt({
      patient,
      doctor,
      profile: patientProfile,
      symptoms,
      diagnosis,
      notes
    })
  });

  const parsed = parseJsonObject(rawReply);
  if (!parsed) {
    throw new ApiError(502, "AI prescription response could not be parsed");
  }

  const sanitized = sanitizeSuggestionPayload(parsed, patient);
  const created = await aiPrescriptionModel.createSuggestion(organizationId, {
    branchId: references.branchId,
    patientId: references.patientId,
    doctorId: references.doctorId,
    appointmentId: references.appointment?.id || payload.appointmentId || null,
    medicalRecordId: references.medicalRecord?.id || payload.medicalRecordId || null,
    generatedByUserId: actor?.sub || null,
    status: "generated",
    inputSymptoms: symptoms || null,
    inputDiagnosis: diagnosis || null,
    inputNotes: notes || null,
    clinicalSummary: sanitized.clinicalSummary,
    prescriptionText: sanitized.prescriptionText || null,
    suggestionItems: sanitized.suggestionItems,
    carePlan: sanitized.carePlan,
    guardrails: sanitized.guardrails,
    redFlags: sanitized.redFlags,
    confidence: sanitized.confidence,
    disclaimer: DISCLAIMER,
    suggestionPayload: {
      ...sanitized,
      diagnosisSupport: sanitized.diagnosisSupport,
      followUpAdvice: sanitized.followUpAdvice
    },
    patientSnapshot: {
      patient: {
        id: patient.id,
        patient_code: patient.patient_code,
        full_name: patient.full_name,
        age: patient.age,
        gender: patient.gender,
        blood_type: patient.blood_type,
        last_visit_at: patient.last_visit_at
      },
      smartSummary: patientProfile.smartSummary || [],
      recentMedicalRecords: (patientProfile.medicalRecords || []).slice(0, 4).map((record) => ({
        id: record.id,
        record_date: record.record_date,
        diagnosis: record.diagnosis,
        prescription: record.prescription
      }))
    },
    modelName: env.nvidiaModel
  });

  await logAuditEventSafe({
    organizationId,
    branchId: created.branch_id || references.branchId,
    actor,
    requestMeta,
    module: "ai_prescriptions",
    action: "ai_prescription_generated",
    summary: `AI prescription draft generated for ${patient.full_name}`,
    entityType: "ai_prescription_suggestion",
    entityId: created.id,
    entityLabel: patient.patient_code || patient.full_name,
    metadata: {
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentId: created.appointment_id || null,
      medicalRecordId: created.medical_record_id || null,
      confidence: created.confidence
    },
    afterState: created
  });

  return created;
};

const reviewSuggestion = async (organizationId, id, payload, actor = null, requestMeta = null, branchContext = null) => {
  const current = await aiPrescriptionModel.getSuggestionById(
    organizationId,
    id,
    resolveBranchScopeId(branchContext)
  );

  if (!current) {
    throw new ApiError(404, "AI prescription suggestion not found");
  }

  const allowedDoctorId = await ensureSuggestionAccess(organizationId, actor, current.doctor_id || null);
  if (actor?.role === "doctor" && current.doctor_id && current.doctor_id !== allowedDoctorId) {
    throw new ApiError(403, "You can only review your own AI prescription drafts");
  }

  const nextStatus = payload.status;
  if (!["accepted", "rejected"].includes(nextStatus)) {
    throw new ApiError(400, "Invalid review status");
  }

  const reviewed = await aiPrescriptionModel.reviewSuggestion(organizationId, id, {
    branchId: current.branch_id || resolveBranchScopeId(branchContext),
    status: nextStatus,
    reviewNote: normalizeString(payload.reviewNote, 500) || null,
    reviewedByUserId: actor?.sub || null,
    reviewedAt: new Date().toISOString(),
    appointmentId: payload.appointmentId || current.appointment_id || null,
    medicalRecordId: payload.medicalRecordId || current.medical_record_id || null
  });

  if (!reviewed) {
    throw new ApiError(404, "AI prescription suggestion not found");
  }

  await logAuditEventSafe({
    organizationId,
    branchId: reviewed.branch_id || current.branch_id || resolveBranchScopeId(branchContext),
    actor,
    requestMeta,
    module: "ai_prescriptions",
    action: "ai_prescription_reviewed",
    summary: `AI prescription draft ${nextStatus} for ${reviewed.patient_name}`,
    entityType: "ai_prescription_suggestion",
    entityId: reviewed.id,
    entityLabel: reviewed.patient_name,
    metadata: {
      status: reviewed.status,
      patientId: reviewed.patient_id,
      doctorId: reviewed.doctor_id || null,
      reviewNote: reviewed.review_note || null
    },
    beforeState: current,
    afterState: reviewed
  });

  return reviewed;
};

module.exports = {
  generateSuggestion,
  listSuggestions,
  reviewSuggestion
};
