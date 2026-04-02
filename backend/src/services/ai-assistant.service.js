const env = require("../config/env");
const dashboardService = require("./dashboard.service");
const patientsService = require("./patients.service");
const aiToolsModel = require("../models/ai-tools.model");
const authModel = require("../models/auth.model");

const DEFAULT_MODEL = "openai/gpt-oss-120b";

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const buildClinicSnapshot = (summary, clinicName = null) => [
  `Clinic name: ${clinicName || "-"}`,
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

const buildPrompt = ({ message, clinicSummary, patientProfile, clinicName }) => {
  const sections = [
    "Clinic context:",
    ...buildClinicSnapshot(clinicSummary, clinicName),
    "",
    ...buildRecentActivitySnapshot(clinicSummary.recentActivity || [])
  ];

  if (patientProfile) {
    sections.push("", ...buildPatientSnapshot(patientProfile));
  }

  sections.push("", `Staff question: ${message}`);
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

const formatToolResultReply = (plan, result, patientProfile) => {
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

const executeToolPlan = async (organizationId, plan, patientProfile) => {
  const patientId = patientProfile?.patient?.id || null;

  switch (plan.tool) {
    case "clinic_name":
      return { clinicName: null };
    case "revenue":
      return aiToolsModel.getRevenueMetric(organizationId, { range: plan.range });
    case "appointments_count":
      return aiToolsModel.getAppointmentsMetric(organizationId, {
        range: plan.range,
        status: plan.status || null,
        patientId
      });
    case "followups_count":
      return aiToolsModel.getFollowUpsMetric(organizationId, {
        range: plan.range,
        patientId
      });
    case "most_common_issue":
      return aiToolsModel.getMostCommonIssueMetric(organizationId, {
        range: plan.range,
        patientId
      });
    case "outstanding_invoices":
      return aiToolsModel.getOutstandingInvoicesMetric(organizationId, {
        patientId
      });
    case "patient_summary":
      return patientProfile;
    default:
      return null;
  }
};

const getFallbackReply = ({ message, clinicSummary, patientProfile, clinicName = null }) => {
  const normalized = message.toLowerCase();

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

const getSuggestions = (patientProfile) =>
  patientProfile
    ? [
        "Summarize this patient in 3 lines",
        "What follow-up action is needed for this patient?",
        "What was last prescribed to this patient?"
      ]
    : [
        "What is my total income this month?",
        "How many appointments are left today?",
        "How many unpaid invoices do I have?"
      ];

const shouldUseModelFormatting = (tool) => !["clinic_name", "revenue", "outstanding_invoices"].includes(tool || "");

const askAssistant = async (organizationId, payload, currentUser = null) => {
  const clinicSummary = await dashboardService.getSummary(organizationId);
  const clinicName = await resolveClinicName(currentUser);
  const patientProfile = payload.patientId
    ? await patientsService.getPatientProfile(organizationId, payload.patientId)
    : null;

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
        : await executeToolPlan(organizationId, plan, patientProfile);
    tool = plan.tool;
    reply = formatToolResultReply(plan, toolResult, patientProfile);

    if (env.nvidiaApiKey && toolResult && shouldUseModelFormatting(plan.tool)) {
      try {
        reply = await askNvidia({
          systemPrompt:
            "You are MedSyra Clinic Assistant. A database tool result has already been executed. Answer only from that tool result. Keep it short, factual, and operational.",
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
          "You are MedSyra Clinic Assistant for a healthcare operations dashboard. Answer only from the provided clinic context. Keep answers short, factual, and operational. If context is missing, say so clearly. Do not invent patients, diagnoses, revenue, or schedules.",
        userPrompt: buildPrompt({ message: payload.message, clinicSummary, patientProfile, clinicName }),
        temperature: 0.3
      });
      mode = "nvidia";
    } catch {
      reply = getFallbackReply({
        message: payload.message,
        clinicSummary,
        patientProfile,
        clinicName
      });
    }
  } else {
    reply = getFallbackReply({
      message: payload.message,
      clinicSummary,
      patientProfile,
      clinicName
    });
  }

  return {
    reply,
    mode,
    tool,
    suggestions: getSuggestions(patientProfile),
    patient:
      patientProfile?.patient
        ? {
            id: patientProfile.patient.id,
            fullName: patientProfile.patient.full_name
          }
        : null,
    generatedAt: new Date().toISOString()
  };
};

module.exports = {
  askAssistant
};
