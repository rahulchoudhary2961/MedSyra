"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, FileText, IndianRupee, Receipt, Stethoscope, TrendingUp, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { apiRequest } from "@/lib/api";
import { formatDateTime } from "@/lib/date-time";
import { canAccessReports } from "@/lib/roles";

type ReportsResponse = {
  success: boolean;
  data: {
    meta: {
      period: string;
      label: string;
    };
    stats: {
      totalPatients: number;
      totalMedicalRecords: number;
      revenue: number;
      growthRate: number;
      totalAppointments: number;
      completedAppointments: number;
      noShows: number;
      pendingInvoices: number;
      pendingAmount: number;
      averageInvoiceValue: number;
      averagePaymentValue: number;
      refundedAmount: number;
      completionRate: number;
      cancellationRate: number;
      collectionRate: number;
    };
    trendData: Array<{
      label: string;
      appointments: number;
      revenue: number;
      noShows: number;
      records: number;
    }>;
    appointmentStatus: Array<{
      name: string;
      value: number;
    }>;
    paymentMethods: Array<{
      method: string;
      total: number;
    }>;
    topDoctors: Array<{
      id: string;
      name: string;
      specialty: string;
      appointments: number;
      completed: number;
      noShows: number;
      uniquePatients: number;
      invoiceCount: number;
      avgInvoiceValue: number;
      completionRate: number;
      noShowRate: number;
      avgRevenuePerCompleted: number;
      revenue: number;
    }>;
    outstandingInvoices: Array<{
      id: string;
      invoiceNumber: string;
      patientName: string;
      doctorName: string;
      issueDate: string;
      balanceAmount: number;
      status: string;
    }>;
    departmentData: Array<{
      name: string;
      value: number;
    }>;
    recordTypes: Array<{
      type: string;
      count: number;
    }>;
    monthlyTrends: Array<{
      label: string;
      invoicedAmount: number;
      collectedAmount: number;
      appointments: number;
      newPatients: number;
    }>;
    diseasePatterns: {
      diagnosedRecords: number;
      uniqueDiagnoses: number;
      items: Array<{
        diagnosis: string;
        caseCount: number;
        patientCount: number;
        lastSeenAt: string;
        sharePercent: number;
      }>;
    };
    doctorHighlights: {
      highestRevenueDoctor: null | {
        id: string;
        name: string;
        specialty: string;
        appointments: number;
        completed: number;
        noShows: number;
        uniquePatients: number;
        invoiceCount: number;
        avgInvoiceValue: number;
        completionRate: number;
        noShowRate: number;
        avgRevenuePerCompleted: number;
        revenue: number;
      };
      busiestDoctor: null | {
        id: string;
        name: string;
        specialty: string;
        appointments: number;
        completed: number;
        noShows: number;
        uniquePatients: number;
        invoiceCount: number;
        avgInvoiceValue: number;
        completionRate: number;
        noShowRate: number;
        avgRevenuePerCompleted: number;
        revenue: number;
      };
      bestCompletionDoctor: null | {
        id: string;
        name: string;
        specialty: string;
        appointments: number;
        completed: number;
        noShows: number;
        uniquePatients: number;
        invoiceCount: number;
        avgInvoiceValue: number;
        completionRate: number;
        noShowRate: number;
        avgRevenuePerCompleted: number;
        revenue: number;
      };
    };
    revenueAnalysis: {
      invoicedAmount: number;
      collectedAmount: number;
      outstandingAmount: number;
      refundedAmount: number;
      averageInvoiceValue: number;
      averagePaymentValue: number;
      monthOverMonthGrowth: number;
    };
    revenueStreams: Array<{
      stream: string;
      total: number;
    }>;
    predictiveAnalytics: {
      revisitPrediction: {
        totalPatientsModeled: number;
        highLikelihoodCount: number;
        mediumLikelihoodCount: number;
        lowLikelihoodCount: number;
        patients: Array<{
          patientId: string;
          patientCode: string | null;
          patientName: string;
          phone: string | null;
          lastVisitAt: string | null;
          nextFollowUpDate: string | null;
          latestDiagnosis: string | null;
          daysSinceLastVisit: number | null;
          daysUntilFollowUp: number | null;
          completedVisitsLast180: number;
          totalVisitsLast365: number;
          noShowsLast180: number;
          repeatDiagnosisCount: number;
          revisitScore: number;
          likelihood: "high" | "medium" | "low";
          predictedWindow: string;
          reasons: string[];
        }>;
      };
      diseaseTrends: {
        currentWindowLabel: string;
        previousWindowLabel: string;
        risingCount: number;
        newSignals: number;
        stableCount: number;
        decliningCount: number;
        items: Array<{
          diagnosis: string;
          currentCases: number;
          previousCases: number;
          deltaPercent: number;
          trend: "rising" | "new" | "stable" | "declining";
          lastSeenAt: string | null;
        }>;
      };
      revenueForecasting: {
        currentMonthLabel: string;
        monthToDateCollected: number;
        projectedMonthEndCollected: number;
        trailingThreeMonthAverage: number;
        forecastRangeLow: number;
        forecastRangeHigh: number;
        projectedGrowthVsLastMonth: number;
        elapsedDays: number;
        remainingDays: number;
        confidence: "high" | "medium" | "low";
        series: Array<{
          label: string;
          actualCollected: number;
          projectedCollected: number | null;
        }>;
      };
    };
  };
};

type MeResponse = {
  success: boolean;
  data: {
    role: string;
  };
};

type CommercialOverviewResponse = {
  success: boolean;
  data: {
    pricing: {
      planTier: string;
      basePlanPrice: number;
      monthlyIncludedCredits: number;
      topupPrice: number;
      topupCreditAmount: number;
      aiCreditsPerQuery: number;
      messageCreditsPerUnit: number;
      defaultAiCostPerQuery: number;
      defaultMessageCostPerUnit: number;
    };
    wallet: {
      currentBalance: number;
      monthlyIncludedCredits: number;
      lowBalanceThreshold: number;
      lastResetAt: string | null;
      isLowBalance: boolean;
    };
    usage: {
      usageMonth: string;
      aiQueriesUsed: number;
      aiCostPerQuery: number;
      aiCostTotal: number;
      messagesUsed: number;
      messageCostPerUnit: number;
      messageCostTotal: number;
      creditsConsumed: number;
      includedCreditsGranted: number;
      topupCreditsPurchased: number;
      topupRevenue: number;
      infraCostShare: number;
      basePlanRevenue: number;
      totalRevenue: number;
      totalCost: number;
      profitAmount: number;
    };
    platformInfra: {
      usageMonth: string;
      totalInfraCost: number;
      activeClinics: number;
      infraCostPerClinic: number;
      notes: string;
    };
    transactions: Array<{
      id: string;
      transactionType: string;
      creditsDelta: number;
      rupeeAmount: number;
      sourceFeature: string | null;
      referenceId: string | null;
      note: string | null;
      actorName: string | null;
      createdAt: string;
    }>;
  };
};

type PricingForm = {
  planTier: string;
  basePlanPrice: string;
  monthlyIncludedCredits: string;
  lowBalanceThreshold: string;
  topupPrice: string;
  topupCreditAmount: string;
  aiCreditsPerQuery: string;
  messageCreditsPerUnit: string;
  defaultAiCostPerQuery: string;
  defaultMessageCostPerUnit: string;
};

type TopUpForm = {
  packs: string;
  credits: string;
  rupeeAmount: string;
  note: string;
};

type PlatformInfraForm = {
  totalInfraCost: string;
  activeClinics: string;
  notes: string;
};

const APPOINTMENT_STATUS_COLORS = ["#0f766e", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444"];
const PAYMENT_METHOD_COLORS = ["#2563eb", "#0f766e", "#f59e0b", "#ef4444", "#7c3aed", "#0891b2"];
const DEPARTMENT_COLORS = ["#14b8a6", "#2563eb", "#f59e0b", "#8b5cf6", "#ef4444", "#10b981"];
const REVENUE_STREAM_COLORS = ["#0f766e", "#22c55e", "#f59e0b", "#ef4444", "#2563eb", "#8b5cf6"];
const DISEASE_PATTERN_COLORS = ["#10b981", "#059669", "#14b8a6", "#0ea5e9", "#f59e0b", "#ef4444"];
const DISEASE_TREND_COLORS = ["#0f766e", "#14b8a6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444"];
const MONTHLY_BAR_COLORS = ["#0f766e", "#14b8a6", "#f59e0b", "#2563eb"];
const RECORD_TYPE_COLORS = ["#0f766e", "#14b8a6", "#22c55e", "#f59e0b", "#2563eb"];
const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" }
] as const;
const PLAN_OPTIONS = [
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "enterprise", label: "Enterprise" }
] as const;
const PLAN_PRICING_DEFAULTS: Record<string, Omit<PricingForm, "planTier" | "lowBalanceThreshold">> = {
  starter: {
    basePlanPrice: "799",
    monthlyIncludedCredits: "100",
    topupPrice: "199",
    topupCreditAmount: "200",
    aiCreditsPerQuery: "1",
    messageCreditsPerUnit: "1",
    defaultAiCostPerQuery: "1",
    defaultMessageCostPerUnit: "1"
  },
  growth: {
    basePlanPrice: "1499",
    monthlyIncludedCredits: "400",
    topupPrice: "199",
    topupCreditAmount: "200",
    aiCreditsPerQuery: "1",
    messageCreditsPerUnit: "1",
    defaultAiCostPerQuery: "1",
    defaultMessageCostPerUnit: "1"
  },
  enterprise: {
    basePlanPrice: "2999",
    monthlyIncludedCredits: "1000",
    topupPrice: "499",
    topupCreditAmount: "500",
    aiCreditsPerQuery: "1",
    messageCreditsPerUnit: "1",
    defaultAiCostPerQuery: "1",
    defaultMessageCostPerUnit: "1"
  }
};

const currency = (value: number) => `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const percentage = (value: number) => `${Number(value || 0).toFixed(1)}%`;
const sortByValueDesc = <T extends Record<string, unknown>, K extends keyof T>(items: T[], key: K) =>
  [...items].sort((left, right) => Number(right[key] ?? 0) - Number(left[key] ?? 0));
const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const escapePdfText = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const formatTimestamp = (value: string | null) => formatDateTime(value);
const toOptionalInteger = (value: string) => (value.trim() ? Number.parseInt(value, 10) : undefined);
const toOptionalNumber = (value: string) => (value.trim() ? Number(value) : undefined);

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const createSimplePdfBlob = (title: string, lines: string[]) => {
  const fontSize = 12;
  const lineHeight = 16;
  const startY = 800;
  const textCommands = [`BT /F1 ${fontSize} Tf 40 ${startY} Td (${escapePdfText(title)}) Tj ET`];

  lines.forEach((line, index) => {
    const y = startY - (index + 2) * lineHeight;
    textCommands.push(`BT /F1 ${fontSize} Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`);
  });

  const stream = textCommands.join("\n");
  const streamLength = stream.length;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${streamLength} >> stream\n${stream}\nendstream endobj`
  ];

  let offset = "%PDF-1.4\n".length;
  const xrefOffsets = ["0000000000 65535 f "];
  const bodyParts = objects.map((obj) => {
    xrefOffsets.push(`${String(offset).padStart(10, "0")} 00000 n `);
    offset += `${obj}\n`.length;
    return `${obj}\n`;
  });

  const xrefStart = offset;
  const xref = `xref\n0 ${xrefOffsets.length}\n${xrefOffsets.join("\n")}\n`;
  const trailer = `trailer << /Size ${xrefOffsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([`%PDF-1.4\n${bodyParts.join("")}${xref}${trailer}`], { type: "application/pdf" });
};

export default function ReportsPage() {
  const LIST_PREVIEW_LIMIT = 6;
  const [currentRole, setCurrentRole] = useState("");
  const [period, setPeriod] = useState<string>("90d");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportsResponse["data"] | null>(null);
  const [commercial, setCommercial] = useState<CommercialOverviewResponse["data"] | null>(null);
  const [pricingForm, setPricingForm] = useState<PricingForm>({
    planTier: "starter",
    basePlanPrice: "",
    monthlyIncludedCredits: "",
    lowBalanceThreshold: "",
    topupPrice: "",
    topupCreditAmount: "",
    aiCreditsPerQuery: "",
    messageCreditsPerUnit: "",
    defaultAiCostPerQuery: "",
    defaultMessageCostPerUnit: ""
  });
  const [topUpForm, setTopUpForm] = useState<TopUpForm>({
    packs: "1",
    credits: "",
    rupeeAmount: "",
    note: ""
  });
  const [platformInfraForm, setPlatformInfraForm] = useState<PlatformInfraForm>({
    totalInfraCost: "",
    activeClinics: "",
    notes: ""
  });
  const [commercialMessage, setCommercialMessage] = useState("");
  const [commercialError, setCommercialError] = useState("");
  const [savingPricing, setSavingPricing] = useState(false);
  const [addingTopUp, setAddingTopUp] = useState(false);
  const [savingPlatformInfra, setSavingPlatformInfra] = useState(false);
  const [showAllTopDoctors, setShowAllTopDoctors] = useState(false);
  const [showAllOutstandingInvoices, setShowAllOutstandingInvoices] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [showAllRevisitPatients, setShowAllRevisitPatients] = useState(false);

  const applyCommercialData = (data: CommercialOverviewResponse["data"]) => {
    setCommercial(data);
    setPricingForm({
      planTier: data.pricing.planTier,
      basePlanPrice: String(data.pricing.basePlanPrice),
      monthlyIncludedCredits: String(data.pricing.monthlyIncludedCredits),
      lowBalanceThreshold: String(data.wallet.lowBalanceThreshold),
      topupPrice: String(data.pricing.topupPrice),
      topupCreditAmount: String(data.pricing.topupCreditAmount),
      aiCreditsPerQuery: String(data.pricing.aiCreditsPerQuery),
      messageCreditsPerUnit: String(data.pricing.messageCreditsPerUnit),
      defaultAiCostPerQuery: String(data.pricing.defaultAiCostPerQuery),
      defaultMessageCostPerUnit: String(data.pricing.defaultMessageCostPerUnit)
    });
    setTopUpForm({
      packs: "1",
      credits: "",
      rupeeAmount: "",
      note: ""
    });
    setPlatformInfraForm({
      totalInfraCost: String(data.platformInfra.totalInfraCost),
      activeClinics: String(data.platformInfra.activeClinics),
      notes: data.platformInfra.notes
    });
  };

  const loadCommercialOverview = async () => {
    const response = await apiRequest<CommercialOverviewResponse>("/commercial/overview", { authenticated: true });
    applyCommercialData(response.data);
    return response.data;
  };

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      apiRequest<MeResponse>("/auth/me", { authenticated: true }),
      apiRequest<ReportsResponse>(`/dashboard/reports?period=${period}`, { authenticated: true }),
      apiRequest<CommercialOverviewResponse>("/commercial/overview", { authenticated: true })
    ]).then(([meResult, reportResult, commercialResult]) => {
      if (cancelled) {
        return;
      }

      if (meResult.status === "fulfilled") {
        setCurrentRole(meResult.value.data.role || "");
      } else {
        setCurrentRole("");
      }

      if (reportResult.status === "fulfilled" && commercialResult.status === "fulfilled") {
        setReport(reportResult.value.data);
        applyCommercialData(commercialResult.value.data);
      } else {
        const reason =
          reportResult.status === "rejected"
            ? reportResult.reason
            : commercialResult.status === "rejected"
              ? commercialResult.reason
              : new Error("Failed to load reports");
        setError(reason instanceof Error ? reason.message : "Failed to load reports");
      }

      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [period]);

  const handlePeriodChange = (nextPeriod: string) => {
    setIsLoading(true);
    setError("");
    setCommercialMessage("");
    setCommercialError("");
    setPeriod(nextPeriod);
  };

  const handleSavePricing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingPricing(true);
    setCommercialMessage("");
    setCommercialError("");

    try {
      const response = await apiRequest<CommercialOverviewResponse & { message?: string }>("/commercial/pricing", {
        method: "PATCH",
        authenticated: true,
        body: {
          planTier: pricingForm.planTier,
          basePlanPrice: Number(pricingForm.basePlanPrice),
          monthlyIncludedCredits: Number(pricingForm.monthlyIncludedCredits),
          lowBalanceThreshold: Number(pricingForm.lowBalanceThreshold),
          topupPrice: Number(pricingForm.topupPrice),
          topupCreditAmount: Number(pricingForm.topupCreditAmount),
          aiCreditsPerQuery: Number(pricingForm.aiCreditsPerQuery),
          messageCreditsPerUnit: Number(pricingForm.messageCreditsPerUnit),
          defaultAiCostPerQuery: Number(pricingForm.defaultAiCostPerQuery),
          defaultMessageCostPerUnit: Number(pricingForm.defaultMessageCostPerUnit)
        }
      });

      applyCommercialData(response.data);
      setCommercialMessage(response.message || "Commercial pricing updated.");
    } catch (err) {
      setCommercialError(err instanceof Error ? err.message : "Failed to save pricing.");
    } finally {
      setSavingPricing(false);
    }
  };

  const handleCreateTopUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddingTopUp(true);
    setCommercialMessage("");
    setCommercialError("");

    try {
      const response = await apiRequest<CommercialOverviewResponse & { message?: string }>("/commercial/top-ups", {
        method: "POST",
        authenticated: true,
        body: {
          packs: Number(topUpForm.packs),
          credits: toOptionalInteger(topUpForm.credits),
          rupeeAmount: toOptionalNumber(topUpForm.rupeeAmount),
          note: topUpForm.note.trim() || undefined
        }
      });

      applyCommercialData(response.data);
      setCommercialMessage(response.message || "Credits added successfully.");
    } catch (err) {
      setCommercialError(err instanceof Error ? err.message : "Failed to add credits.");
    } finally {
      setAddingTopUp(false);
    }
  };

  const handleSavePlatformInfra = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingPlatformInfra(true);
    setCommercialMessage("");
    setCommercialError("");

    try {
      const response = await apiRequest<{ success: boolean; message?: string }>("/commercial/platform-infra", {
        method: "PATCH",
        authenticated: true,
        body: {
          totalInfraCost: Number(platformInfraForm.totalInfraCost),
          activeClinics: toOptionalInteger(platformInfraForm.activeClinics),
          notes: platformInfraForm.notes.trim() || undefined
        }
      });

      await loadCommercialOverview();
      setCommercialMessage(response.message || "Platform infra updated.");
    } catch (err) {
      setCommercialError(err instanceof Error ? err.message : "Failed to update platform infra.");
    } finally {
      setSavingPlatformInfra(false);
    }
  };

  const exportCsv = () => {
    if (!report) {
      return;
    }

    const rows: Array<Array<string | number>> = [
      ["Report", report.meta.label],
      ["Generated At", new Date().toISOString()],
      [],
      ["Metric", "Value"],
      ["Total Patients", report.stats.totalPatients],
      ["Total Medical Records", report.stats.totalMedicalRecords],
      ["Revenue", report.stats.revenue],
      ["Total Appointments", report.stats.totalAppointments],
      ["Completed Appointments", report.stats.completedAppointments],
      ["No-shows", report.stats.noShows],
      ["Pending Invoices", report.stats.pendingInvoices],
      ["Pending Amount", report.stats.pendingAmount],
      ["Average Invoice Value", report.stats.averageInvoiceValue],
      ["Average Payment Value", report.stats.averagePaymentValue],
      ["Refunded Amount", report.stats.refundedAmount],
      ["Completion Rate", report.stats.completionRate],
      ["Cancellation Rate", report.stats.cancellationRate],
      ["Collection Rate", report.stats.collectionRate],
      ["Revenue MoM Growth", report.revenueAnalysis.monthOverMonthGrowth],
      [],
      ["Revenue Analysis"],
      ["Metric", "Value"],
      ["Invoiced Amount", report.revenueAnalysis.invoicedAmount],
      ["Collected Amount", report.revenueAnalysis.collectedAmount],
      ["Outstanding Amount", report.revenueAnalysis.outstandingAmount],
      ["Refunded Amount", report.revenueAnalysis.refundedAmount],
      ["Average Invoice Value", report.revenueAnalysis.averageInvoiceValue],
      ["Average Payment Value", report.revenueAnalysis.averagePaymentValue],
      [],
      ["Monthly Trends"],
      ["Month", "Invoiced", "Collected", "Appointments", "New Patients"],
      ...report.monthlyTrends.map((entry) => [
        entry.label,
        entry.invoicedAmount,
        entry.collectedAmount,
        entry.appointments,
        entry.newPatients
      ]),
      [],
      ["Revenue Streams"],
      ["Stream", "Total"],
      ...report.revenueStreams.map((entry) => [entry.stream, entry.total]),
      [],
      ["Disease Patterns"],
      ["Diagnosis", "Cases", "Patients", "Share %", "Last Seen"],
      ...report.diseasePatterns.items.map((item) => [
        item.diagnosis,
        item.caseCount,
        item.patientCount,
        item.sharePercent,
        item.lastSeenAt
      ]),
      [],
      ["Predictive Revisit Signals"],
      ["Patient", "Patient Code", "Score", "Likelihood", "Window", "Last Visit", "Follow-up", "Diagnosis"],
      ...report.predictiveAnalytics.revisitPrediction.patients.map((patient) => [
        patient.patientName,
        patient.patientCode || "-",
        patient.revisitScore,
        patient.likelihood,
        patient.predictedWindow,
        patient.lastVisitAt || "-",
        patient.nextFollowUpDate || "-",
        patient.latestDiagnosis || "-"
      ]),
      [],
      ["Disease Trend Signals"],
      ["Diagnosis", "Current Cases", "Previous Cases", "Delta %", "Trend", "Last Seen"],
      ...report.predictiveAnalytics.diseaseTrends.items.map((item) => [
        item.diagnosis,
        item.currentCases,
        item.previousCases,
        item.deltaPercent,
        item.trend,
        item.lastSeenAt || "-"
      ]),
      [],
      ["Revenue Forecast"],
      ["Metric", "Value"],
      ["Month To Date Collected", report.predictiveAnalytics.revenueForecasting.monthToDateCollected],
      ["Projected Month End Collected", report.predictiveAnalytics.revenueForecasting.projectedMonthEndCollected],
      ["Forecast Range Low", report.predictiveAnalytics.revenueForecasting.forecastRangeLow],
      ["Forecast Range High", report.predictiveAnalytics.revenueForecasting.forecastRangeHigh],
      ["Trailing 3 Month Average", report.predictiveAnalytics.revenueForecasting.trailingThreeMonthAverage],
      ["Projected Growth Vs Last Month", report.predictiveAnalytics.revenueForecasting.projectedGrowthVsLastMonth],
      ["Forecast Confidence", report.predictiveAnalytics.revenueForecasting.confidence],
      [],
      ["Top Doctors"],
      ["Name", "Specialty", "Appointments", "Completed", "Completion %", "No-show %", "Revenue"],
      ...report.topDoctors.map((doctor) => [
        doctor.name,
        doctor.specialty,
        doctor.appointments,
        doctor.completed,
        doctor.completionRate,
        doctor.noShowRate,
        doctor.revenue
      ]),
      [],
      ["Outstanding Invoices"],
      ["Invoice", "Patient", "Doctor", "Issue Date", "Balance", "Status"],
      ...report.outstandingInvoices.map((invoice) => [
        invoice.invoiceNumber,
        invoice.patientName,
        invoice.doctorName,
        invoice.issueDate,
        invoice.balanceAmount,
        invoice.status
      ])
    ];

    if (commercial) {
      rows.push(
        [],
        ["Commercial Engine"],
        ["Metric", "Value"],
        ["Usage Month", commercial.usage.usageMonth],
        ["Plan Tier", commercial.pricing.planTier],
        ["Credit Balance", commercial.wallet.currentBalance],
        ["Monthly Included Credits", commercial.wallet.monthlyIncludedCredits],
        ["Credits Consumed", commercial.usage.creditsConsumed],
        ["Commercial Revenue", commercial.usage.totalRevenue],
        ["Commercial Cost", commercial.usage.totalCost],
        ["Monthly Profit", commercial.usage.profitAmount],
        ["Infra Cost Per Clinic", commercial.platformInfra.infraCostPerClinic]
      );
    }

    const csv = rows.map((row) => row.map((value) => escapeCsv(value ?? "")).join(",")).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `clinic-report-${report.meta.period}.csv`);
  };

  const exportPdf = () => {
    if (!report) {
      return;
    }

    const lines = [
      `Report Period: ${report.meta.label}`,
      `Generated: ${formatDateTime(new Date().toISOString())}`,
      "",
      `Appointments: ${report.stats.totalAppointments}`,
      `Completed: ${report.stats.completedAppointments}`,
      `Completion Rate: ${report.stats.completionRate}%`,
      `No-shows: ${report.stats.noShows}`,
      `Revenue: ${currency(report.stats.revenue)}`,
      `Pending Amount: ${currency(report.stats.pendingAmount)}`,
      `Average Invoice Value: ${currency(report.stats.averageInvoiceValue)}`,
      `Average Payment Value: ${currency(report.stats.averagePaymentValue)}`,
      `Refunded Amount: ${currency(report.stats.refundedAmount)}`,
      `Collection Rate: ${report.stats.collectionRate}%`,
      `Revenue MoM Growth: ${report.revenueAnalysis.monthOverMonthGrowth >= 0 ? "+" : ""}${report.revenueAnalysis.monthOverMonthGrowth}%`,
      "",
      "Revenue Analysis:",
      `Invoiced: ${currency(report.revenueAnalysis.invoicedAmount)}`,
      `Collected: ${currency(report.revenueAnalysis.collectedAmount)}`,
      `Outstanding: ${currency(report.revenueAnalysis.outstandingAmount)}`,
      `Average Invoice Value: ${currency(report.revenueAnalysis.averageInvoiceValue)}`,
      `Average Payment Value: ${currency(report.revenueAnalysis.averagePaymentValue)}`,
      "",
      "Monthly Trends:",
      ...report.monthlyTrends.slice(-6).map(
        (entry) =>
          `${entry.label} | Invoiced ${currency(entry.invoicedAmount)} | Collected ${currency(entry.collectedAmount)} | Appts ${entry.appointments}`
      ),
      "",
      "Revenue Streams:",
      ...report.revenueStreams.slice(0, 5).map((entry) => `${entry.stream} | ${currency(entry.total)}`),
      "",
      "Disease Patterns:",
      ...report.diseasePatterns.items.slice(0, 5).map(
        (item) => `${item.diagnosis} | ${item.caseCount} cases | ${item.patientCount} patients | ${item.sharePercent}%`
      ),
      "",
      "Predictive Revisit Signals:",
      ...report.predictiveAnalytics.revisitPrediction.patients.slice(0, 5).map(
        (patient) =>
          `${patient.patientName} | ${patient.patientCode || "-"} | score ${patient.revisitScore} | ${patient.likelihood} | ${patient.predictedWindow}`
      ),
      "",
      "Disease Trend Signals:",
      ...report.predictiveAnalytics.diseaseTrends.items.slice(0, 5).map(
        (item) =>
          `${item.diagnosis} | current ${item.currentCases} | previous ${item.previousCases} | ${item.deltaPercent >= 0 ? "+" : ""}${item.deltaPercent}% | ${item.trend}`
      ),
      "",
      "Revenue Forecast:",
      `MTD Collected: ${currency(report.predictiveAnalytics.revenueForecasting.monthToDateCollected)}`,
      `Projected Month End: ${currency(report.predictiveAnalytics.revenueForecasting.projectedMonthEndCollected)}`,
      `Forecast Range: ${currency(report.predictiveAnalytics.revenueForecasting.forecastRangeLow)} to ${currency(report.predictiveAnalytics.revenueForecasting.forecastRangeHigh)}`,
      `Projected Growth vs Last Month: ${report.predictiveAnalytics.revenueForecasting.projectedGrowthVsLastMonth >= 0 ? "+" : ""}${percentage(report.predictiveAnalytics.revenueForecasting.projectedGrowthVsLastMonth)}`,
      `Confidence: ${report.predictiveAnalytics.revenueForecasting.confidence}`,
      "",
      "Top Doctors:",
      ...report.topDoctors.slice(0, 5).map(
        (doctor) =>
          `${doctor.name} | ${doctor.specialty} | Appts ${doctor.appointments} | Completion ${doctor.completionRate}% | Revenue ${currency(doctor.revenue)}`
      ),
      "",
      "Doctor Highlights:",
      `Highest Revenue: ${report.doctorHighlights.highestRevenueDoctor ? `${report.doctorHighlights.highestRevenueDoctor.name} | ${currency(report.doctorHighlights.highestRevenueDoctor.revenue)}` : "No data"}`,
      `Busiest Doctor: ${report.doctorHighlights.busiestDoctor ? `${report.doctorHighlights.busiestDoctor.name} | ${report.doctorHighlights.busiestDoctor.appointments} appointments` : "No data"}`,
      `Best Completion: ${report.doctorHighlights.bestCompletionDoctor ? `${report.doctorHighlights.bestCompletionDoctor.name} | ${percentage(report.doctorHighlights.bestCompletionDoctor.completionRate)}` : "No data"}`,
      "",
      "Outstanding Invoices:",
      ...report.outstandingInvoices.slice(0, 5).map(
        (invoice) => `${invoice.invoiceNumber} | ${invoice.patientName} | ${currency(invoice.balanceAmount)} | ${invoice.status}`
      )
    ];

    if (commercial) {
      lines.push(
        "",
        "Commercial Engine:",
        `Usage Month: ${commercial.usage.usageMonth}`,
        `Plan Tier: ${commercial.pricing.planTier}`,
        `Credit Balance: ${commercial.wallet.currentBalance}`,
        `Credits Consumed: ${commercial.usage.creditsConsumed}`,
        `Commercial Revenue: ${currency(commercial.usage.totalRevenue)}`,
        `Commercial Cost: ${currency(commercial.usage.totalCost)}`,
        `Monthly Profit: ${currency(commercial.usage.profitAmount)}`
      );
    }

    downloadBlob(createSimplePdfBlob("Clinic Report Snapshot", lines), `clinic-report-${report.meta.period}.pdf`);
  };

  const cards = useMemo(() => {
    if (!report) {
      return [];
    }

    return [
      {
        title: "Appointments",
        value: report.stats.totalAppointments.toLocaleString(),
        note: `${report.stats.completedAppointments} completed`,
        icon: Users,
        tone: "bg-emerald-50 text-emerald-700"
      },
      {
        title: "Revenue",
        value: currency(report.stats.revenue),
        note: `${report.stats.collectionRate}% collected`,
        icon: IndianRupee,
        tone: "bg-green-50 text-green-700"
      },
      {
        title: "Pending AR",
        value: currency(report.stats.pendingAmount),
        note: `${report.stats.pendingInvoices} invoices open`,
        icon: Receipt,
        tone: "bg-amber-50 text-amber-700"
      },
      {
        title: "Clinical Records",
        value: report.stats.totalMedicalRecords.toLocaleString(),
        note: `${report.stats.totalPatients} patients total`,
        icon: FileText,
        tone: "bg-teal-50 text-teal-700"
      }
    ];
  }, [report]);

  const commercialCards = useMemo(() => {
    if (!commercial) {
      return [];
    }

    return [
      {
        title: "Credit Balance",
        value: commercial.wallet.currentBalance.toLocaleString(),
        note: commercial.wallet.isLowBalance
          ? `Low balance threshold ${commercial.wallet.lowBalanceThreshold}`
          : `${commercial.wallet.monthlyIncludedCredits} monthly included`,
        icon: Receipt,
        tone: commercial.wallet.isLowBalance ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
      },
      {
        title: "Commercial Revenue",
        value: currency(commercial.usage.totalRevenue),
        note: `${currency(commercial.usage.topupRevenue)} top-up revenue`,
        icon: IndianRupee,
        tone: "bg-green-50 text-green-700"
      },
      {
        title: "Commercial Cost",
        value: currency(commercial.usage.totalCost),
        note: `${currency(commercial.usage.infraCostShare)} infra share`,
        icon: FileText,
        tone: "bg-amber-50 text-amber-700"
      },
      {
        title: "Monthly Profit",
        value: currency(commercial.usage.profitAmount),
        note: `${commercial.usage.aiQueriesUsed} AI queries and ${commercial.usage.messagesUsed} messages`,
        icon: TrendingUp,
        tone: commercial.usage.profitAmount >= 0 ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-700"
      }
    ];
  }, [commercial]);

  const appointmentStatusData = useMemo(
    () =>
      sortByValueDesc(report?.appointmentStatus || [], "value").map((entry, index) => ({
        ...entry,
        color: APPOINTMENT_STATUS_COLORS[index % APPOINTMENT_STATUS_COLORS.length]
      })),
    [report]
  );

  const paymentMethodData = useMemo(
    () =>
      sortByValueDesc(report?.paymentMethods || [], "total").map((entry, index) => ({
        ...entry,
        color: PAYMENT_METHOD_COLORS[index % PAYMENT_METHOD_COLORS.length]
      })),
    [report]
  );
  const revenueStreamData = useMemo(
    () =>
      sortByValueDesc(report?.revenueStreams || [], "total").map((entry, index) => ({
        ...entry,
        color: REVENUE_STREAM_COLORS[index % REVENUE_STREAM_COLORS.length]
      })),
    [report]
  );
  const departmentData = useMemo(
    () =>
      sortByValueDesc(report?.departmentData || [], "value").map((entry, index) => ({
        ...entry,
        color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length]
      })),
    [report]
  );
  const recordTypeData = useMemo(
    () =>
      sortByValueDesc(report?.recordTypes || [], "count").map((entry, index) => ({
        ...entry,
        color: RECORD_TYPE_COLORS[index % RECORD_TYPE_COLORS.length]
      })),
    [report]
  );
  const diseasePatternData = useMemo(
    () =>
      sortByValueDesc(report?.diseasePatterns.items || [], "caseCount").map((entry, index) => ({
        ...entry,
        color: DISEASE_PATTERN_COLORS[index % DISEASE_PATTERN_COLORS.length]
      })),
    [report]
  );
  const diseaseTrendSignalData = useMemo(
    () =>
      sortByValueDesc(report?.predictiveAnalytics.diseaseTrends.items || [], "currentCases").map((entry, index) => ({
        ...entry,
        color: DISEASE_TREND_COLORS[index % DISEASE_TREND_COLORS.length]
      })),
    [report]
  );
  const diseasePatternChartData = useMemo(() => diseasePatternData.slice(0, 5), [diseasePatternData]);
  const diseaseTrendChartData = useMemo(() => diseaseTrendSignalData.slice(0, 5), [diseaseTrendSignalData]);
  const monthlyTrendData = useMemo(() => report?.monthlyTrends || [], [report]);
  const forecastSeries = useMemo(() => report?.predictiveAnalytics.revenueForecasting.series || [], [report]);
  const doctorLeader = report?.topDoctors[0] || null;
  const outstandingTotal = report?.outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount || 0), 0) || 0;
  const doctorHighlights = report?.doctorHighlights || null;
  const leadingDiagnosis = diseasePatternData[0] || null;
  const revisitPrediction = report?.predictiveAnalytics.revisitPrediction || null;
  const diseaseTrends = report?.predictiveAnalytics.diseaseTrends || null;
  const revenueForecasting = report?.predictiveAnalytics.revenueForecasting || null;
  const visibleTopDoctors = showAllTopDoctors ? report?.topDoctors || [] : (report?.topDoctors || []).slice(0, LIST_PREVIEW_LIMIT);
  const visibleOutstandingInvoices = showAllOutstandingInvoices
    ? report?.outstandingInvoices || []
    : (report?.outstandingInvoices || []).slice(0, LIST_PREVIEW_LIMIT);
  const visibleTransactions = showAllTransactions
    ? commercial?.transactions || []
    : (commercial?.transactions || []).slice(0, LIST_PREVIEW_LIMIT);
  const visibleRevisitPatients = showAllRevisitPatients
    ? revisitPrediction?.patients || []
    : (revisitPrediction?.patients || []).slice(0, LIST_PREVIEW_LIMIT);

  if (currentRole && !canAccessReports(currentRole)) {
    return <p className="text-red-600">You do not have access to reports.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-gray-900">Advanced Reports</h1>
          <p className="mt-1 text-gray-600">Operational, billing, and clinical insights in one screen.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 sm:w-auto"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!report}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={!report}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      {isLoading && <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading reports...</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>}

      {report && !isLoading && !error && (
        <>
          <div data-tour-id="tour-reports-overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.tone}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{card.title}</p>
                      <p className="mt-1 text-2xl text-gray-900">{card.value}</p>
                      <p className="mt-1 text-xs text-gray-500">{card.note}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {commercialMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{commercialMessage}</div>
          )}
          {commercialError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{commercialError}</div>
          )}

          {commercial && (
            <>
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-gray-900">Commercial Engine</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Credits, unit economics, and plan controls for {commercial.usage.usageMonth.slice(0, 7)}.
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
                    <p className="text-gray-500">Plan tier</p>
                    <p className="mt-1 text-gray-900">{commercial.pricing.planTier}</p>
                    <p className="mt-1 text-xs text-gray-500">Last wallet reset {formatTimestamp(commercial.wallet.lastResetAt)}</p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {commercialCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.title} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-5">
                        <div className="flex items-center gap-4">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.tone}`}>
                            <Icon className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">{card.title}</p>
                            <p className="mt-1 text-2xl text-gray-900">{card.value}</p>
                            <p className="mt-1 text-xs text-gray-500">{card.note}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-gray-900">Wallet and Usage</h2>
                      <p className="mt-1 text-sm text-gray-500">Track credits, low-balance risk, and current month spend.</p>
                    </div>
                    <Receipt className="h-5 w-5 text-emerald-600" />
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">Current balance</p>
                      <p className="mt-2 text-3xl text-gray-900">{commercial.wallet.currentBalance.toLocaleString()}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        Low balance threshold {commercial.wallet.lowBalanceThreshold}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">Credits consumed</p>
                      <p className="mt-2 text-3xl text-gray-900">{commercial.usage.creditsConsumed.toLocaleString()}</p>
                      <p className="mt-2 text-xs text-gray-500">
                        {commercial.usage.includedCreditsGranted.toLocaleString()} included granted this month
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">AI usage</p>
                      <p className="mt-2 text-2xl text-gray-900">{commercial.usage.aiQueriesUsed.toLocaleString()} queries</p>
                      <p className="mt-2 text-xs text-gray-500">
                        Cost {currency(commercial.usage.aiCostTotal)} at {currency(commercial.usage.aiCostPerQuery)} per query
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-4">
                      <p className="text-sm text-gray-500">Messaging usage</p>
                      <p className="mt-2 text-2xl text-gray-900">{commercial.usage.messagesUsed.toLocaleString()} messages</p>
                      <p className="mt-2 text-xs text-gray-500">
                        Cost {currency(commercial.usage.messageCostTotal)} at {currency(commercial.usage.messageCostPerUnit)} per message
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-sm text-gray-500">Base plan revenue</p>
                      <p className="mt-2 text-xl text-gray-900">{currency(commercial.usage.basePlanRevenue)}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-sm text-gray-500">Top-up credits purchased</p>
                      <p className="mt-2 text-xl text-gray-900">{commercial.usage.topupCreditsPurchased.toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-sm text-gray-500">Infra cost per clinic</p>
                      <p className="mt-2 text-xl text-gray-900">{currency(commercial.platformInfra.infraCostPerClinic)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  <div className="border-b border-gray-200 px-6 py-4">
                    <h2 className="text-gray-900">Recent Credit Transactions</h2>
                    <p className="mt-1 text-sm text-gray-500">Latest grants, usage debits, and top-ups on this clinic wallet.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm text-gray-600">Type</th>
                          <th className="px-6 py-3 text-left text-sm text-gray-600">Credits</th>
                          <th className="px-6 py-3 text-left text-sm text-gray-600">Amount</th>
                          <th className="px-6 py-3 text-left text-sm text-gray-600">Source</th>
                          <th className="px-6 py-3 text-left text-sm text-gray-600">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commercial.transactions.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-4 text-sm text-gray-500">
                              No wallet transactions recorded yet.
                            </td>
                          </tr>
                        )}
                        {visibleTransactions.map((transaction) => (
                          <tr key={transaction.id} className="border-t border-gray-100">
                            <td className="px-6 py-4 text-sm text-gray-800">
                              <p className="capitalize">{transaction.transactionType.replace(/_/g, " ")}</p>
                              <p className="mt-1 text-xs text-gray-500">{transaction.note || transaction.actorName || "System"}</p>
                            </td>
                            <td className={`px-6 py-4 text-sm ${transaction.creditsDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                              {transaction.creditsDelta > 0 ? "+" : ""}
                              {transaction.creditsDelta}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-800">{currency(transaction.rupeeAmount)}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">{transaction.sourceFeature || "-"}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">{formatTimestamp(transaction.createdAt)}</td>
                          </tr>
                        ))}
                        {commercial.transactions.length > LIST_PREVIEW_LIMIT && (
                          <tr>
                            <td className="px-6 py-4" colSpan={5}>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => setShowAllTransactions((current) => !current)}
                                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  {showAllTransactions ? "Show less" : "Show more"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Completion Rate</p>
              <p className="mt-2 text-3xl text-gray-900">{report.stats.completionRate}%</p>
              <p className="mt-2 text-sm text-gray-500">Appointments completed in the selected period.</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Cancellation Rate</p>
              <p className="mt-2 text-3xl text-gray-900">{report.stats.cancellationRate}%</p>
              <p className="mt-2 text-sm text-gray-500">Cancelled appointments relative to total bookings.</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">No-shows</p>
              <p className="mt-2 text-3xl text-gray-900">{report.stats.noShows}</p>
              <p className="mt-2 text-sm text-gray-500">Patient growth: {report.stats.growthRate >= 0 ? "+" : ""}{report.stats.growthRate}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-sm text-emerald-700">Top Doctor By Revenue</p>
              <p className="mt-2 text-2xl text-emerald-950">{doctorLeader?.name || "No doctor data"}</p>
              <p className="mt-2 text-sm text-emerald-800">
                {doctorLeader
                  ? `${doctorLeader.specialty} | ${currency(doctorLeader.revenue)} revenue | ${doctorLeader.completed}/${doctorLeader.appointments} completed`
                  : "No doctor performance data in this period."}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="text-sm text-amber-700">Outstanding Balance</p>
              <p className="mt-2 text-2xl text-amber-950">{currency(outstandingTotal)}</p>
              <p className="mt-2 text-sm text-amber-800">
                {report.outstandingInvoices.length} outstanding invoice{report.outstandingInvoices.length === 1 ? "" : "s"} need follow-up.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-900">Operational Trend</h2>
                  <p className="mt-1 text-sm text-gray-500">Appointments, no-shows, and revenue over {report.meta.label.toLowerCase()}.</p>
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={report.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis yAxisId="left" stroke="#6b7280" domain={[0, "dataMax"]} />
                  <YAxis yAxisId="right" orientation="right" stroke="#6b7280" domain={[0, "dataMax"]} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="appointments" fill="#14b8a6" />
                  <Line yAxisId="left" type="monotone" dataKey="noShows" stroke="#ef4444" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={3} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-900">Appointment Status Mix</h2>
                  <p className="mt-1 text-sm text-gray-500">Current distribution of outcomes for the selected period.</p>
                </div>
                <AlertCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={appointmentStatusData} dataKey="value" nameKey="name" outerRadius={110} innerRadius={70}>
                    {appointmentStatusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-900">Payment Method Insights</h2>
                  <p className="mt-1 text-sm text-gray-500">How collections are coming in.</p>
                </div>
                <IndianRupee className="h-5 w-5 text-emerald-600" />
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={paymentMethodData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" stroke="#6b7280" domain={[0, "dataMax"]} />
                  <YAxis type="category" dataKey="method" stroke="#6b7280" width={110} />
                  <Tooltip
                    formatter={(value) => {
                      const normalized = Array.isArray(value) ? value[0] : value;
                      return currency(Number(normalized ?? 0));
                    }}
                  />
                  <Bar dataKey="total">
                    {paymentMethodData.map((entry) => (
                      <Cell key={entry.method} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-900">Clinical Workload</h2>
                  <p className="mt-1 text-sm text-gray-500">Record volume by department and record type.</p>
                </div>
                <Stethoscope className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
              <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={departmentData} dataKey="value" nameKey="name" outerRadius={82} innerRadius={46}>
                      {departmentData.map((entry, index) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={recordTypeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="type" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" domain={[0, "dataMax"]} />
                    <Tooltip />
                    <Bar dataKey="count">
                      {recordTypeData.map((entry) => (
                        <Cell key={entry.type} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-900">Monthly Trends</h2>
                  <p className="mt-1 text-sm text-gray-500">12-month view of invoicing, collections, appointments, and new-patient acquisition.</p>
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis yAxisId="amount" stroke="#6b7280" domain={[0, "dataMax"]} />
                  <YAxis yAxisId="volume" orientation="right" stroke="#6b7280" domain={[0, "dataMax"]} />
                  <Tooltip
                    formatter={(value, name) => {
                      const normalized = Number(Array.isArray(value) ? value[0] : value);
                      if (name === "invoicedAmount") {
                        return [currency(normalized), "Invoiced"];
                      }
                      if (name === "collectedAmount") {
                        return [currency(normalized), "Collected"];
                      }
                      if (name === "appointments") {
                        return [normalized.toLocaleString(), "Appointments"];
                      }
                      return [normalized.toLocaleString(), "New Patients"];
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="amount" dataKey="invoicedAmount" fill="#bfdbfe" name="Invoiced" />
                  <Bar yAxisId="amount" dataKey="collectedAmount" fill="#14b8a6" name="Collected" />
                  <Line yAxisId="volume" type="monotone" dataKey="appointments" stroke="#0f766e" strokeWidth={3} name="Appointments" />
                  <Line yAxisId="volume" type="monotone" dataKey="newPatients" stroke="#f59e0b" strokeWidth={2} dot={false} name="New Patients" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-gray-900">Revenue Analysis</h2>
                    <p className="mt-1 text-sm text-gray-500">Cash collection, outstanding exposure, and revenue quality for {report.meta.label.toLowerCase()}.</p>
                  </div>
                  <IndianRupee className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Invoiced</p>
                    <p className="mt-2 text-2xl text-gray-900">{currency(report.revenueAnalysis.invoicedAmount)}</p>
                    <p className="mt-2 text-xs text-gray-500">Net bill value issued in this window.</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Collected</p>
                    <p className="mt-2 text-2xl text-gray-900">{currency(report.revenueAnalysis.collectedAmount)}</p>
                    <p className="mt-2 text-xs text-gray-500">{percentage(report.stats.collectionRate)} collection rate.</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Outstanding</p>
                    <p className="mt-2 text-2xl text-gray-900">{currency(report.revenueAnalysis.outstandingAmount)}</p>
                    <p className="mt-2 text-xs text-gray-500">{report.stats.pendingInvoices} invoices still open.</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Refunded</p>
                    <p className="mt-2 text-2xl text-gray-900">{currency(report.revenueAnalysis.refundedAmount)}</p>
                    <p className="mt-2 text-xs text-gray-500">Returned payments in the selected period.</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-sm text-gray-500">Average Invoice</p>
                    <p className="mt-2 text-2xl text-gray-900">{currency(report.revenueAnalysis.averageInvoiceValue)}</p>
                    <p className="mt-2 text-xs text-gray-500">Benchmark the average bill size.</p>
                  </div>
                  <div className={`rounded-xl border p-4 ${report.revenueAnalysis.monthOverMonthGrowth >= 0 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                    <p className={`text-sm ${report.revenueAnalysis.monthOverMonthGrowth >= 0 ? "text-emerald-700" : "text-red-700"}`}>Revenue Momentum</p>
                    <p className={`mt-2 text-2xl ${report.revenueAnalysis.monthOverMonthGrowth >= 0 ? "text-emerald-950" : "text-red-900"}`}>
                      {report.revenueAnalysis.monthOverMonthGrowth >= 0 ? "+" : ""}
                      {percentage(report.revenueAnalysis.monthOverMonthGrowth)}
                    </p>
                    <p className={`mt-2 text-xs ${report.revenueAnalysis.monthOverMonthGrowth >= 0 ? "text-emerald-800" : "text-red-700"}`}>
                      Compared against the previous 30-day collection window.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-gray-900">Revenue Streams</h2>
                    <p className="mt-1 text-sm text-gray-500">Where billed value is coming from across services.</p>
                  </div>
                  <Receipt className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                    <Pie data={revenueStreamData} dataKey="total" nameKey="stream" outerRadius={84} innerRadius={48}>
                      {revenueStreamData.map((entry) => (
                        <Cell key={entry.stream} fill={entry.color} />
                      ))}
                    </Pie>
                      <Tooltip
                        formatter={(value, name) => {
                          const normalized = Number(Array.isArray(value) ? value[0] : value);
                          return [currency(normalized), name];
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {revenueStreamData.length === 0 && <p className="text-sm text-gray-500">No revenue stream data for this period.</p>}
                    {revenueStreamData.map((entry) => (
                      <div key={entry.stream} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                            <p className="text-sm text-gray-800">{entry.stream}</p>
                          </div>
                          <p className="text-sm text-gray-900">{currency(entry.total)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-900">Disease Patterns</h2>
                  <p className="mt-1 text-sm text-gray-500">Diagnosis frequency and patient reach across the last 12 months.</p>
                </div>
                <Stethoscope className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Diagnosed records</p>
                  <p className="mt-2 text-2xl text-gray-900">{report.diseasePatterns.diagnosedRecords.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Unique diagnoses</p>
                  <p className="mt-2 text-2xl text-gray-900">{report.diseasePatterns.uniqueDiagnoses.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Leading diagnosis</p>
                  <p className="mt-2 text-lg text-gray-900">{leadingDiagnosis?.diagnosis || "No diagnosis data"}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    {leadingDiagnosis
                      ? `${leadingDiagnosis.caseCount} cases | ${leadingDiagnosis.patientCount} patients`
                      : "Diagnoses will appear here once records are coded."}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={diseasePatternChartData} layout="vertical" margin={{ left: 24, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" stroke="#6b7280" domain={[0, "dataMax"]} />
                  <YAxis type="category" dataKey="diagnosis" stroke="#6b7280" width={130} />
                    <Tooltip
                      formatter={(value, name) => {
                        const normalized = Number(Array.isArray(value) ? value[0] : value);
                        if (name === "caseCount") {
                          return [normalized.toLocaleString(), "Cases"];
                        }
                        return [normalized.toLocaleString(), "Unique Patients"];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="caseCount" name="Cases">
                      {diseasePatternChartData.map((entry) => (
                        <Cell key={`${entry.diagnosis}-cases`} fill={entry.color} />
                      ))}
                    </Bar>
                  <Bar dataKey="patientCount" name="Unique Patients">
                    {diseasePatternChartData.map((entry, index) => (
                      <Cell key={`${entry.diagnosis}-patients-${index}`} fill={DISEASE_PATTERN_COLORS[(index + 2) % DISEASE_PATTERN_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
                <div className="space-y-3">
                  {diseasePatternData.length === 0 && <p className="text-sm text-gray-500">No diagnosis patterns yet.</p>}
                  {diseasePatternData.map((entry) => (
                    <div key={entry.diagnosis} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-gray-900">{entry.diagnosis}</p>
                          <p className="mt-1 text-xs text-gray-500">Last seen {new Date(entry.lastSeenAt).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-900">{percentage(entry.sharePercent)}</p>
                          <p className="mt-1 text-xs text-gray-500">{entry.caseCount} cases</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-900">Doctor Performance Intelligence</h2>
                  <p className="mt-1 text-sm text-gray-500">Identify the doctors driving revenue, volume, and operational quality.</p>
                </div>
                <Users className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm text-emerald-700">Highest Revenue Doctor</p>
                  <p className="mt-2 text-xl text-emerald-950">{doctorHighlights?.highestRevenueDoctor?.name || "No data"}</p>
                  <p className="mt-2 text-sm text-emerald-800">
                    {doctorHighlights?.highestRevenueDoctor
                      ? `${doctorHighlights.highestRevenueDoctor.specialty} | ${currency(doctorHighlights.highestRevenueDoctor.revenue)} collected | ${doctorHighlights.highestRevenueDoctor.invoiceCount} invoices`
                      : "Revenue intelligence will appear once invoices and payments are linked to doctors."}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-sm text-sky-700">Busiest Doctor</p>
                  <p className="mt-2 text-xl text-sky-950">{doctorHighlights?.busiestDoctor?.name || "No data"}</p>
                  <p className="mt-2 text-sm text-sky-800">
                    {doctorHighlights?.busiestDoctor
                      ? `${doctorHighlights.busiestDoctor.appointments} appointments | ${doctorHighlights.busiestDoctor.uniquePatients} unique patients | ${doctorHighlights.busiestDoctor.noShows} no-shows`
                      : "Appointment volume data will appear once bookings are available in the selected period."}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-700">Best Completion Doctor</p>
                  <p className="mt-2 text-xl text-amber-950">{doctorHighlights?.bestCompletionDoctor?.name || "No data"}</p>
                  <p className="mt-2 text-sm text-amber-800">
                    {doctorHighlights?.bestCompletionDoctor
                      ? `${percentage(doctorHighlights.bestCompletionDoctor.completionRate)} completion | ${percentage(doctorHighlights.bestCompletionDoctor.noShowRate)} no-show | ${currency(doctorHighlights.bestCompletionDoctor.avgRevenuePerCompleted)} per completed visit`
                      : "Completion quality will appear once appointments are completed in the selected period."}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">What this helps with</p>
                  <p className="mt-2 text-sm text-gray-700">
                    Combine these highlights with the doctor table below to spot capacity imbalance, underperforming schedules, and billing opportunity by clinician.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-gray-900">Predictive Analytics</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Forward-looking revisit, disease, and revenue signals built from the current clinical and billing history.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {revisitPrediction?.totalPatientsModeled || 0} patients modeled
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-700">High-likelihood Revisits</p>
                <p className="mt-2 text-3xl text-emerald-950">{revisitPrediction?.highLikelihoodCount || 0}</p>
                <p className="mt-2 text-xs text-emerald-800">Patients with due follow-up or strong repeat-visit signals.</p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-sm text-sky-700">Rising Disease Signals</p>
                <p className="mt-2 text-3xl text-sky-950">
                  {(diseaseTrends?.risingCount || 0) + (diseaseTrends?.newSignals || 0)}
                </p>
                <p className="mt-2 text-xs text-sky-800">New or rising diagnosis patterns comparing the last 30 days with the prior 30 days.</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-700">Projected Month-End Collections</p>
                <p className="mt-2 text-3xl text-amber-950">{currency(revenueForecasting?.projectedMonthEndCollected || 0)}</p>
                <p className="mt-2 text-xs text-amber-800">
                  Range {currency(revenueForecasting?.forecastRangeLow || 0)} to {currency(revenueForecasting?.forecastRangeHigh || 0)}.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-gray-900">Revisit Prediction</h2>
                <p className="mt-1 text-sm text-gray-500">Patients most likely to return soon, prioritized using follow-up timing, visit frequency, and repeat diagnosis patterns.</p>
              </div>
              <div className="divide-y divide-gray-100">
                {(revisitPrediction?.patients || []).length === 0 && (
                  <div className="px-6 py-5 text-sm text-gray-500">Not enough patient history yet for revisit predictions.</div>
                )}
                {visibleRevisitPatients.map((patient) => {
                  const likelihoodClasses =
                    patient.likelihood === "high"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : patient.likelihood === "medium"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-gray-200 bg-gray-50 text-gray-700";

                  return (
                    <div key={patient.patientId} className="px-6 py-4">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm text-gray-900">{patient.patientName}</p>
                            {patient.patientCode && <span className="text-xs text-gray-500">{patient.patientCode}</span>}
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] ${likelihoodClasses}`}>
                              {patient.likelihood} likelihood
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-gray-500">
                            Score {patient.revisitScore} | Window {patient.predictedWindow} | Last visit{" "}
                            {patient.lastVisitAt ? new Date(patient.lastVisitAt).toLocaleDateString() : "-"}
                            {patient.nextFollowUpDate ? ` | Follow-up ${new Date(patient.nextFollowUpDate).toLocaleDateString()}` : ""}
                          </p>
                          <p className="mt-2 text-sm text-gray-600">{patient.latestDiagnosis || "No coded diagnosis yet"}</p>
                          {patient.reasons.length > 0 && (
                            <p className="mt-2 text-xs text-gray-500">{patient.reasons.join(" | ")}</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-right text-xs text-gray-500 xl:min-w-[220px]">
                          <div className="rounded-lg bg-gray-50 px-3 py-2">
                            <p>Completed 180d</p>
                            <p className="mt-1 text-sm text-gray-900">{patient.completedVisitsLast180}</p>
                          </div>
                          <div className="rounded-lg bg-gray-50 px-3 py-2">
                            <p>Repeat Dx</p>
                            <p className="mt-1 text-sm text-gray-900">{patient.repeatDiagnosisCount}</p>
                          </div>
                          <div className="rounded-lg bg-gray-50 px-3 py-2">
                            <p>No-shows 180d</p>
                            <p className="mt-1 text-sm text-gray-900">{patient.noShowsLast180}</p>
                          </div>
                          <div className="rounded-lg bg-gray-50 px-3 py-2">
                            <p>Days Since Visit</p>
                            <p className="mt-1 text-sm text-gray-900">{patient.daysSinceLastVisit ?? "-"}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(revisitPrediction?.patients || []).length > LIST_PREVIEW_LIMIT && (
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAllRevisitPatients((current) => !current)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {showAllRevisitPatients ? "Show less" : "Show more"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-gray-900">Revenue Forecasting</h2>
                  <p className="mt-1 text-sm text-gray-500">Month-end collection forecast using month-to-date pace smoothed by the last three completed months.</p>
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Month to Date</p>
                  <p className="mt-2 text-2xl text-gray-900">{currency(revenueForecasting?.monthToDateCollected || 0)}</p>
                  <p className="mt-2 text-xs text-gray-500">{revenueForecasting?.elapsedDays || 0} elapsed days in {revenueForecasting?.currentMonthLabel || "the current month"}.</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm text-emerald-700">Projected Month End</p>
                  <p className="mt-2 text-2xl text-emerald-950">{currency(revenueForecasting?.projectedMonthEndCollected || 0)}</p>
                  <p className="mt-2 text-xs text-emerald-800">
                    {(revenueForecasting?.projectedGrowthVsLastMonth || 0) >= 0 ? "+" : ""}
                    {percentage(revenueForecasting?.projectedGrowthVsLastMonth || 0)} vs last completed month.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-500">Forecast Range</p>
                  <p className="mt-2 text-lg text-gray-900">
                    {currency(revenueForecasting?.forecastRangeLow || 0)} - {currency(revenueForecasting?.forecastRangeHigh || 0)}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">{revenueForecasting?.remainingDays || 0} days remaining in the month.</p>
                </div>
                <div
                  className={`rounded-xl border p-4 ${
                    revenueForecasting?.confidence === "high"
                      ? "border-emerald-200 bg-emerald-50"
                      : revenueForecasting?.confidence === "medium"
                        ? "border-amber-200 bg-amber-50"
                        : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <p className="text-sm text-gray-600">Forecast Confidence</p>
                  <p className="mt-2 text-2xl text-gray-900 capitalize">{revenueForecasting?.confidence || "low"}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    Trailing 3-month baseline {currency(revenueForecasting?.trailingThreeMonthAverage || 0)}.
                  </p>
                </div>
              </div>
              <div className="mt-5">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={forecastSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" domain={[0, "dataMax"]} />
                    <Tooltip
                      formatter={(value, name) => {
                        const normalized = Number(Array.isArray(value) ? value[0] : value);
                        if (name === "projectedCollected") {
                          return [currency(normalized), "Forecast"];
                        }

                        return [currency(normalized), "Actual / MTD"];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="actualCollected" fill="#14b8a6" name="Actual / MTD" />
                  <Bar dataKey="projectedCollected" fill="#f59e0b" name="Forecast" />
                </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-gray-900">Disease Trend Signals</h2>
                <p className="mt-1 text-sm text-gray-500">Diagnosis movement comparing the last 30 days with the previous 30-day window.</p>
              </div>
              <Stethoscope className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-700">Rising</p>
                <p className="mt-2 text-2xl text-emerald-950">{diseaseTrends?.risingCount || 0}</p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-sm text-sky-700">New</p>
                <p className="mt-2 text-2xl text-sky-950">{diseaseTrends?.newSignals || 0}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Stable</p>
                <p className="mt-2 text-2xl text-gray-900">{diseaseTrends?.stableCount || 0}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-700">Declining</p>
                <p className="mt-2 text-2xl text-amber-950">{diseaseTrends?.decliningCount || 0}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={diseaseTrendChartData} layout="vertical" margin={{ left: 24, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" stroke="#6b7280" domain={[0, "dataMax"]} />
                  <YAxis type="category" dataKey="diagnosis" stroke="#6b7280" width={130} />
                  <Tooltip
                    formatter={(value, name) => {
                      const normalized = Number(Array.isArray(value) ? value[0] : value);
                      if (name === "currentCases") {
                        return [normalized.toLocaleString(), diseaseTrends?.currentWindowLabel || "Current window"];
                      }

                      return [normalized.toLocaleString(), diseaseTrends?.previousWindowLabel || "Previous window"];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="currentCases" fill="#14b8a6" name={diseaseTrends?.currentWindowLabel || "Current window"} />
                  <Bar dataKey="previousCases" fill="#94a3b8" name={diseaseTrends?.previousWindowLabel || "Previous window"} />
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {diseaseTrendSignalData.length === 0 && <p className="text-sm text-gray-500">No diagnosis movement detected yet.</p>}
                {diseaseTrendSignalData.map((entry) => {
                  const trendClasses =
                    entry.trend === "new"
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : entry.trend === "rising"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : entry.trend === "declining"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-gray-200 bg-gray-50 text-gray-700";

                  return (
                    <div key={entry.diagnosis} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-gray-900">{entry.diagnosis}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Current {entry.currentCases} | Previous {entry.previousCases}
                            {entry.lastSeenAt ? ` | Last seen ${new Date(entry.lastSeenAt).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] ${trendClasses}`}>
                            {entry.trend}
                          </span>
                          <p className="mt-2 text-sm text-gray-900">
                            {entry.deltaPercent >= 0 ? "+" : ""}
                            {percentage(entry.deltaPercent)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-gray-900">Top Doctors</h2>
                <p className="mt-1 text-sm text-gray-500">Volume, care conversion, patient reach, and revenue per doctor.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Doctor</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Appointments</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Completed</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Unique Patients</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Completion %</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">No-show %</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Avg Rev / Completed</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topDoctors.length === 0 && <tr><td colSpan={8} className="px-6 py-4 text-sm text-gray-500">No doctor performance data in this period.</td></tr>}
                    {visibleTopDoctors.map((doctor) => (
                      <tr key={doctor.id} className="border-t border-gray-100">
                        <td className="px-6 py-4 text-sm text-gray-800">
                          <p>{doctor.name}</p>
                          <p className="mt-1 text-xs text-gray-500">{doctor.specialty}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800">{doctor.appointments}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{doctor.completed}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{doctor.uniquePatients}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{percentage(doctor.completionRate)}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{percentage(doctor.noShowRate)}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{currency(doctor.avgRevenuePerCompleted)}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{currency(doctor.revenue)}</td>
                      </tr>
                    ))}
                    {report.topDoctors.length > LIST_PREVIEW_LIMIT && (
                      <tr>
                        <td className="px-6 py-4" colSpan={8}>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setShowAllTopDoctors((current) => !current)}
                              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              {showAllTopDoctors ? "Show less" : "Show more"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-gray-900">Outstanding Invoices</h2>
                <p className="mt-1 text-sm text-gray-500">Largest unpaid balances needing follow-up.</p>
              </div>
              <div className="divide-y divide-gray-100">
                {report.outstandingInvoices.length === 0 && <div className="px-6 py-5 text-sm text-gray-500">No outstanding invoices.</div>}
                {visibleOutstandingInvoices.map((invoice) => (
                  <div key={invoice.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-gray-900">{invoice.invoiceNumber}</p>
                        <p className="mt-1 text-xs text-gray-500">{invoice.patientName} • {invoice.doctorName}</p>
                        <p className="mt-1 text-xs text-gray-500">Issued {invoice.issueDate}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">{currency(invoice.balanceAmount)}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-amber-700">{invoice.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {report.outstandingInvoices.length > LIST_PREVIEW_LIMIT && (
                  <div className="px-6 py-4">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowAllOutstandingInvoices((current) => !current)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {showAllOutstandingInvoices ? "Show less" : "Show more"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {commercial && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <form onSubmit={handleSavePricing} className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-gray-900">Pricing and Usage Rules</h2>
                    <p className="mt-1 text-sm text-gray-500">Set the plan, credit pack, and default unit costs used for profitability.</p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="text-sm text-gray-600">
                    <span>Plan tier</span>
                    <select
                      value={pricingForm.planTier}
                      onChange={(event) => {
                        const nextPlanTier = event.target.value;
                        setPricingForm((current) => ({
                          ...current,
                          planTier: nextPlanTier,
                          ...(PLAN_PRICING_DEFAULTS[nextPlanTier] || {})
                        }));
                      }}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                    >
                      {PLAN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>Base plan price</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pricingForm.basePlanPrice}
                      onChange={(event) => setPricingForm((current) => ({ ...current, basePlanPrice: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>Monthly included credits</span>
                    <input
                      type="number"
                      min="0"
                      value={pricingForm.monthlyIncludedCredits}
                      onChange={(event) => setPricingForm((current) => ({ ...current, monthlyIncludedCredits: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>Low balance threshold</span>
                    <input
                      type="number"
                      min="0"
                      value={pricingForm.lowBalanceThreshold}
                      onChange={(event) => setPricingForm((current) => ({ ...current, lowBalanceThreshold: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>Top-up price</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pricingForm.topupPrice}
                      onChange={(event) => setPricingForm((current) => ({ ...current, topupPrice: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>Top-up credits</span>
                    <input
                      type="number"
                      min="1"
                      value={pricingForm.topupCreditAmount}
                      onChange={(event) => setPricingForm((current) => ({ ...current, topupCreditAmount: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>AI credits per query</span>
                    <input
                      type="number"
                      min="0"
                      value={pricingForm.aiCreditsPerQuery}
                      onChange={(event) => setPricingForm((current) => ({ ...current, aiCreditsPerQuery: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>Message credits per unit</span>
                    <input
                      type="number"
                      min="0"
                      value={pricingForm.messageCreditsPerUnit}
                      onChange={(event) => setPricingForm((current) => ({ ...current, messageCreditsPerUnit: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>AI cost per query</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pricingForm.defaultAiCostPerQuery}
                      onChange={(event) => setPricingForm((current) => ({ ...current, defaultAiCostPerQuery: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="text-sm text-gray-600">
                    <span>Message cost per unit</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pricingForm.defaultMessageCostPerUnit}
                      onChange={(event) => setPricingForm((current) => ({ ...current, defaultMessageCostPerUnit: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingPricing}
                  className="mt-5 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {savingPricing ? "Saving..." : "Save pricing"}
                </button>
              </form>

              <form onSubmit={handleCreateTopUp} className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-gray-900">Manual Top-up</h2>
                    <p className="mt-1 text-sm text-gray-500">Add credits to the clinic wallet and capture the matching revenue.</p>
                  </div>
                  <IndianRupee className="h-5 w-5 text-emerald-600" />
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block text-sm text-gray-600">
                    <span>Packs</span>
                    <input
                      type="number"
                      min="1"
                      value={topUpForm.packs}
                      onChange={(event) => setTopUpForm((current) => ({ ...current, packs: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    <span>Override credits</span>
                    <input
                      type="number"
                      min="1"
                      value={topUpForm.credits}
                      onChange={(event) => setTopUpForm((current) => ({ ...current, credits: event.target.value }))}
                      placeholder={`Default ${commercial.pricing.topupCreditAmount} credits per pack`}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    <span>Override rupee amount</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={topUpForm.rupeeAmount}
                      onChange={(event) => setTopUpForm((current) => ({ ...current, rupeeAmount: event.target.value }))}
                      placeholder={`Default ${currency(commercial.pricing.topupPrice)} per pack`}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    <span>Note</span>
                    <textarea
                      rows={4}
                      value={topUpForm.note}
                      onChange={(event) => setTopUpForm((current) => ({ ...current, note: event.target.value }))}
                      placeholder="Optional operator note"
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={addingTopUp}
                  className="mt-5 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {addingTopUp ? "Adding..." : "Add credits"}
                </button>
              </form>

              <form onSubmit={handleSavePlatformInfra} className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-gray-900">Platform Infra Input</h2>
                    <p className="mt-1 text-sm text-gray-500">Update the monthly infra pool so clinic-level profitability stays grounded.</p>
                  </div>
                  <FileText className="h-5 w-5 text-emerald-600" />
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-xl bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Usage Month</p>
                    <p className="mt-2 text-lg text-gray-900">{commercial.platformInfra.usageMonth}</p>
                  </div>
                  <label className="block text-sm text-gray-600">
                    <span>Total infra cost</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={platformInfraForm.totalInfraCost}
                      onChange={(event) => setPlatformInfraForm((current) => ({ ...current, totalInfraCost: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    <span>Active clinics</span>
                    <input
                      type="number"
                      min="0"
                      value={platformInfraForm.activeClinics}
                      onChange={(event) => setPlatformInfraForm((current) => ({ ...current, activeClinics: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                  <label className="block text-sm text-gray-600">
                    <span>Notes</span>
                    <textarea
                      rows={5}
                      value={platformInfraForm.notes}
                      onChange={(event) => setPlatformInfraForm((current) => ({ ...current, notes: event.target.value }))}
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingPlatformInfra}
                  className="mt-5 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {savingPlatformInfra ? "Saving..." : "Update infra"}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
