"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Phone, Plus, RefreshCcw, Users } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessCrm, isFullAccessRole } from "@/lib/roles";
import { AuthUser, CrmTask, Patient } from "@/types/api";

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

type UsersResponse = {
  success: boolean;
  data: AuthUser[];
};

type MeResponse = {
  success: boolean;
  data: AuthUser;
};

type CrmMutationResponse = {
  success: boolean;
  data: CrmTask;
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

const buildDefaultCreateForm = (patientId = ""): CreateTaskForm => ({
  patientId,
  taskType: "follow_up",
  dueDate: new Date().toISOString().slice(0, 10),
  priority: "medium",
  title: "",
  assignedUserId: "",
  outcomeNotes: ""
});

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    taskType: "",
    status: ""
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTask, setEditingTask] = useState<CrmTask | null>(null);
  const [createForm, setCreateForm] = useState<CreateTaskForm>(buildDefaultCreateForm(patientFilterId));
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

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const meResponse = await apiRequest<MeResponse>("/auth/me", { authenticated: true });
      setCurrentUser(meResponse.data);

      const requests: Array<Promise<unknown>> = [
        loadTasks(),
        apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true })
      ];

      if (isFullAccessRole(meResponse.data.role)) {
        requests.push(apiRequest<UsersResponse>("/auth/users", { authenticated: true }));
      }

      const [, patientsResponse, usersResponse] = await Promise.all(requests);
      setPatients((patientsResponse as PatientsResponse).data.items || []);
      setUsers((usersResponse as UsersResponse | undefined)?.data || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load CRM workspace");
    } finally {
      setLoading(false);
    }
  }, [loadTasks]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setCreateForm(buildDefaultCreateForm(patientFilterId));
  }, [patientFilterId]);

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
      await loadTasks();
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
      await loadTasks();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update CRM task");
    } finally {
      setIsSubmitting(false);
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
            onClick={() => void loadTasks()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          <button
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

      {showCreateForm && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">New Task</p>
              <h2 className="mt-2 text-xl text-gray-900">Create CRM Task</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-emerald-200 px-3 py-2 text-sm text-emerald-800 hover:bg-white"
            >
              Close
            </button>
          </div>

          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitCreateTask}>
            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm text-gray-700">Patient</span>
              <select
                value={createForm.patientId}
                onChange={(event) => setCreateForm((current) => ({ ...current, patientId: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
                required
              >
                <option value="">Select patient</option>
                {patientOptions.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-gray-700">Task Type</span>
              <select
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
                value={createForm.title}
                onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Optional custom title"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
              />
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm text-gray-700">Notes</span>
              <textarea
                rows={3}
                value={createForm.outcomeNotes}
                onChange={(event) => setCreateForm((current) => ({ ...current, outcomeNotes: event.target.value }))}
                placeholder="Optional handoff notes or outreach context"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
              />
            </label>

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : "Create Task"}
              </button>
            </div>
          </form>
        </section>
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
          tasks.map((task) => (
            <article key={task.id} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
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
      </section>

      {editingTask && (
        <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Task Workflow</p>
              <h2 className="mt-2 text-xl text-gray-900">{editingTask.title}</h2>
            </div>
            <button
              type="button"
              onClick={() => setEditingTask(null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
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
