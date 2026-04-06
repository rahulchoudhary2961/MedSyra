"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, Download, FileText, IndianRupee, Receipt, Stethoscope, TrendingUp, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { apiRequest } from "@/lib/api";
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

const PIE_COLORS = ["#059669", "#10b981", "#34d399", "#6ee7b7", "#047857", "#22c55e", "#f59e0b", "#ef4444"];
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
const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const escapePdfText = (text: string) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const formatTimestamp = (value: string | null) => (value ? new Date(value).toLocaleString() : "-");
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
    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then((response) => setCurrentRole(response.data.role || ""))
      .catch(() => setCurrentRole(""));
  }, []);

  useEffect(() => {
    Promise.all([
      apiRequest<ReportsResponse>(`/dashboard/reports?period=${period}`, { authenticated: true }),
      apiRequest<CommercialOverviewResponse>("/commercial/overview", { authenticated: true })
    ])
      .then(([reportResponse, commercialResponse]) => {
        setReport(reportResponse.data);
        applyCommercialData(commercialResponse.data);
      })
      .catch((err: Error) => setError(err.message || "Failed to load reports"))
      .finally(() => setIsLoading(false));
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
      ["Completion Rate", report.stats.completionRate],
      ["Cancellation Rate", report.stats.cancellationRate],
      ["Collection Rate", report.stats.collectionRate],
      [],
      ["Top Doctors"],
      ["Name", "Specialty", "Appointments", "Completed", "No-shows", "Revenue"],
      ...report.topDoctors.map((doctor) => [doctor.name, doctor.specialty, doctor.appointments, doctor.completed, doctor.noShows, doctor.revenue]),
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
      `Generated: ${new Date().toLocaleString()}`,
      "",
      `Appointments: ${report.stats.totalAppointments}`,
      `Completed: ${report.stats.completedAppointments}`,
      `Completion Rate: ${report.stats.completionRate}%`,
      `No-shows: ${report.stats.noShows}`,
      `Revenue: ${currency(report.stats.revenue)}`,
      `Pending Amount: ${currency(report.stats.pendingAmount)}`,
      `Collection Rate: ${report.stats.collectionRate}%`,
      "",
      "Top Doctors:",
      ...report.topDoctors.slice(0, 5).map(
        (doctor) => `${doctor.name} | ${doctor.specialty} | Appts ${doctor.appointments} | Completed ${doctor.completed} | Revenue ${currency(doctor.revenue)}`
      ),
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
    () => (report?.appointmentStatus || []).map((entry, index) => ({ ...entry, color: PIE_COLORS[index % PIE_COLORS.length] })),
    [report]
  );

  const paymentMethodData = useMemo(
    () => (report?.paymentMethods || []).map((entry, index) => ({ ...entry, color: PIE_COLORS[(index + 2) % PIE_COLORS.length] })),
    [report]
  );
  const doctorLeader = report?.topDoctors[0] || null;
  const outstandingTotal = report?.outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount || 0), 0) || 0;

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
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
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
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={!report}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
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
                        {commercial.transactions.map((transaction) => (
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
                <LineChart data={report.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis yAxisId="left" stroke="#6b7280" />
                  <YAxis yAxisId="right" orientation="right" stroke="#6b7280" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="appointments" fill="#10b981" radius={[6, 6, 0, 0]} />
                  <Line yAxisId="left" type="monotone" dataKey="noShows" stroke="#ef4444" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#047857" strokeWidth={3} dot={false} />
                </LineChart>
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
                  <Pie data={appointmentStatusData} dataKey="value" nameKey="name" outerRadius={110} label>
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
                  <XAxis type="number" stroke="#6b7280" />
                  <YAxis type="category" dataKey="method" stroke="#6b7280" width={110} />
                  <Tooltip
                    formatter={(value) => {
                      const normalized = Array.isArray(value) ? value[0] : value;
                      return currency(Number(normalized ?? 0));
                    }}
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]}>
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
                    <Pie data={report.departmentData} dataKey="value" nameKey="name" outerRadius={82} label>
                      {report.departmentData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={report.recordTypes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="type" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-gray-900">Top Doctors</h2>
                <p className="mt-1 text-sm text-gray-500">Booking volume, completion, no-shows, and revenue.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Doctor</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Appointments</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Completed</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">No-shows</th>
                      <th className="px-6 py-3 text-left text-sm text-gray-600">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topDoctors.length === 0 && <tr><td colSpan={5} className="px-6 py-4 text-sm text-gray-500">No doctor performance data in this period.</td></tr>}
                    {report.topDoctors.map((doctor) => (
                      <tr key={doctor.id} className="border-t border-gray-100">
                        <td className="px-6 py-4 text-sm text-gray-800">
                          <p>{doctor.name}</p>
                          <p className="mt-1 text-xs text-gray-500">{doctor.specialty}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800">{doctor.appointments}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{doctor.completed}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{doctor.noShows}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{currency(doctor.revenue)}</td>
                      </tr>
                    ))}
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
                {report.outstandingInvoices.map((invoice) => (
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
