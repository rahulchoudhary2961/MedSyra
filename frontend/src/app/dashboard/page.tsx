"use client";

import { Users, FileText, UserRound, IndianRupee } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import StatCard from "../components/StatCard";
import RecentPatientsTable from "../components/RecentPatientsTable";
import PatientActivityTimeline from "../components/PatientActivityTimeline";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { isUuid } from "@/lib/uuid";
import { ActivityLog, Patient } from "@/types/api";

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
    recentActivity: ActivityLog[];
  };
};

type PatientsResponse = {
  success: boolean;
  data: {
    items: Patient[];
  };
};

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
  emergencyContact: "",
  address: ""
};

const formatRupee = (value: number) => `Rs. ${Number(value || 0).toLocaleString()}`;

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

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    todayAppointments: 0,
    todayRevenue: 0,
    pendingPayments: 0,
    noShows: 0
  });
  const [insights, setInsights] = useState({
    patientsDidNotReturn: 0,
    mostCommonIssue: {
      label: "-",
      count: 0
    },
    weeklyRevenue: 0,
    followUpsDueToday: 0
  });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [viewPatient, setViewPatient] = useState<Patient | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [patientForm, setPatientForm] = useState<EditPatientForm>(initialPatientForm);
  const [patientFormError, setPatientFormError] = useState("");
  const [isUpdatingPatient, setIsUpdatingPatient] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError("");

    Promise.all([
      apiRequest<DashboardResponse>("/dashboard/summary", { authenticated: true }),
      apiRequest<PatientsResponse>("/patients?limit=5", { authenticated: true })
    ])
      .then(([dashboardRes, patientsRes]) => {
        setStats(dashboardRes.data.stats);
        setInsights(dashboardRes.data.insights);
        setActivities(dashboardRes.data.recentActivity || []);
        setPatients(patientsRes.data.items || []);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load dashboard data");
      });
  }, []);

  useEffect(() => {
    Promise.all([
      apiRequest<DashboardResponse>("/dashboard/summary", { authenticated: true }),
      apiRequest<PatientsResponse>("/patients?limit=5", { authenticated: true })
    ])
      .then(([dashboardRes, patientsRes]) => {
        setStats(dashboardRes.data.stats);
        setInsights(dashboardRes.data.insights);
        setActivities(dashboardRes.data.recentActivity || []);
        setPatients(patientsRes.data.items || []);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load dashboard data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

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
      fullName: patient.full_name || "",
      age: patient.age?.toString() || "",
      dateOfBirth: patient.date_of_birth || "",
      gender: patient.gender || "",
      phone: patient.phone || "",
      email: patient.email || "",
      bloodType: patient.blood_type || "",
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
      fullName: patientForm.fullName,
      age: patientForm.age ? Number(patientForm.age) : null,
      ...(patientForm.dateOfBirth ? { dateOfBirth: patientForm.dateOfBirth } : {}),
      gender: patientForm.gender,
      phone: patientForm.phone,
      email: patientForm.email || null,
      bloodType: patientForm.bloodType ? patientForm.bloodType.trim().toUpperCase() : null,
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentPatientsTable patients={patients} onView={openViewPatient} onEdit={openEditPatient} />
        </div>

        <div>
          <PatientActivityTimeline items={activities} />
        </div>
      </div>

      {viewPatient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto p-4">
          <div className="theme-surface-strong rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl theme-heading">Patient Details</h2>
              <p className="text-sm theme-copy mt-1">
                {viewPatient.full_name}
                {viewPatient.patient_code ? ` • ${viewPatient.patient_code}` : ""}
              </p>
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
            <div className="p-6 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setViewPatient(null)}
                className="theme-button-secondary px-4 py-2 rounded-lg"
              >
                Close
              </button>
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
                    <input
                      type="text"
                      value={patientForm.fullName}
                      onChange={(e) => setPatientForm({ ...patientForm, fullName: e.target.value })}
                      className="theme-input w-full px-4 py-2 rounded-lg"
                      required
                    />
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
                    <select
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                      className="theme-input w-full px-4 py-2 rounded-lg"
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
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
                    <input
                      type="text"
                      value={patientForm.bloodType}
                      onChange={(e) => setPatientForm({ ...patientForm, bloodType: e.target.value })}
                      className="theme-input w-full px-4 py-2 rounded-lg"
                    />
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

