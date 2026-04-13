"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, HeartPulse, Phone, Plus, RefreshCcw, Stethoscope, Users } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessCrm, isFullAccessRole } from "@/lib/roles";
import { AuthUser, CrmTask, Patient } from "@/types/api";
import ModalCloseButton from "@/app/components/ModalCloseButton";

type CrmTasksResponse = {
  success: boolean;
  data: {
    items: CrmTask[];
    summary: {
      totalTasks: number;
      openTasks: number;
      contactedTasks: number;
      scheduledTasks: number;
      closedTasks: number;
      overdueTasks: number;
      dueTodayTasks: number;
    };
  };
};

type PatientsResponse = {
  success: boolean;
  data: {
    items: Patient[];
  };
};

type PatientResponse = {
  success: boolean;
  data: Patient;
};

type UsersResponse = {
  success: boolean;
  data: {
    items: AuthUser[];
  };
};

type MeResponse = {
  success: boolean;
  data: AuthUser;
};

type CrmMutationResponse = {
  success: boolean;
  data: CrmTask;
};

type CrmAutoSuggestion = {
  patientId: string;
  patientCode: string | null;
  patientName: string;
  phone: string | null;
  medicalRecordId: string;
  diagnosis: string;
  recordDate: string;
  lastVisitAt: string | null;
  suggestionLabel: string;
  suggestedFollowUpDays: number;
  suggestedFollowUpDate: string | null;
  daysUntilSuggestedFollowUp: number | null;
  priority: CrmTask["priority"];
  rationale: string;
};

type CrmMissedFollowUp = {
  patientId: string;
  patientCode: string | null;
  patientName: string;
  phone: string | null;
  medicalRecordId: string;
  diagnosis: string | null;
  recordDate: string;
  followUpDate: string;
  reminderStatus: string;
  lastVisitAt: string | null;
  daysOverdue: number;
};

type CrmInactivePatient = {
  patientId: string;
  patientCode: string | null;
  patientName: string;
  phone: string | null;
  lastVisitAt: string | null;
  daysSinceLastVisit: number;
};

type CrmChronicPatient = {
  patientId: string;
  patientCode: string | null;
  patientName: string;
  phone: string | null;
  lastVisitAt: string | null;
  nextFollowUpDate: string | null;
  latestDiagnosis: string | null;
  repeatDiagnosisCount: number;
  conditionLabel: string;
  trackingReason: string;
};

type CrmIntelligenceResponse = {
  success: boolean;
  data: {
    summary: {
      autoSuggestions: number;
      missedFollowUps: number;
      inactive30Days: number;
      inactive60Days: number;
      chronicPatients: number;
    };
    autoSuggestions: CrmAutoSuggestion[];
    missedFollowUps: CrmMissedFollowUp[];
    inactive30Days: CrmInactivePatient[];
    inactive60Days: CrmInactivePatient[];
    chronicPatients: CrmChronicPatient[];
  };
};

type CreateTaskForm = {
  patientId: string;
  taskType: "follow_up" | "recall" | "retention";
  dueDate: string;
  priority: "high" | "medium" | "low";
  title: string;
  assignedUserId: string;
  outcomeNotes: string;
};

type EditTaskForm = {
  status: CrmTask["status"];
  priority: CrmTask["priority"];
  assignedUserId: string;
  nextActionAt: string;
  outcomeNotes: string;
};

const taskTypes: Array<CreateTaskForm["taskType"]> = ["follow_up", "recall", "retention"];
const taskStatuses: CrmTask["status"][] = ["open", "contacted", "scheduled", "not_reachable", "closed", "dismissed"];
const taskPriorities: CrmTask["priority"][] = ["high", "medium", "low"];
const LIST_PREVIEW_LIMIT = 6;

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
};

const formatDateTime = (value: string | null) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  });
};

const toDateTimeLocalInput = (value: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatTaskType = (value: string) => value.replace(/_/g, " ");

const formatStatus = (value: string) => value.replace(/_/g, " ");

const getPriorityTone = (priority: CrmTask["priority"]) => {
  if (priority === "high") return "bg-red-50 text-red-700 ring-red-200";
  if (priority === "medium") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-blue-50 text-blue-700 ring-blue-200";
};

const getDueTone = (task: CrmTask) => {
  if (["scheduled", "closed", "dismissed"].includes(task.status)) {
    return "bg-gray-100 text-gray-600 ring-gray-200";
  }

  if (task.days_until_due < 0) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (task.days_until_due === 0) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-blue-50 text-blue-700 ring-blue-200";
};

const getDueLabel = (task: CrmTask) => {
  if (["scheduled", "closed", "dismissed"].includes(task.status)) {
    return formatStatus(task.status);
  }

  if (task.days_until_due < 0) {
    const overdueDays = Math.abs(task.days_until_due);
    return `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`;
  }

  if (task.days_until_due === 0) {
    return "Due today";
  }

  return `Due in ${task.days_until_due} day${task.days_until_due === 1 ? "" : "s"}`;
};

const getSignalTone = (priority: "high" | "medium" | "low") => {
  if (priority === "high") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
};

const buildDefaultCreateForm = (patientId = ""): CreateTaskForm => ({
  patientId,
  taskType: "follow_up",
  dueDate: new Date().toISOString().slice(0, 10),
  priority: "medium",
  title: "",
  assignedUserId: "",
  outcomeNotes: ""
});

const emptySmartFollowUp = {
  summary: {
    autoSuggestions: 0,
    missedFollowUps: 0,
    inactive30Days: 0,
    inactive60Days: 0,
    chronicPatients: 0
  },
  autoSuggestions: [] as CrmAutoSuggestion[],
  missedFollowUps: [] as CrmMissedFollowUp[],
  inactive30Days: [] as CrmInactivePatient[],
  inactive60Days: [] as CrmInactivePatient[],
  chronicPatients: [] as CrmChronicPatient[]
};

export default function CrmPage() {
  const searchParams = useSearchParams();
  const patientFilterId = searchParams.get("patientId") || "";
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [summary, setSummary] = useState<CrmTasksResponse["data"]["summary"]>({
    totalTasks: 0,
    openTasks: 0,
    contactedTasks: 0,
    scheduledTasks: 0,
    closedTasks: 0,
    overdueTasks: 0,
    dueTodayTasks: 0
  });
  const [smartFollowUp, setSmartFollowUp] = useState<CrmIntelligenceResponse["data"]>(emptySmartFollowUp);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    taskType: "",
    status: ""
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAllAutoSuggestions, setShowAllAutoSuggestions] = useState(false);
  const [showAllMissedFollowUps, setShowAllMissedFollowUps] = useState(false);
  const [showAllInactive30, setShowAllInactive30] = useState(false);
  const [showAllInactive60, setShowAllInactive60] = useState(false);
  const [showAllChronicPatients, setShowAllChronicPatients] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTask, setEditingTask] = useState<CrmTask | null>(null);
  const [createForm, setCreateForm] = useState<CreateTaskForm>(buildDefaultCreateForm(patientFilterId));
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientSearchRef = useRef<HTMLDivElement | null>(null);
  const [editForm, setEditForm] = useState<EditTaskForm>({
    status: "open",
    priority: "medium",
    assignedUserId: "",
    nextActionAt: "",
    outcomeNotes: ""
  });

  const patientOptions = useMemo(
    () => patients.map((patient) => ({ id: patient.id, label: `${patient.full_name} | ${patient.patient_code || patient.phone}` })),
    [patients]
  );
  const selectedCreatePatient = useMemo(
    () => patients.find((patient) => patient.id === createForm.patientId) || null,
    [createForm.patientId, patients]
  );
  const filteredPatientOptions = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) {
      return patientOptions;
    }

    return patientOptions.filter((patient) => patient.label.toLowerCase().includes(query));
  }, [patientOptions, patientSearch]);
  const visibleAutoSuggestions = showAllAutoSuggestions ? smartFollowUp.autoSuggestions : smartFollowUp.autoSuggestions.slice(0, LIST_PREVIEW_LIMIT);
  const visibleMissedFollowUps = showAllMissedFollowUps ? smartFollowUp.missedFollowUps : smartFollowUp.missedFollowUps.slice(0, LIST_PREVIEW_LIMIT);
  const visibleInactive30 = showAllInactive30 ? smartFollowUp.inactive30Days : smartFollowUp.inactive30Days.slice(0, LIST_PREVIEW_LIMIT);
  const visibleInactive60 = showAllInactive60 ? smartFollowUp.inactive60Days : smartFollowUp.inactive60Days.slice(0, LIST_PREVIEW_LIMIT);
  const visibleChronicPatients = showAllChronicPatients ? smartFollowUp.chronicPatients : smartFollowUp.chronicPatients.slice(0, LIST_PREVIEW_LIMIT);
  const visibleTasks = showAllTasks ? tasks : tasks.slice(0, LIST_PREVIEW_LIMIT);

  const loadTasks = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (patientFilterId) params.set("patientId", patientFilterId);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.taskType) params.set("taskType", filters.taskType);
    if (filters.status) params.set("status", filters.status);

    const response = await apiRequest<CrmTasksResponse>(`/crm/tasks?${params.toString()}`, { authenticated: true });
    setTasks(response.data.items || []);
    setSummary(response.data.summary);
  }, [filters.q, filters.status, filters.taskType, patientFilterId]);

  const loadSmartFollowUp = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "6");
    if (patientFilterId) {
      params.set("patientId", patientFilterId);
    }

    const response = await apiRequest<CrmIntelligenceResponse>(`/crm/intelligence?${params.toString()}`, {
      authenticated: true
    });
    setSmartFollowUp(response.data);
  }, [patientFilterId]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const meResponse = await apiRequest<MeResponse>("/auth/me", { authenticated: true });
      setCurrentUser(meResponse.data);
      const shouldLoadUsers = isFullAccessRole(meResponse.data.role);

      const requests: Array<Promise<unknown>> = [
        loadTasks(),
        loadSmartFollowUp(),
        apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true })
      ];

      if (shouldLoadUsers) {
        requests.push(apiRequest<UsersResponse>("/auth/users", { authenticated: true }));
      }

      const results = await Promise.allSettled(requests);

      const patientsResult = results[2];
      if (patientsResult.status === "fulfilled") {
        setPatients((patientsResult.value as PatientsResponse).data.items || []);
      }

      if (shouldLoadUsers) {
        const usersResult = results[3];
        if (usersResult.status === "fulfilled") {
          setUsers((usersResult.value as UsersResponse).data.items || []);
        }
      } else {
        setUsers([]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load CRM workspace");
    } finally {
      setLoading(false);
    }
  }, [loadSmartFollowUp, loadTasks]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setCreateForm(buildDefaultCreateForm(patientFilterId));
  }, [patientFilterId]);

  useEffect(() => {
    if (!showCreateForm) {
      setPatientSearch("");
      setShowPatientDropdown(false);
      return;
    }

    setPatientSearch(selectedCreatePatient?.full_name || "");
  }, [selectedCreatePatient, showCreateForm]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!patientSearchRef.current) {
        return;
      }

      if (!patientSearchRef.current.contains(event.target as Node)) {
        setShowPatientDropdown(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!patientFilterId || patients.some((patient) => patient.id === patientFilterId)) {
      return;
    }

    apiRequest<PatientResponse>(`/patients/${patientFilterId}`, { authenticated: true })
      .then((response) => {
        setPatients((current) => {
          if (current.some((patient) => patient.id === response.data.id)) {
            return current;
          }

          return [response.data, ...current];
        });
      })
      .catch(() => undefined);
  }, [patientFilterId, patients]);

  const resetEditForm = (task: CrmTask) => {
    setEditingTask(task);
    setEditForm({
      status: task.status,
      priority: task.priority,
      assignedUserId: task.assigned_user_id || "",
      nextActionAt: toDateTimeLocalInput(task.next_action_at),
      outcomeNotes: task.outcome_notes || ""
    });
  };

  const submitCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createForm.patientId) {
      setError("Select a patient from the dropdown.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await apiRequest<CrmMutationResponse>("/crm/tasks", {
        method: "POST",
        authenticated: true,
        body: {
          patientId: createForm.patientId,
          taskType: createForm.taskType,
          dueDate: createForm.dueDate,
          priority: createForm.priority,
          title: createForm.title.trim() || undefined,
          assignedUserId: createForm.assignedUserId || undefined,
          outcomeNotes: createForm.outcomeNotes.trim() || undefined
        }
      });

      setShowCreateForm(false);
      setCreateForm(buildDefaultCreateForm(patientFilterId));
      setPatientSearch("");
      setShowPatientDropdown(false);
      await Promise.all([loadTasks(), loadSmartFollowUp()]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create CRM task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitUpdateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTask) return;

    setIsSubmitting(true);
    setError("");

    try {
      await apiRequest<CrmMutationResponse>(`/crm/tasks/${editingTask.id}`, {
        method: "PATCH",
        authenticated: true,
        body: {
          status: editForm.status,
          priority: editForm.priority,
          assignedUserId: editForm.assignedUserId || null,
          nextActionAt: editForm.nextActionAt ? new Date(editForm.nextActionAt).toISOString() : null,
          outcomeNotes: editForm.outcomeNotes.trim() || null
        }
      });

      setEditingTask(null);
      await Promise.all([loadTasks(), loadSmartFollowUp()]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update CRM task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const prefillCreateTask = (payload: Partial<CreateTaskForm> & { patientId: string }) => {
    setEditingTask(null);
    setCreateForm({
      ...buildDefaultCreateForm(payload.patientId),
      ...payload
    });
    setPatientSearch("");
    setShowPatientDropdown(false);
    setShowCreateForm(true);
  };

  const selectCreatePatient = (patientId: string) => {
    const patient = patients.find((item) => item.id === patientId);
    if (!patient) {
      return;
    }

    setPatientSearch(patient.full_name);
    setCreateForm((current) => ({ ...current, patientId: patient.id }));
    setShowPatientDropdown(false);
  };

  const handlePatientSearchChange = (value: string) => {
    setPatientSearch(value);
    setShowPatientDropdown(true);

    if (!value.trim()) {
      setCreateForm((current) => ({ ...current, patientId: "" }));
    } else if (selectedCreatePatient && value.trim().toLowerCase() !== selectedCreatePatient.full_name.toLowerCase()) {
      setCreateForm((current) => ({ ...current, patientId: "" }));
    }
  };

  if (currentUser && !canAccessCrm(currentUser.role)) {
    return <p className="text-red-600">You do not have access to CRM.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-600">Patient Engagement</p>
          <h1 className="mt-2 text-2xl text-gray-900">CRM Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Track due follow-ups, recall candidates, and manual retention tasks with status ownership and outcome notes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void Promise.all([loadTasks(), loadSmartFollowUp()])}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          <button
            data-testid="crm-create-task-button"
            type="button"
            onClick={() => setShowCreateForm((current) => !current)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            New CRM Task
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Total Tasks</p>
          <p className="mt-3 text-2xl text-gray-900">{summary.totalTasks}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Open</p>
          <p className="mt-3 text-2xl text-gray-900">{summary.openTasks}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Due Today</p>
          <p className="mt-3 text-2xl text-gray-900">{summary.dueTodayTasks}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Overdue</p>
          <p className="mt-3 text-2xl text-gray-900">{summary.overdueTasks}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Smart Follow-up System</p>
            <h2 className="mt-2 text-xl text-gray-900">Signals that need action</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Auto-suggest follow-ups from diagnosis patterns, highlight missed reviews, segment inactive patients, and keep chronic cases visible.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-white/70 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Auto Suggestions</p>
            <p className="mt-3 text-2xl text-gray-900">{smartFollowUp.summary.autoSuggestions}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Missed Follow-ups</p>
            <p className="mt-3 text-2xl text-gray-900">{smartFollowUp.summary.missedFollowUps}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">30-59 Days Inactive</p>
            <p className="mt-3 text-2xl text-gray-900">{smartFollowUp.summary.inactive30Days}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">60+ Days Inactive</p>
            <p className="mt-3 text-2xl text-gray-900">{smartFollowUp.summary.inactive60Days}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Chronic Tracking</p>
            <p className="mt-3 text-2xl text-gray-900">{smartFollowUp.summary.chronicPatients}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <label className="space-y-2">
            <span className="text-sm text-gray-700">Search</span>
            <input
              value={filters.q}
              onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
              placeholder="Patient, patient ID, or task title"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-gray-700">Task Type</span>
            <select
              value={filters.taskType}
              onChange={(event) => setFilters((current) => ({ ...current, taskType: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
            >
              <option value="">All task types</option>
              {taskTypes.map((taskType) => (
                <option key={taskType} value={taskType}>
                  {formatTaskType(taskType)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm text-gray-700">Status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
            >
              <option value="">All statuses</option>
              {taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.16em] text-blue-700">Auto Follow-up Suggestions</p>
              <p className="mt-2 text-sm text-gray-600">Latest diagnoses without an explicit follow-up are converted into suggested review windows.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {smartFollowUp.autoSuggestions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No diagnosis-based follow-up suggestions right now.
              </p>
            ) : (
              visibleAutoSuggestions.map((item) => (
                <article key={item.medicalRecordId} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getSignalTone(item.priority)}`}>
                      {item.suggestionLabel}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">
                      {item.suggestedFollowUpDays} day review
                    </span>
                  </div>
                  <h3 className="mt-3 text-base text-gray-900">{item.patientName}</h3>
                  <p className="mt-1 text-sm text-gray-600">{item.patientCode ? `${item.patientCode} | ` : ""}{item.diagnosis}</p>
                  <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                    <p><span className="font-medium text-gray-900">Record Date:</span> {formatDate(item.recordDate)}</p>
                    <p><span className="font-medium text-gray-900">Suggested Date:</span> {formatDate(item.suggestedFollowUpDate)}</p>
                  </div>
                  <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-gray-700">{item.rationale}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        prefillCreateTask({
                          patientId: item.patientId,
                          taskType: "follow_up",
                          dueDate: item.suggestedFollowUpDate || new Date().toISOString().slice(0, 10),
                          priority: item.priority,
                          title: `Auto follow-up for ${item.patientName}`,
                          outcomeNotes: `Diagnosis: ${item.diagnosis}\nSuggested review: ${item.suggestedFollowUpDays} days\nReason: ${item.rationale}`
                        })
                      }
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                    >
                      Queue Task
                    </button>
                    <Link
                      href={`/dashboard/medical-records?patientId=${encodeURIComponent(item.patientId)}`}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Open Records
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
          {smartFollowUp.autoSuggestions.length > LIST_PREVIEW_LIMIT && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllAutoSuggestions((current) => !current)}
                className="rounded-lg border border-blue-200 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50"
              >
                {showAllAutoSuggestions ? "Show less" : "Show more"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-red-50 p-3 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.16em] text-red-700">Missed Follow-up Alerts</p>
              <p className="mt-2 text-sm text-gray-600">Patients who were due for follow-up but still have no completed return visit.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {smartFollowUp.missedFollowUps.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No missed follow-up alerts right now.
              </p>
            ) : (
              visibleMissedFollowUps.map((item) => (
                <article key={item.medicalRecordId} className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
                      Overdue by {item.daysOverdue} day{item.daysOverdue === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">
                      Reminder {item.reminderStatus}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base text-gray-900">{item.patientName}</h3>
                  <p className="mt-1 text-sm text-gray-600">{item.patientCode ? `${item.patientCode} | ` : ""}{item.diagnosis || "No diagnosis recorded"}</p>
                  <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                    <p><span className="font-medium text-gray-900">Due Date:</span> {formatDate(item.followUpDate)}</p>
                    <p><span className="font-medium text-gray-900">Last Visit:</span> {formatDate(item.lastVisitAt)}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        prefillCreateTask({
                          patientId: item.patientId,
                          taskType: "follow_up",
                          dueDate: new Date().toISOString().slice(0, 10),
                          priority: "high",
                          title: `Missed follow-up alert for ${item.patientName}`,
                          outcomeNotes: `Follow-up was due on ${item.followUpDate}. Overdue by ${item.daysOverdue} days. Reminder status: ${item.reminderStatus}.`
                        })
                      }
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                    >
                      Queue Alert Task
                    </button>
                    <Link
                      href={`/dashboard/appointments?patientId=${encodeURIComponent(item.patientId)}`}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Book Visit
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
          {smartFollowUp.missedFollowUps.length > LIST_PREVIEW_LIMIT && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllMissedFollowUps((current) => !current)}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                {showAllMissedFollowUps ? "Show less" : "Show more"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.16em] text-amber-700">Patients Not Visited In 30-59 Days</p>
              <p className="mt-2 text-sm text-gray-600">Patients drifting out of care before they become long-gap recall cases.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {smartFollowUp.inactive30Days.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No patients in the 30-59 day inactive bucket.
              </p>
            ) : (
              visibleInactive30.map((item) => (
                <article key={`inactive30-${item.patientId}`} className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                  <h3 className="text-base text-gray-900">{item.patientName}</h3>
                  <p className="mt-1 text-sm text-gray-600">{item.patientCode ? `${item.patientCode} | ` : ""}{item.daysSinceLastVisit} days since last visit</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        prefillCreateTask({
                          patientId: item.patientId,
                          taskType: "recall",
                          dueDate: new Date().toISOString().slice(0, 10),
                          priority: "medium",
                          title: `30-day recall for ${item.patientName}`,
                          outcomeNotes: `Patient has not visited for ${item.daysSinceLastVisit} days.`
                        })
                      }
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                    >
                      Create Recall
                    </button>
                    <Link
                      href={`/dashboard/patients/${item.patientId}`}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Open Patient
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
          {smartFollowUp.inactive30Days.length > LIST_PREVIEW_LIMIT && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllInactive30((current) => !current)}
                className="rounded-lg border border-amber-200 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50"
              >
                {showAllInactive30 ? "Show less" : "Show more"}
              </button>
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-rose-50 p-3 text-rose-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.16em] text-rose-700">Patients Not Visited In 60+ Days</p>
              <p className="mt-2 text-sm text-gray-600">Higher-risk recall patients who need stronger outreach and appointment recovery.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {smartFollowUp.inactive60Days.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No patients in the 60+ day inactive bucket.
              </p>
            ) : (
              visibleInactive60.map((item) => (
                <article key={`inactive60-${item.patientId}`} className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
                  <h3 className="text-base text-gray-900">{item.patientName}</h3>
                  <p className="mt-1 text-sm text-gray-600">{item.patientCode ? `${item.patientCode} | ` : ""}{item.daysSinceLastVisit} days since last visit</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        prefillCreateTask({
                          patientId: item.patientId,
                          taskType: "recall",
                          dueDate: new Date().toISOString().slice(0, 10),
                          priority: "high",
                          title: `60+ day recall for ${item.patientName}`,
                          outcomeNotes: `Patient has not visited for ${item.daysSinceLastVisit} days. Priority recall recommended.`
                        })
                      }
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                    >
                      Create Recall
                    </button>
                    {item.phone && (
                      <a
                        href={`tel:${item.phone}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Phone className="h-4 w-4" />
                        Call
                      </a>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
          {smartFollowUp.inactive60Days.length > LIST_PREVIEW_LIMIT && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllInactive60((current) => !current)}
                className="rounded-lg border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50"
              >
                {showAllInactive60 ? "Show less" : "Show more"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-emerald-700">Chronic Patient Tracking</p>
            <p className="mt-2 text-sm text-gray-600">Longitudinal visibility for repeat diagnoses and chronic conditions that need proactive follow-up.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {smartFollowUp.chronicPatients.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-500 xl:col-span-2">
              No chronic tracking candidates right now.
            </p>
          ) : (
            visibleChronicPatients.map((item) => (
              <article key={`chronic-${item.patientId}`} className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    {item.conditionLabel}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">
                    {item.repeatDiagnosisCount} repeated diagnoses
                  </span>
                </div>
                <h3 className="mt-3 text-base text-gray-900">{item.patientName}</h3>
                <p className="mt-1 text-sm text-gray-600">{item.patientCode ? `${item.patientCode} | ` : ""}{item.latestDiagnosis || "No diagnosis summary"}</p>
                <div className="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                  <p><span className="font-medium text-gray-900">Last Visit:</span> {formatDate(item.lastVisitAt)}</p>
                  <p><span className="font-medium text-gray-900">Next Follow-up:</span> {formatDate(item.nextFollowUpDate)}</p>
                </div>
                <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-gray-700">{item.trackingReason}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      prefillCreateTask({
                        patientId: item.patientId,
                        taskType: "retention",
                        dueDate: item.nextFollowUpDate || new Date().toISOString().slice(0, 10),
                        priority: item.nextFollowUpDate ? "medium" : "high",
                        title: `Chronic tracking for ${item.patientName}`,
                        outcomeNotes: `${item.conditionLabel}: ${item.trackingReason}`
                      })
                    }
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                  >
                    Create Tracking Task
                  </button>
                  <Link
                    href={`/dashboard/patients/${item.patientId}`}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Open Patient
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
        {smartFollowUp.chronicPatients.length > LIST_PREVIEW_LIMIT && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowAllChronicPatients((current) => !current)}
              className="rounded-lg border border-emerald-200 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
            >
              {showAllChronicPatients ? "Show less" : "Show more"}
            </button>
          </div>
        )}
      </section>

      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <section
            data-testid="crm-create-form"
            className="w-full max-w-4xl rounded-3xl border border-emerald-200 bg-emerald-50/95 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">New Task</p>
                <h2 className="mt-2 text-xl text-gray-900">Create CRM Task</h2>
              </div>
              <ModalCloseButton onClick={() => setShowCreateForm(false)} />
            </div>

            <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitCreateTask}>
              <div ref={patientSearchRef} className="relative space-y-2 lg:col-span-2">
                <span className="text-sm text-gray-700">Patient</span>
                <input
                  data-testid="crm-patient-search-input"
                  type="text"
                  value={patientSearch}
                  onFocus={() => setShowPatientDropdown(true)}
                  onChange={(event) => handlePatientSearchChange(event.target.value)}
                  placeholder="Search patient by name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                  required
                />
                {showPatientDropdown && filteredPatientOptions.length > 0 && (
                  <div
                    data-testid="crm-patient-dropdown"
                    className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                  >
                    {filteredPatientOptions.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => selectCreatePatient(patient.id)}
                        className="flex w-full flex-col gap-1 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-emerald-50"
                      >
                        <span className="text-sm font-medium text-gray-900">{patient.label.split(" | ")[0]}</span>
                        <span className="text-xs text-gray-500">{patient.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showPatientDropdown && patientSearch.trim() && filteredPatientOptions.length === 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-lg">
                    No patient matched the search.
                  </div>
                )}
              </div>

              <label className="space-y-2">
                <span className="text-sm text-gray-700">Task Type</span>
                <select
                  data-testid="crm-task-type-select"
                  value={createForm.taskType}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, taskType: event.target.value as CreateTaskForm["taskType"] }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                >
                  {taskTypes.map((taskType) => (
                    <option key={taskType} value={taskType}>
                      {formatTaskType(taskType)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-gray-700">Due Date</span>
                <input
                  data-testid="crm-due-date-input"
                  type="date"
                  value={createForm.dueDate}
                  onChange={(event) => setCreateForm((current) => ({ ...current, dueDate: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-gray-700">Priority</span>
                <select
                  data-testid="crm-priority-select"
                  value={createForm.priority}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, priority: event.target.value as CreateTaskForm["priority"] }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                >
                  {taskPriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              {isFullAccessRole(currentUser?.role) && (
                <label className="space-y-2">
                  <span className="text-sm text-gray-700">Assign To</span>
                  <select
                    data-testid="crm-assignee-select"
                    value={createForm.assignedUserId}
                    onChange={(event) => setCreateForm((current) => ({ ...current, assignedUserId: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} | {user.role}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm text-gray-700">Task Title</span>
                <input
                  data-testid="crm-title-input"
                  value={createForm.title}
                  onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Optional custom title"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                />
              </label>

              <label className="space-y-2 lg:col-span-2">
                <span className="text-sm text-gray-700">Notes</span>
                <textarea
                  data-testid="crm-notes-input"
                  rows={3}
                  value={createForm.outcomeNotes}
                  onChange={(event) => setCreateForm((current) => ({ ...current, outcomeNotes: event.target.value }))}
                  placeholder="Optional handoff notes or outreach context"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                />
              </label>

              <div className="lg:col-span-2 flex justify-end">
                <button
                  data-testid="crm-submit-button"
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : "Create Task"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
            Loading CRM workspace...
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            No CRM tasks matched the current filters.
          </div>
        ) : (
          visibleTasks.map((task) => (
            <article key={task.id} data-testid="crm-task-card" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${getPriorityTone(task.priority)}`}>
                      {task.priority}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${getDueTone(task)}`}>
                      {getDueLabel(task)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">
                      {formatTaskType(task.task_type)}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl text-gray-900">{task.title}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {task.patient_name} {task.patient_code ? `| ${task.patient_code}` : ""}
                    </p>
                  </div>
                  <div className="grid gap-3 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                    <p><span className="font-medium text-gray-900">Due:</span> {formatDate(task.due_date)}</p>
                    <p><span className="font-medium text-gray-900">Status:</span> {formatStatus(task.status)}</p>
                    <p><span className="font-medium text-gray-900">Assignee:</span> {task.assigned_user_name || "Unassigned"}</p>
                    <p><span className="font-medium text-gray-900">Record Type:</span> {task.record_type || "-"}</p>
                  </div>
                  {task.next_appointment_id && (
                    <p className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700 ring-1 ring-blue-100">
                      <CalendarDays className="h-4 w-4" />
                      Next appointment {formatDate(task.appointment_date || null)}
                    </p>
                  )}
                  {task.outcome_notes && (
                    <p className="max-w-3xl rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">
                      {task.outcome_notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link
                    href={`/dashboard/patients/${task.patient_id}`}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Open Patient
                  </Link>
                  <Link
                    href={`/dashboard/appointments?patientId=${encodeURIComponent(task.patient_id)}`}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Open Appointments
                  </Link>
                  {task.phone && (
                    <a
                      href={`tel:${task.phone}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Phone className="h-4 w-4" />
                      Call
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => resetEditForm(task)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
                  >
                    Manage Task
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
        {tasks.length > LIST_PREVIEW_LIMIT && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowAllTasks((current) => !current)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {showAllTasks ? "Show less" : "Show more"}
            </button>
          </div>
        )}
      </section>

      {editingTask && (
        <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Task Workflow</p>
              <h2 className="mt-2 text-xl text-gray-900">{editingTask.title}</h2>
            </div>
            <ModalCloseButton onClick={() => setEditingTask(null)} />
          </div>

          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitUpdateTask}>
            <label className="space-y-2">
              <span className="text-sm text-gray-700">Status</span>
              <select
                value={editForm.status}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, status: event.target.value as CrmTask["status"] }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
              >
                {taskStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatStatus(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-gray-700">Priority</span>
              <select
                value={editForm.priority}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, priority: event.target.value as CrmTask["priority"] }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
              >
                {taskPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>

            {isFullAccessRole(currentUser?.role) && (
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Assign To</span>
                <select
                  value={editForm.assignedUserId}
                  onChange={(event) => setEditForm((current) => ({ ...current, assignedUserId: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                >
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} | {user.role}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="space-y-2">
              <span className="text-sm text-gray-700">Next Action</span>
              <input
                type="datetime-local"
                value={editForm.nextActionAt}
                onChange={(event) => setEditForm((current) => ({ ...current, nextActionAt: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
              />
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm text-gray-700">Outcome Notes</span>
              <textarea
                rows={4}
                value={editForm.outcomeNotes}
                onChange={(event) => setEditForm((current) => ({ ...current, outcomeNotes: event.target.value }))}
                placeholder="Call outcome, patient preference, or booking note"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
              />
            </label>

            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600 lg:col-span-2">
              <p><span className="font-medium text-gray-900">Last Contacted:</span> {formatDateTime(editingTask.last_contacted_at)}</p>
              <p className="mt-2"><span className="font-medium text-gray-900">Created:</span> {formatDateTime(editingTask.created_at)}</p>
            </div>

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : "Update Task"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
