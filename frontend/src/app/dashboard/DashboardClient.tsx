"use client";

import Link from "next/link";
import { Users, FileText, UserRound, IndianRupee } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import StatCard from "../components/StatCard";
import RecentPatientsTable from "../components/RecentPatientsTable";
import PatientActivityTimeline from "../components/PatientActivityTimeline";
import ModalCloseButton from "../components/ModalCloseButton";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { isUuid } from "@/lib/uuid";
import { ActivityLog, Patient } from "@/types/api";

const BLOOD_TYPE_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

type DashboardFollowUpQueueItem = {
  recordId: string;
  patientId: string;
  patientCode: string | null;
  patientName: string;
  phone: string | null;
  doctorName: string | null;
  recordType: string | null;
  followUpDate: string;
  followUpReminderStatus: string | null;
  lastVisitAt: string | null;
  daysOverdue: number;
};

type DashboardRecallQueueItem = {
  patientId: string;
  patientCode: string | null;
  patientName: string;
  phone: string | null;
  lastVisitAt: string | null;
  lastDoctorName: string | null;
  daysSinceLastVisit: number;
};

type DashboardCrmState = {
  followUpQueue: DashboardFollowUpQueueItem[];
  recallQueue: DashboardRecallQueueItem[];
};

type DashboardOperationsState = {
  todayWaiting: number;
  pendingPayments: number;
  pendingPaymentAmount: number;
  followUpsDue: number;
  followUpsOverdue: number;
  labReportsReady: number;
  insuranceFollowUpsDue: number;
  actionRequired: Array<{
    key: string;
    label: string;
    count: number;
    href: string;
    tone: "blue" | "amber" | "emerald" | "rose" | "violet" | "slate" | "orange";
  }>;
};

type DashboardResponse = {
  success: boolean;
  data: {
    stats: {
      todayAppointments: number;
      todayRevenue: number;
      pendingPayments: number;
      noShows: number;
    };
    insights: {
      patientsDidNotReturn: number;
      mostCommonIssue: {
        label: string;
        count: number;
      };
      weeklyRevenue: number;
      followUpsDueToday: number;
    };
    operations: DashboardOperationsState;
    crm: DashboardCrmState;
    recentActivity: ActivityLog[];
    patients: Patient[];
  };
};

export type DashboardInitialData = (DashboardResponse["data"] & { patients: Patient[] }) | null;

type GetPatientResponse = {
  success: boolean;
  data: Patient;
};

type UpdatePatientResponse = {
  success: boolean;
  data: Patient;
};

type EditPatientForm = {
  fullName: string;
  age: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  bloodType: string;
  bloodTypeMode: "select" | "other";
  description: string;
  emergencyContact: string;
  address: string;
};

const initialPatientForm: EditPatientForm = {
  fullName: "",
  age: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  email: "",
  bloodType: "",
  bloodTypeMode: "select",
  description: "",
  emergencyContact: "",
  address: ""
};

const formatRupee = (value: number) => `Rs. ${Number(value || 0).toLocaleString()}`;
const emptyCrmState: DashboardCrmState = {
  followUpQueue: [],
  recallQueue: []
};
const emptyOperationsState: DashboardOperationsState = {
  todayWaiting: 0,
  pendingPayments: 0,
  pendingPaymentAmount: 0,
  followUpsDue: 0,
  followUpsOverdue: 0,
  labReportsReady: 0,
  insuranceFollowUpsDue: 0,
  actionRequired: []
};

const calculateAgeFromDateOfBirth = (value: string) => {
  if (!value) return "";
  const dateOfBirth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dateOfBirth.getTime())) {
    return "";
  }

  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() && now.getDate() >= dateOfBirth.getDate());

  if (!hadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? String(age) : "";
};

const getTitlePrefix = (gender: string) => {
  if (gender === "male") {
    return "Mr. ";
  }

  if (gender === "female") {
    return "Miss. ";
  }

  return "";
};

const stripTitlePrefix = (value: string) => value.replace(/^(Mr\.|Miss\.|Mrs\.|Ms\.)\s*/i, "").trimStart();

const normalizeBloodTypeSelection = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  const normalized = value.trim().toUpperCase();
  return BLOOD_TYPE_OPTIONS.includes(normalized as (typeof BLOOD_TYPE_OPTIONS)[number]) ? normalized : "other";
};

const isKnownBloodType = (value: string | null | undefined) => {
  const normalized = normalizeBloodTypeSelection(value);
  return normalized !== "" && normalized !== "other";
};

export default function DashboardClient({ initialData }: { initialData?: DashboardInitialData }) {
  const [loading, setLoading] = useState(() => !initialData);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(() => initialData?.stats || {
    todayAppointments: 0,
    todayRevenue: 0,
    pendingPayments: 0,
    noShows: 0
  });
  const [insights, setInsights] = useState(() => initialData?.insights || {
    patientsDidNotReturn: 0,
    mostCommonIssue: {
      label: "-",
      count: 0
    },
    weeklyRevenue: 0,
    followUpsDueToday: 0
  });
  const [patients, setPatients] = useState<Patient[]>(() => initialData?.patients || []);
  const [activities, setActivities] = useState<ActivityLog[]>(() => initialData?.recentActivity || []);
  const [crm, setCrm] = useState<DashboardCrmState>(() => initialData?.crm || emptyCrmState);
  const [operations, setOperations] = useState<DashboardOperationsState>(() => initialData?.operations || emptyOperationsState);
  const [viewPatient, setViewPatient] = useState<Patient | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [patientForm, setPatientForm] = useState<EditPatientForm>(initialPatientForm);
  const [patientFormError, setPatientFormError] = useState("");
  const [isUpdatingPatient, setIsUpdatingPatient] = useState(false);
  const dashboardRequestRef = useRef(0);

  const loadDashboard = useCallback(async (showLoader = false) => {
    const requestId = dashboardRequestRef.current + 1;
    dashboardRequestRef.current = requestId;

    if (showLoader) {
      setLoading(true);
    }
    setError("");

    try {
      const dashboardRes = await apiRequest<DashboardResponse>("/dashboard/summary", { authenticated: true });

      if (dashboardRequestRef.current !== requestId) {
        return;
      }

      setStats(dashboardRes.data.stats);
      setInsights(dashboardRes.data.insights);
      setOperations(dashboardRes.data.operations || emptyOperationsState);
      setCrm(dashboardRes.data.crm || emptyCrmState);
      setActivities(dashboardRes.data.recentActivity || []);
      setPatients(dashboardRes.data.patients || []);
    } catch (err) {
      if (dashboardRequestRef.current !== requestId) {
        return;
      }

      const message = err instanceof Error ? err.message : "Failed to load dashboard data";
      setError(message);
    } finally {
      if (showLoader && dashboardRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (initialData) {
      setLoading(false);
      return;
    }

    void loadDashboard(true);
  }, [initialData, loadDashboard]);

  useEffect(() => {
    const reloadDashboard = () => {
      void loadDashboard();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reloadDashboard();
      }
    };

    window.addEventListener("focus", reloadDashboard);
    window.addEventListener("pageshow", reloadDashboard);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", reloadDashboard);
      window.removeEventListener("pageshow", reloadDashboard);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadDashboard]);

  const formatLastVisitDate = (value: string | null) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
  };

  const formatReminderStatus = (value: string | null) => {
    const normalized = (value || "pending").toLowerCase();
    if (normalized === "sent") return "Sent";
    if (normalized === "failed") return "Failed";
    if (normalized === "disabled") return "Disabled";
    if (normalized === "skipped") return "Skipped";
    return "Pending";
  };

  const getReminderStatusTone = (value: string | null) => {
    const normalized = (value || "pending").toLowerCase();
    if (normalized === "sent") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    if (normalized === "failed") return "bg-red-50 text-red-700 ring-red-200";
    if (normalized === "disabled") return "bg-gray-100 text-gray-600 ring-gray-200";
    if (normalized === "skipped") return "bg-amber-50 text-amber-700 ring-amber-200";
    return "bg-blue-50 text-blue-700 ring-blue-200";
  };

  const formatFollowUpState = (item: DashboardFollowUpQueueItem) =>
    item.daysOverdue > 0
      ? `Overdue by ${item.daysOverdue} day${item.daysOverdue === 1 ? "" : "s"}`
      : "Due today";

  const getFollowUpStateTone = (item: DashboardFollowUpQueueItem) =>
    item.daysOverdue > 0 ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-700 ring-amber-200";

  const getRecallStateTone = (daysSinceLastVisit: number) =>
    daysSinceLastVisit >= 60 ? "bg-red-50 text-red-700 ring-red-200" : "bg-blue-50 text-blue-700 ring-blue-200";

  const getActionTone = (tone: DashboardOperationsState["actionRequired"][number]["tone"]) => {
    if (tone === "amber") return "bg-amber-50 text-amber-700 ring-amber-200";
    if (tone === "emerald") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    if (tone === "rose") return "bg-rose-50 text-rose-700 ring-rose-200";
    if (tone === "violet") return "bg-violet-50 text-violet-700 ring-violet-200";
    if (tone === "slate") return "bg-slate-100 text-slate-700 ring-slate-200";
    if (tone === "orange") return "bg-orange-50 text-orange-700 ring-orange-200";
    return "bg-blue-50 text-blue-700 ring-blue-200";
  };

  const openViewPatient = async (patient: Patient) => {
    if (!isUuid(patient.id)) {
      setError("This patient record has an invalid id and cannot be opened.");
      return;
    }

    setViewPatient(patient);
    try {
      const response = await apiRequest<GetPatientResponse>(`/patients/${patient.id}`, {
        authenticated: true
      });
      setViewPatient(response.data);
    } catch {
      // Keep the row data visible even if the detail fetch is slow or fails.
    }
  };

  const openEditPatient = async (patient: Patient) => {
    setPatientFormError("");
    setEditingPatient(patient);
    setPatientForm({
      fullName: stripTitlePrefix(patient.full_name || ""),
      age: patient.age?.toString() || "",
      dateOfBirth: patient.date_of_birth || "",
      gender: patient.gender || "",
      phone: patient.phone || "",
      email: patient.email || "",
      bloodType: patient.blood_type || "",
      bloodTypeMode: isKnownBloodType(patient.blood_type) ? "select" : "other",
      description: patient.description || "",
      emergencyContact: patient.emergency_contact || "",
      address: patient.address || ""
    });
  };

  const handleUpdatePatient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingPatient) {
      return;
    }

    setIsUpdatingPatient(true);
    setPatientFormError("");

    const body = {
      fullName: `${getTitlePrefix(patientForm.gender)}${stripTitlePrefix(patientForm.fullName)}`,
      age: patientForm.age ? Number(patientForm.age) : null,
      ...(patientForm.dateOfBirth ? { dateOfBirth: patientForm.dateOfBirth } : {}),
      gender: patientForm.gender,
      phone: patientForm.phone,
      email: patientForm.email || null,
      bloodType: patientForm.bloodType ? patientForm.bloodType.trim() : null,
      description: patientForm.description || null,
      emergencyContact: patientForm.emergencyContact || null,
      address: patientForm.address || null,
      status: editingPatient.status || "active"
    };

    try {
      const response = await apiRequest<UpdatePatientResponse>(`/patients/${editingPatient.id}`, {
        method: "PATCH",
        authenticated: true,
        body
      });

      const updatedPatient = response.data;
      setPatients((currentPatients) =>
        currentPatients.map((patient) => (patient.id === updatedPatient.id ? updatedPatient : patient))
      );
      setViewPatient((currentPatient) => (currentPatient?.id === updatedPatient.id ? updatedPatient : currentPatient));
      setEditingPatient(null);
      setPatientForm(initialPatientForm);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setPatientFormError(err.message || "Failed to update patient");
      } else if (err instanceof Error) {
        setPatientFormError(err.message);
      } else {
        setPatientFormError("Failed to update patient");
      }
    } finally {
      setIsUpdatingPatient(false);
    }
  };

  if (loading) {
    return <p className="theme-copy">Loading dashboard...</p>;
  }

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="theme-heading space-y-1">Dashboard</h1>
        <p className="theme-copy mt-1">Overview of your practice, clinic, or hospital operations</p>
      </div>

      <div data-tour-id="tour-dashboard-stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today Appointments" value={String(stats.todayAppointments)} change="Today" trend="up" icon={Users} color="blue" />
        <StatCard title="Today Revenue" value={formatRupee(stats.todayRevenue)} change="Today" trend="up" icon={IndianRupee} color="green" />
        <StatCard title="Pending Payments" value={String(stats.pendingPayments)} change="Open" trend="up" icon={FileText} color="emerald" />
        <StatCard title="No-shows" value={String(stats.noShows)} change="Today" trend="up" icon={UserRound} color="teal" />
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="theme-heading text-lg">Daily Operations</h2>
            <p className="theme-copy mt-1">A shift-level view of what needs action today, not just what happened.</p>
          </div>
          <div className="text-sm theme-copy">
            Pending collection: <span className="font-medium text-gray-900">{formatRupee(operations.pendingPaymentAmount)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="theme-panel rounded-xl p-5">
            <p className="text-sm theme-muted">Patients Waiting</p>
            <p className="mt-2 text-2xl theme-heading">{operations.todayWaiting}</p>
            <p className="mt-2 text-sm theme-copy">Pending, confirmed, or checked-in for today</p>
          </div>
          <div className="theme-panel rounded-xl p-5">
            <p className="text-sm theme-muted">Pending Payments</p>
            <p className="mt-2 text-2xl theme-heading">{operations.pendingPayments}</p>
            <p className="mt-2 text-sm theme-copy">{formatRupee(operations.pendingPaymentAmount)} outstanding</p>
          </div>
          <div className="theme-panel rounded-xl p-5">
            <p className="text-sm theme-muted">Follow-ups Due</p>
            <p className="mt-2 text-2xl theme-heading">{operations.followUpsDue}</p>
            <p className="mt-2 text-sm theme-copy">{operations.followUpsOverdue} overdue cases in queue</p>
          </div>
          <div className="theme-panel rounded-xl p-5">
            <p className="text-sm theme-muted">Action Required</p>
            <p className="mt-2 text-2xl theme-heading">{operations.actionRequired.length}</p>
            <p className="mt-2 text-sm theme-copy">Live queues across ops, CRM, lab, and billing</p>
          </div>
        </div>

        <div className="theme-panel rounded-xl p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="theme-heading text-base">Action Required</h3>
              <p className="mt-1 text-sm theme-copy">Open the exact workspace that needs attention right now.</p>
            </div>
          </div>

          {operations.actionRequired.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
              No urgent operational queues right now.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {operations.actionRequired.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="mt-1 text-xs text-gray-500">Open queue</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${getActionTone(item.tone)}`}>
                    {item.count}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section data-tour-id="tour-dashboard-insights" className="space-y-3">
        <div>
          <h2 className="theme-heading text-lg">Smart Insights</h2>
          <p className="theme-copy mt-1">A compact view of return risk, trends, revenue, and due follow-ups.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="theme-panel rounded-xl p-5">
            <p className="text-sm theme-muted">Patients Didn&apos;t Return</p>
            <p className="mt-2 text-2xl theme-heading">{insights.patientsDidNotReturn}</p>
            <p className="mt-2 text-sm theme-copy">No visit in the last 30 days</p>
          </div>

          <div className="theme-panel rounded-xl p-5">
            <p className="text-sm theme-muted">Most Common Issue</p>
            <p className="mt-2 text-2xl theme-heading">{insights.mostCommonIssue.label}</p>
            <p className="mt-2 text-sm theme-copy">
              {insights.mostCommonIssue.count > 0
                ? `${insights.mostCommonIssue.count} recent record${insights.mostCommonIssue.count === 1 ? "" : "s"}`
                : "No diagnosis trend yet"}
            </p>
          </div>

          <div className="theme-panel rounded-xl p-5">
            <p className="text-sm theme-muted">This Week Revenue</p>
            <p className="mt-2 text-2xl theme-heading">{formatRupee(insights.weeklyRevenue)}</p>
            <p className="mt-2 text-sm theme-copy">Collected payments this week</p>
          </div>

          <div className="theme-panel rounded-xl p-5">
            <p className="text-sm theme-muted">Follow-ups Due Today</p>
            <p className="mt-2 text-2xl theme-heading">{insights.followUpsDueToday}</p>
            <p className="mt-2 text-sm theme-copy">Based on saved follow-up dates</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="theme-heading text-lg">CRM Workspace</h2>
            <p className="theme-copy mt-1">Track patients who need follow-up today and patients who have not returned in time.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/medical-records"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Open Medical Records
            </Link>
            <Link
              href="/dashboard/appointments"
              className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
            >
              Open Appointments
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="theme-panel rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm theme-muted">Follow-up Queue</p>
                <p className="mt-1 text-sm theme-copy">Patients with due or overdue follow-up action.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                {crm.followUpQueue.length} Active
              </span>
            </div>

            {crm.followUpQueue.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                No follow-ups are due right now.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {crm.followUpQueue.map((item) => (
                  <article key={item.recordId} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.patientName}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {[item.patientCode, item.phone].filter(Boolean).join(" | ") || "No contact saved"}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${getFollowUpStateTone(item)}`}>
                        {formatFollowUpState(item)}
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-gray-700">
                      Due {formatLastVisitDate(item.followUpDate)}
                      {item.doctorName ? ` with ${item.doctorName}` : ""}
                      {item.recordType ? ` | ${item.recordType}` : ""}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${getReminderStatusTone(item.followUpReminderStatus)}`}>
                        Reminder {formatReminderStatus(item.followUpReminderStatus)}
                      </span>
                      {item.lastVisitAt ? (
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">
                          Last visit {formatLastVisitDate(item.lastVisitAt)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/patients/${encodeURIComponent(item.patientId)}`}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Open Patient
                      </Link>
                      <Link
                        href={`/dashboard/medical-records?patientId=${encodeURIComponent(item.patientId)}`}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Open Records
                      </Link>
                      <Link
                        href={`/dashboard/appointments?patientId=${encodeURIComponent(item.patientId)}`}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
                      >
                        Book Visit
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="theme-panel rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm theme-muted">Recall Queue</p>
                <p className="mt-1 text-sm theme-copy">Patients who have not returned in more than 30 days.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                {crm.recallQueue.length} Patients
              </span>
            </div>

            {crm.recallQueue.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                No recall candidates right now.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {crm.recallQueue.map((item) => (
                  <article key={item.patientId} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.patientName}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {[item.patientCode, item.phone].filter(Boolean).join(" | ") || "No contact saved"}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${getRecallStateTone(item.daysSinceLastVisit)}`}>
                        {item.daysSinceLastVisit} day{item.daysSinceLastVisit === 1 ? "" : "s"} gap
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-gray-700">
                      Last visit {formatLastVisitDate(item.lastVisitAt)}
                      {item.lastDoctorName ? ` with ${item.lastDoctorName}` : ""}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/patients/${encodeURIComponent(item.patientId)}`}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Open Patient
                      </Link>
                      <Link
                        href={`/dashboard/appointments?patientId=${encodeURIComponent(item.patientId)}`}
                        className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
                      >
                        Book Follow-up
                      </Link>
                      {item.phone ? (
                        <a
                          href={`tel:${item.phone}`}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          Call
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentPatientsTable
            patients={patients}
            onView={openViewPatient}
            onEdit={openEditPatient}
            maxVisibleRows={6}
            moreHref="/dashboard/patients"
          />
        </div>

        <div>
          <PatientActivityTimeline items={activities} maxVisibleItems={6} />
        </div>
      </div>

      {viewPatient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto p-4">
          <div className="theme-surface-strong rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl theme-heading">Patient Details</h2>
                  <p className="text-sm theme-copy mt-1">
                    {viewPatient.full_name}
                    {viewPatient.patient_code ? ` | ${viewPatient.patient_code}` : ""}
                  </p>
                </div>
                <ModalCloseButton onClick={() => setViewPatient(null)} />
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <p><span className="theme-muted">Patient ID:</span> {viewPatient.patient_code || "-"}</p>
              <p><span className="theme-muted">Age:</span> {viewPatient.age ?? "-"}</p>
              <p><span className="theme-muted">Date of Birth:</span> {formatLastVisitDate(viewPatient.date_of_birth)}</p>
              <p><span className="theme-muted">Gender:</span> {viewPatient.gender || "-"}</p>
              <p><span className="theme-muted">Phone:</span> {viewPatient.phone || "-"}</p>
              <p><span className="theme-muted">Email:</span> {viewPatient.email || "-"}</p>
              <p><span className="theme-muted">Blood Type:</span> {viewPatient.blood_type || "-"}</p>
              <p><span className="theme-muted">Emergency Contact:</span> {viewPatient.emergency_contact || "-"}</p>
              <p><span className="theme-muted">Status:</span> {viewPatient.status || "-"}</p>
              <p><span className="theme-muted">Last Visit:</span> {formatLastVisitDate(viewPatient.last_visit_at)}</p>
              <p className="sm:col-span-2"><span className="theme-muted">Address:</span> {viewPatient.address || "-"}</p>
            </div>
          </div>
        </div>
      )}

      {editingPatient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="theme-surface-strong rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleUpdatePatient}>
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-xl theme-heading">Edit Patient</h2>
                <p className="text-sm theme-copy mt-1">Update patient information below</p>
              </div>

              <div className="p-6 space-y-4">
                {patientFormError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">{patientFormError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm theme-copy mb-2">Full Name</label>
                    <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300">
                      {getTitlePrefix(patientForm.gender) && (
                        <span className="flex items-center border-r border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-600">
                          {getTitlePrefix(patientForm.gender).trim()}
                        </span>
                      )}
                      <input
                        type="text"
                        value={patientForm.fullName}
                        onChange={(e) => setPatientForm({ ...patientForm, fullName: stripTitlePrefix(e.target.value) })}
                        className="theme-input min-w-0 flex-1 px-4 py-2"
                        placeholder="Enter full name"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm theme-copy mb-2">Age</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={patientForm.age}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, age: e.target.value.replace(/\D/g, "").slice(0, 3) })
                      }
                      disabled={Boolean(patientForm.dateOfBirth)}
                      className="theme-input w-full px-4 py-2 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm theme-copy mb-2">Date of Birth</label>
                    <input
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={patientForm.dateOfBirth}
                      onChange={(e) =>
                        setPatientForm({
                          ...patientForm,
                          dateOfBirth: e.target.value,
                          age: calculateAgeFromDateOfBirth(e.target.value)
                        })
                      }
                      className="theme-input w-full px-4 py-2 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm theme-copy mb-2">Gender</label>
                    <div className="relative">
                      {!patientForm.gender && (
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                          Select gender
                        </span>
                      )}
                      <select
                        value={patientForm.gender || ""}
                        onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                        className="theme-input w-full rounded-lg px-4 py-2 bg-white"
                        required
                      >
                        <option value="" disabled hidden />
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm theme-copy mb-2">Phone</label>
                    <input
                      type="text"
                      value={patientForm.phone}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })
                      }
                      inputMode="numeric"
                      pattern="\d{10}"
                      minLength={10}
                      maxLength={10}
                      className="theme-input w-full px-4 py-2 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm theme-copy mb-2">Email</label>
                    <input
                      type="email"
                      value={patientForm.email}
                      onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                      className="theme-input w-full px-4 py-2 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm theme-copy mb-2">Blood Type</label>
                    {patientForm.bloodTypeMode === "other" ? (
                      <input
                        type="text"
                        value={patientForm.bloodType}
                        onChange={(e) => setPatientForm({ ...patientForm, bloodType: e.target.value })}
                        className="theme-input w-full px-4 py-2 rounded-lg"
                        placeholder="Enter blood group"
                      />
                    ) : (
                      <div className="relative">
                        {!isKnownBloodType(patientForm.bloodType) && (
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                            Select blood group
                          </span>
                        )}
                        <select
                          value={isKnownBloodType(patientForm.bloodType) ? normalizeBloodTypeSelection(patientForm.bloodType) : ""}
                          onChange={(e) =>
                            setPatientForm({
                              ...patientForm,
                              bloodType: e.target.value === "other" ? "" : e.target.value,
                              bloodTypeMode: e.target.value === "other" ? "other" : "select"
                            })
                          }
                          className="theme-input w-full rounded-lg px-4 py-2 bg-white"
                        >
                          <option value="" disabled hidden />
                          {BLOOD_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                          <option value="other">Other</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm theme-copy mb-2">Emergency Contact</label>
                    <input
                      type="text"
                      value={patientForm.emergencyContact}
                      onChange={(e) =>
                        setPatientForm({
                          ...patientForm,
                          emergencyContact: e.target.value.replace(/\D/g, "").slice(0, 10)
                        })
                      }
                      inputMode="numeric"
                      pattern="\d{10}"
                      minLength={10}
                      maxLength={10}
                      className="theme-input w-full px-4 py-2 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm theme-copy mb-2">Description</label>
                  <textarea
                    rows={3}
                    value={patientForm.description}
                    onChange={(e) => setPatientForm({ ...patientForm, description: e.target.value })}
                    className="theme-input w-full px-4 py-2 rounded-lg"
                    placeholder="Optional notes about the patient"
                  />
                </div>

                <div>
                  <label className="block text-sm theme-copy mb-2">Address</label>
                  <textarea
                    rows={3}
                    value={patientForm.address}
                    onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                    className="theme-input w-full px-4 py-2 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPatient(null);
                    setPatientForm(initialPatientForm);
                    setPatientFormError("");
                  }}
                  className="theme-button-secondary px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPatient}
                  className="theme-button-primary px-4 py-2 rounded-lg disabled:opacity-60"
                >
                  {isUpdatingPatient ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

