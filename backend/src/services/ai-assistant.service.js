const env = require("../config/env");
const dashboardService = require("./dashboard.service");
const patientsService = require("./patients.service");
const commercialService = require("./commercial.service");
const aiToolsModel = require("../models/ai-tools.model");
const authModel = require("../models/auth.model");

const DEFAULT_MODEL = "openai/gpt-oss-120b";
const WORKFLOW_SUGGESTIONS = { 
  staff: {
    operations: [
      "What needs attention in this branch today?",
      "How many appointments are left today?",
      "What is this week's revenue?"
    ],
    patient_summary: [
      "Summarize this patient in 3 lines",
      "What follow-up action is needed for this patient?",
      "What was last prescribed to this patient?"
    ],
    follow_up: [
      "How many follow-ups are due today?",
      "Which patients need recall attention next?",
      "What follow-up action is needed for this patient?"
    ],
    billing: [
      "How many unpaid invoices do I have?",
      "What is my total income this month?",
      "Which billing metric needs attention?"
    ]
  },
  patient: {
    appointment_help: [
      "Help me understand my next appointment",
      "What should I bring for my visit?",
      "How do I reschedule or contact the clinic?"
    ],
    follow_up_help: [
      "What follow-up is due for this patient?",
      "What should the patient do next?",
      "When should the patient contact the clinic urgently?"
    ],
    billing_help: [
      "Explain the pending bill in simple language",
      "How can the patient pay the invoice?",
      "What should the patient ask the billing desk?"
    ],
    report_help: [
      "Explain the latest report in simple non-clinical language",
      "What should the patient ask the doctor about this report?",
      "What follow-up visit should the patient plan?"
    ]
  }
};
const DEFAULT_WORKFLOW = {
  staff: "operations",
  patient: "appointment_help"
};

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const buildClinicSnapshot = (summary, clinicName = null, branchLabel = null) => [
  `Clinic name: ${clinicName || "-"}`,
  `Branch scope: ${branchLabel || "All branches"}`,
  `Today's appointments: ${summary.stats.todayAppointments}`,
  `Today's revenue: ${formatCurrency(summary.stats.todayRevenue)}`,
  `Pending payments: ${summary.stats.pendingPayments}`,
  `No-shows today: ${summary.stats.noShows}`,
  `Patients who did not return in 30 days: ${summary.insights.patientsDidNotReturn}`,
  `Most common issue: ${summary.insights.mostCommonIssue.label} (${summary.insights.mostCommonIssue.count})`,
  `This week's revenue: ${formatCurrency(summary.insights.weeklyRevenue)}`,
  `This month's revenue: ${formatCurrency(summary.insights.monthlyRevenue)}`,
  `Follow-ups due today: ${summary.insights.followUpsDueToday}`
];

const buildPatientSnapshot = (profile) => {
  const patient = profile.patient;
  const smartSummary = Array.isArray(profile.smartSummary) ? profile.smartSummary : [];
  const summary = profile.summary || {};

  const lines = [
    `Patient name: ${patient.full_name}`,
    `Phone: ${patient.phone || "-"}`,
    `Age: ${patient.age ?? "-"}`,
    `Gender: ${patient.gender || "-"}`,
    `Status: ${patient.status || "-"}`,
    `Last visit date: ${summary.lastVisitDate || patient.last_visit_at || "-"}`,
    `Total visits: ${summary.totalVisits || 0}`,
    `Pending amount: ${formatCurrency(summary.pendingAmount || 0)}`
  ];

  if (smartSummary.length > 0) {
    lines.push("Patient smart summary:", ...smartSummary.map((item) => `- ${item.label}: ${item.value}`));
  }

  return lines;
};

const buildRecentActivitySnapshot = (activities) => {
  if (!Array.isArray(activities) || activities.length === 0) {
    return ["Recent activity: none"];
  }

  return [
    "Recent activity:",
    ...activities.slice(0, 5).map((item) => `- ${item.title}${item.entity_name ? ` (${item.entity_name})` : ""}`)
  ];
};

const buildPrompt = ({ message, clinicSummary, patientProfile, clinicName, branchLabel = null }) => {
  const sections = [
    "Clinic context:",
    ...buildClinicSnapshot(clinicSummary, clinicName, branchLabel),
    "",
    ...buildRecentActivitySnapshot(clinicSummary.recentActivity || [])
  ];

  if (patientProfile) {
    sections.push("", ...buildPatientSnapshot(patientProfile));
  }

  sections.push("", `Staff question: ${message}`);
  return sections.join("\n");
};

const buildConversationHistory = (history = []) => {
  if (!Array.isArray(history) || history.length === 0) {
    return ["Conversation history: none"];
  }

  const compactHistory = history
    .filter((entry) => entry && typeof entry.content === "string" && typeof entry.role === "string")
    .slice(-8);

  if (compactHistory.length === 0) {
    return ["Conversation history: none"];
  }

  return [
    "Conversation history:",
    ...compactHistory.map((entry) => `- ${entry.role}: ${entry.content.replace(/\s+/g, " ").trim()}`)
  ];
};

const buildChatPrompt = ({
  message,
  clinicSummary,
  patientProfile,
  clinicName,
  branchLabel,
  persona,
  workflow,
  history
}) => {
  const sections = [
    "Clinic context:",
    ...buildClinicSnapshot(clinicSummary, clinicName, branchLabel),
    "",
    ...buildRecentActivitySnapshot(clinicSummary.recentActivity || []),
    ""
  ];

  if (patientProfile) {
    sections.push(...buildPatientSnapshot(patientProfile), "");
  }

  sections.push(...buildConversationHistory(history), "");

  if (persona === "patient") {
    sections.push(
      `Workflow: ${workflow}`,
      "Patient support guidance rules:",
      "- Explain in simple non-clinical language.",
      "- Never diagnose, prescribe, or change medicines.",
      "- If symptoms sound risky or urgent, tell the patient to contact the clinic or doctor immediately.",
      "- If patient-specific context is missing, say what clinic staff should ask for next.",
      "",
      `Patient question: ${message}`
    );
  } else {
    sections.push(
      `Workflow: ${workflow}`,
      "Staff support guidance rules:",
      "- Keep answers short, factual, and operational.",
      "- Use the patient context when selected.",
      "- If context is missing, say what is missing instead of guessing.",
      "",
      `Staff question: ${message}`
    );
  }

  return sections.join("\n");
};

const buildToolAnswerPrompt = ({ message, toolName, toolResult, patientProfile }) => {
  const sections = [
    "You have one approved database tool result for a clinic dashboard question.",
    `Tool: ${toolName}`,
    `Tool result: ${JSON.stringify(toolResult)}`,
    `Original question: ${message}`
  ];

  if (patientProfile?.patient) {
    sections.push(`Patient context: ${patientProfile.patient.full_name}`);
  }

  return sections.join("\n");
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

const askNvidia = async ({ systemPrompt, userPrompt, temperature = 0.3 }) => {
  const response = await fetch(`${env.nvidiaBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.nvidiaApiKey}`
    },
    body: JSON.stringify({
      model: env.nvidiaModel || DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature,
      top_p: 1,
      max_tokens: 1200,
      stream: false
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage =
      payload?.error?.message ||
      payload?.message ||
      `NVIDIA request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  const reply = payload?.choices?.[0]?.message?.content?.trim() || "";
  if (!reply) {
    throw new Error("NVIDIA returned an empty assistant response");
  }

  return reply;
};

const RANGE_PATTERNS = [
  { range: "today", patterns: ["today", "todays", "for today"] },
  { range: "this_week", patterns: ["this week", "weekly", "current week"] },
  { range: "this_month", patterns: ["this month", "monthly", "current month"] },
  { range: "last_30_days", patterns: ["last 30 days", "past 30 days", "30 days"] },
  { range: "last_90_days", patterns: ["last 90 days", "past 90 days", "90 days"] },
  { range: "last_12_months", patterns: ["last 12 months", "past year", "last year", "12 months"] }
];

const getRangeFromMessage = (message, fallback = "this_month") => {
  const normalized = message.toLowerCase();
  const match = RANGE_PATTERNS.find((entry) => entry.patterns.some((pattern) => normalized.includes(pattern)));
  return match?.range || fallback;
};

const inferIntentRuleBased = (message, hasPatientContext) => {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("clinic name") ||
    normalized.includes("hospital name") ||
    normalized.includes("organization name") ||
    normalized.includes("my clinic")
  ) {
    return { tool: "clinic_name" };
  }

  if (
    hasPatientContext &&
    (normalized.includes("summarize this patient") ||
      normalized.includes("this patient") ||
      normalized.includes("last prescribed") ||
      normalized.includes("prescribed") ||
      normalized.includes("follow-up action") ||
      normalized.includes("follow up action") ||
      normalized.includes("patient summary"))
  ) {
    return { tool: "patient_summary", range: "this_month" };
  }

  if (normalized.includes("no-show") || normalized.includes("no show") || normalized.includes("missed appointment")) {
    return { tool: "appointments_count", status: "no-show", range: getRangeFromMessage(message, "today") };
  }

  if (
    normalized.includes("income") ||
    normalized.includes("revenue") ||
    normalized.includes("earned") ||
    normalized.includes("collection")
  ) {
    return { tool: "revenue", range: getRangeFromMessage(message, "this_month") };
  }

  if (normalized.includes("follow-up") || normalized.includes("follow up")) {
    return { tool: "followups_count", range: getRangeFromMessage(message, "today") };
  }

  if (
    normalized.includes("common issue") ||
    normalized.includes("most common issue") ||
    normalized.includes("top issue") ||
    normalized.includes("most common diagnosis") ||
    normalized.includes("frequent issue")
  ) {
    return { tool: "most_common_issue", range: getRangeFromMessage(message, "last_30_days") };
  }

  if (
    normalized.includes("outstanding invoice") ||
    normalized.includes("pending invoice") ||
    normalized.includes("unpaid invoice") ||
    normalized.includes("pending payment") ||
    normalized.includes("dues")
  ) {
    return { tool: "outstanding_invoices", range: "this_month" };
  }

  if (
    normalized.includes("appointment") ||
    normalized.includes("appointments") ||
    normalized.includes("visit") ||
    normalized.includes("schedule") ||
    normalized.includes("booked")
  ) {
    return { tool: "appointments_count", range: getRangeFromMessage(message, "today") };
  }

  return null;
};

const normalizePersona = (value) => (value === "patient" ? "patient" : "staff");

const normalizeWorkflow = (persona, value, hasPatientContext) => {
  const workflowSets = WORKFLOW_SUGGESTIONS[persona] || WORKFLOW_SUGGESTIONS.staff;
  if (value && workflowSets[value]) {
    return value;
  }

  if (persona === "staff" && hasPatientContext) {
    return "patient_summary";
  }

  return DEFAULT_WORKFLOW[persona];
};

const inferIntentWithNvidia = async (message, hasPatientContext) => {
  const plannerReply = await askNvidia({
    systemPrompt:
      "You route clinic dashboard questions to approved tools. Return only compact JSON with keys tool, range, and optional status. Valid tools: revenue, appointments_count, followups_count, most_common_issue, outstanding_invoices, patient_summary, none. Valid ranges: today, this_week, this_month, last_30_days, last_90_days, last_12_months. Use patient_summary only when the question clearly needs selected patient context.",
    userPrompt: `Question: ${message}\nSelected patient context: ${hasPatientContext ? "yes" : "no"}`,
    temperature: 0
  });

  const parsed = parseJsonObject(plannerReply);
  if (!parsed || !parsed.tool || parsed.tool === "none") {
    return null;
  }

  return {
    tool: parsed.tool,
    range: parsed.range || "this_month",
    status: parsed.status || null
  };
};

const formatPatientSummaryReply = (profile) => {
  const smartSummary = profile.smartSummary || [];
  const patient = profile.patient;

  if (smartSummary.length > 0) {
    return [`Patient snapshot for ${patient.full_name}:`, ...smartSummary.map((item) => `${item.label}: ${item.value}`)].join("\n");
  }

  return [
    `Patient snapshot for ${patient.full_name}:`,
    `Last visit: ${profile.summary?.lastVisitDate || patient.last_visit_at || "-"}`,
    `Total visits: ${profile.summary?.totalVisits || 0}`,
    `Pending amount: ${formatCurrency(profile.summary?.pendingAmount || 0)}`
  ].join("\n");
};

const formatToolResultReply = (plan, result, patientProfile, persona = "staff") => {
  if (persona === "patient") {
    switch (plan.tool) {
      case "clinic_name":
        return result?.clinicName ? `You are connected to ${result.clinicName}.` : "Clinic name is not available right now.";
      case "appointments_count":
        return `I can see ${result.total} appointment${result.total === 1 ? "" : "s"} in this context. Please confirm the exact visit timing with the clinic if needed.`;
      case "followups_count":
        return result.total > 0
          ? `There ${result.total === 1 ? "is" : "are"} ${result.total} follow-up item${result.total === 1 ? "" : "s"} in this context. Please contact the clinic to confirm the next step.`
          : "I do not see a due follow-up in the current context.";
      case "outstanding_invoices":
        return `There ${result.total === 1 ? "is" : "are"} ${result.total} pending invoice${result.total === 1 ? "" : "s"} with ${formatCurrency(result.balanceAmount)} still due. The billing desk can confirm payment options.`;
      case "patient_summary":
        return patientProfile
          ? `Patient context: ${patientProfile.patient.full_name}. Last visit: ${patientProfile.summary?.lastVisitDate || patientProfile.patient.last_visit_at || "-"}. For medical interpretation or medicine changes, please speak with the doctor directly.`
          : "Select a patient first for patient-specific help.";
      default:
        break;
    }
  }

  switch (plan.tool) {
    case "clinic_name":
      return result?.clinicName ? `Your clinic name is ${result.clinicName}.` : "Your clinic name is not available right now.";
    case "revenue":
      return `Your total income for ${plan.range.replace(/_/g, " ")} is ${formatCurrency(result.revenue)}.`;
    case "appointments_count":
      if (plan.status === "no-show") {
        return `There ${result.total === 1 ? "is" : "are"} ${result.total} no-show appointment${result.total === 1 ? "" : "s"} for ${plan.range.replace(/_/g, " ")}.`;
      }
      return `There ${result.total === 1 ? "is" : "are"} ${result.total} appointment${result.total === 1 ? "" : "s"} for ${plan.range.replace(/_/g, " ")}.`;
    case "followups_count":
      return result.nearestDueDate
        ? `There ${result.total === 1 ? "is" : "are"} ${result.total} follow-up${result.total === 1 ? "" : "s"} due in ${plan.range.replace(/_/g, " ")}. Nearest due date: ${result.nearestDueDate}.`
        : `There ${result.total === 1 ? "is" : "are"} ${result.total} follow-up${result.total === 1 ? "" : "s"} due in ${plan.range.replace(/_/g, " ")}.`;
    case "most_common_issue":
      return result.total > 0
        ? `The most common issue in ${plan.range.replace(/_/g, " ")} is ${result.label} with ${result.total} matching record${result.total === 1 ? "" : "s"}.`
        : `No diagnosis trend was found for ${plan.range.replace(/_/g, " ")}.`;
    case "outstanding_invoices":
      return `There ${result.total === 1 ? "is" : "are"} ${result.total} outstanding invoice${result.total === 1 ? "" : "s"} with a total pending amount of ${formatCurrency(result.balanceAmount)}.`;
    case "patient_summary":
      return patientProfile ? formatPatientSummaryReply(patientProfile) : "Select a patient first for a patient-specific summary.";
    default:
      return "";
  }
};

const executeToolPlan = async (organizationId, plan, patientProfile, branchId = null) => {
  const patientId = patientProfile?.patient?.id || null;

  switch (plan.tool) {
    case "clinic_name":
      return { clinicName: null };
    case "revenue":
      return aiToolsModel.getRevenueMetric(organizationId, { range: plan.range, branchId });
    case "appointments_count":
      return aiToolsModel.getAppointmentsMetric(organizationId, {
        range: plan.range,
        status: plan.status || null,
        patientId,
        branchId
      });
    case "followups_count":
      return aiToolsModel.getFollowUpsMetric(organizationId, {
        range: plan.range,
        patientId,
        branchId
      });
    case "most_common_issue":
      return aiToolsModel.getMostCommonIssueMetric(organizationId, {
        range: plan.range,
        patientId,
        branchId
      });
    case "outstanding_invoices":
      return aiToolsModel.getOutstandingInvoicesMetric(organizationId, {
        patientId,
        branchId
      });
    case "patient_summary":
      return patientProfile;
    default:
      return null;
  }
};

const getFallbackReply = ({ message, clinicSummary, patientProfile, clinicName = null, persona = "staff" }) => {
  const normalized = message.toLowerCase();

  if (persona === "patient") {
    if (!patientProfile) {
      return [
        clinicName ? `${clinicName} support is available to help.` : "Clinic support is available to help.",
        "Select the patient context or ask the front desk to confirm the appointment, follow-up, billing, or report details.",
        "For urgent symptoms or medicine concerns, contact the clinic or doctor directly."
      ].join(" ");
    }

    if (normalized.includes("bill") || normalized.includes("payment") || normalized.includes("invoice")) {
      return `The patient has a pending amount of ${formatCurrency(patientProfile.summary?.pendingAmount || 0)}. Please confirm payment options with the billing desk.`;
    }

    if (normalized.includes("follow-up") || normalized.includes("follow up")) {
      const followUpLine = (patientProfile.smartSummary || []).find((item) =>
        String(item.label || "").toLowerCase().includes("follow-up")
      );
      return followUpLine
        ? `${followUpLine.label}: ${followUpLine.value}. Contact the clinic if the patient needs a new date or has worsening symptoms.`
        : "No active follow-up is visible in the current record. Please confirm with the clinic if a return visit is needed.";
    }

    return [
      `Here is the current patient context for ${patientProfile.patient.full_name}.`,
      `Last visit: ${patientProfile.summary?.lastVisitDate || patientProfile.patient.last_visit_at || "-"}.`,
      "For medical interpretation or medicine changes, the patient should speak with the doctor directly."
    ].join(" ");
  }

  if (patientProfile && normalized.includes("patient")) {
    return formatPatientSummaryReply(patientProfile);
  }

  if (
    normalized.includes("clinic name") ||
    normalized.includes("hospital name") ||
    normalized.includes("organization name") ||
    normalized.includes("my clinic")
  ) {
    return clinicName ? `Your clinic name is ${clinicName}.` : "Your clinic name is not available right now.";
  }

  if (normalized.includes("month") || normalized.includes("monthly")) {
    return `This month's income is ${formatCurrency(clinicSummary.insights.monthlyRevenue)}.`;
  }

  if (normalized.includes("revenue") || normalized.includes("billing") || normalized.includes("payment") || normalized.includes("income")) {
    return [
      `Today's revenue is ${formatCurrency(clinicSummary.stats.todayRevenue)}.`,
      `This week's revenue is ${formatCurrency(clinicSummary.insights.weeklyRevenue)}.`,
      `This month's revenue is ${formatCurrency(clinicSummary.insights.monthlyRevenue)}.`,
      `Pending payments count is ${clinicSummary.stats.pendingPayments}.`
    ].join(" ");
  }

  if (normalized.includes("appointment") || normalized.includes("schedule") || normalized.includes("today")) {
    return [
      `There are ${clinicSummary.stats.todayAppointments} appointments today.`,
      `No-shows today: ${clinicSummary.stats.noShows}.`,
      `Pending payments: ${clinicSummary.stats.pendingPayments}.`
    ].join(" ");
  }

  if (normalized.includes("follow-up") || normalized.includes("follow up")) {
    return `Follow-ups due today: ${clinicSummary.insights.followUpsDueToday}.`;
  }

  if (normalized.includes("issue") || normalized.includes("problem") || normalized.includes("common")) {
    return `Most common issue is ${clinicSummary.insights.mostCommonIssue.label} with ${clinicSummary.insights.mostCommonIssue.count} matching records.`;
  }

  return [
    "I can help with clinic operations questions.",
    `Today: ${clinicSummary.stats.todayAppointments} appointments, ${formatCurrency(clinicSummary.stats.todayRevenue)} revenue.`,
    `This week: ${formatCurrency(clinicSummary.insights.weeklyRevenue)} revenue.`,
    `This month: ${formatCurrency(clinicSummary.insights.monthlyRevenue)} revenue.`,
    `Follow-ups due today: ${clinicSummary.insights.followUpsDueToday}.`,
    "Ask about revenue, appointments, follow-ups, unpaid invoices, common issues, or a selected patient."
  ].join(" ");
};

const resolveClinicName = async (currentUser) => {
  if (currentUser?.organization_name) {
    return currentUser.organization_name;
  }

  if (currentUser?.sub) {
    const user = await authModel.findUserById(currentUser.sub).catch(() => null);
    return user?.organization_name || null;
  }

  return null;
};

const getSuggestions = (persona, workflow, patientProfile) => {
  const workflowMap = WORKFLOW_SUGGESTIONS[persona] || WORKFLOW_SUGGESTIONS.staff;
  const suggestions = workflowMap[workflow] || workflowMap[DEFAULT_WORKFLOW[persona]];

  if (persona === "staff" && patientProfile?.patient && workflow !== "patient_summary") {
    return WORKFLOW_SUGGESTIONS.staff.patient_summary;
  }

  return suggestions || WORKFLOW_SUGGESTIONS.staff.operations;
};

const shouldUseModelFormatting = (tool) => !["clinic_name", "revenue", "outstanding_invoices"].includes(tool || "");

const askAssistant = async (organizationId, payload, currentUser = null, branchContext = null) => {
  await commercialService.ensureUsageAllowed(organizationId, {
    aiQueriesUsed: 1
  });

  const persona = normalizePersona(payload.persona);
  const branchId = branchContext?.readBranchId || null;
  const branchLabel = branchContext?.selectedBranchName || branchContext?.assignedBranchName || null;
  const clinicSummary = await dashboardService.getSummary(organizationId, branchId);
  const clinicName = await resolveClinicName(currentUser);
  const patientProfile = payload.patientId
    ? await patientsService.getPatientProfile(organizationId, payload.patientId)
    : null;
  const workflow = normalizeWorkflow(persona, payload.workflow, Boolean(patientProfile));
  const history = Array.isArray(payload.history) ? payload.history : [];

  let plan = inferIntentRuleBased(payload.message, Boolean(patientProfile));
  if (env.nvidiaApiKey) {
    try {
      const planned = await inferIntentWithNvidia(payload.message, Boolean(patientProfile));
      if (planned) {
        plan = planned;
      }
    } catch {
      // Keep the deterministic planner as fallback.
    }
  }

  let reply = "";
  let mode = "local";
  let tool = null;

  if (plan) {
    const toolResult =
      plan.tool === "clinic_name"
        ? { clinicName }
        : await executeToolPlan(organizationId, plan, patientProfile, branchId);
    tool = plan.tool;
    reply = formatToolResultReply(plan, toolResult, patientProfile, persona);

    if (env.nvidiaApiKey && toolResult && shouldUseModelFormatting(plan.tool)) {
      try {
        reply = await askNvidia({
          systemPrompt:
            persona === "patient"
              ? "You are MedSyra Patient Support. A database tool result has already been executed. Answer only from that result. Use simple language. Do not diagnose, prescribe, or change medicines."
              : "You are MedSyra Clinic Assistant. A database tool result has already been executed. Answer only from that tool result. Keep it short, factual, and operational.",
          userPrompt: buildToolAnswerPrompt({
            message: payload.message,
            toolName: plan.tool,
            toolResult,
            patientProfile
          }),
          temperature: 0.1
        });
        mode = "nvidia";
      } catch {
        mode = "local";
      }
    }
  } else if (env.nvidiaApiKey) {
    try {
      reply = await askNvidia({
        systemPrompt:
          persona === "patient"
            ? "You are MedSyra Patient Support for a healthcare clinic. Answer only from the provided clinic and patient context. Use simple language. Do not diagnose, prescribe, or change medicines. If the request needs a doctor or urgent care, say so clearly."
            : "You are MedSyra Clinic Assistant for a healthcare operations dashboard. Answer only from the provided clinic context. Keep answers short, factual, and operational. If context is missing, say so clearly. Do not invent patients, diagnoses, revenue, or schedules.",
        userPrompt: buildChatPrompt({
          message: payload.message,
          clinicSummary,
          patientProfile,
          clinicName,
          branchLabel,
          persona,
          workflow,
          history
        }),
        temperature: 0.3
      });
      mode = "nvidia";
    } catch {
      reply = getFallbackReply({
        message: payload.message,
        clinicSummary,
        patientProfile,
        clinicName,
        persona
      });
    }
  } else {
    reply = getFallbackReply({
      message: payload.message,
      clinicSummary,
      patientProfile,
      clinicName,
      persona
    });
  }

  const credits = await commercialService.recordUsage(organizationId, {
    actorUserId: currentUser?.sub || null,
    aiQueriesUsed: 1,
    sourceFeature: persona === "patient" || payload.workflow ? "ai_chatbot" : "ai_assistant",
    referenceId: payload.patientId || null,
    note: payload.workflow ? `AI chatbot query (${persona}:${workflow})` : "AI assistant query"
  });

  return {
    reply,
    mode,
    tool,
    persona,
    workflow,
    suggestions: getSuggestions(persona, workflow, patientProfile),
    patient:
      patientProfile?.patient
        ? {
            id: patientProfile.patient.id,
            fullName: patientProfile.patient.full_name
          }
        : null,
    credits: {
      currentBalance: credits.wallet.currentBalance,
      lowBalanceThreshold: credits.wallet.lowBalanceThreshold,
      isLowBalance: credits.wallet.isLowBalance,
      chargedCredits: credits.chargedCredits
    },
    branch: {
      id: branchId,
      name: branchLabel || null
    },
    generatedAt: new Date().toISOString()
  };
};

module.exports = {
  askAssistant
};
