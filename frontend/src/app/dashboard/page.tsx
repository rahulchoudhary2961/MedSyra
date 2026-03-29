"use client";

import { Users, FileText, UserRound, IndianRupee } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import StatCard from "../components/StatCard";
import RecentPatientsTable from "../components/RecentPatientsTable";
import PatientActivityTimeline from "../components/PatientActivityTimeline";
import { apiRequest, ApiRequestError } from "@/lib/api";
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
  gender: "",
  phone: "",
  email: "",
  bloodType: "",
  emergencyContact: "",
  address: ""
};

const formatRupee = (value: number) => `Rs. ${Number(value || 0).toLocaleString()}`;

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    todayAppointments: 0,
    todayRevenue: 0,
    pendingPayments: 0,
    noShows: 0
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
    return <p className="text-gray-600">Loading dashboard...</p>;
  }

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-gray-900 space-y-1">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your clinic operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today Appointments" value={String(stats.todayAppointments)} change="Today" trend="up" icon={Users} color="blue" />
        <StatCard title="Today Revenue" value={formatRupee(stats.todayRevenue)} change="Today" trend="up" icon={IndianRupee} color="green" />
        <StatCard title="Pending Payments" value={String(stats.pendingPayments)} change="Open" trend="up" icon={FileText} color="emerald" />
        <StatCard title="No-shows" value={String(stats.noShows)} change="Today" trend="up" icon={UserRound} color="teal" />
      </div>

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
          <div className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl text-gray-900">Patient Details</h2>
              <p className="text-sm text-gray-600 mt-1">{viewPatient.full_name}</p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <p><span className="text-gray-500">Age:</span> {viewPatient.age ?? "-"}</p>
              <p><span className="text-gray-500">Gender:</span> {viewPatient.gender || "-"}</p>
              <p><span className="text-gray-500">Phone:</span> {viewPatient.phone || "-"}</p>
              <p><span className="text-gray-500">Email:</span> {viewPatient.email || "-"}</p>
              <p><span className="text-gray-500">Blood Type:</span> {viewPatient.blood_type || "-"}</p>
              <p><span className="text-gray-500">Emergency Contact:</span> {viewPatient.emergency_contact || "-"}</p>
              <p><span className="text-gray-500">Status:</span> {viewPatient.status || "-"}</p>
              <p><span className="text-gray-500">Last Visit:</span> {formatLastVisitDate(viewPatient.last_visit_at)}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Address:</span> {viewPatient.address || "-"}</p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setViewPatient(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editingPatient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleUpdatePatient}>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl text-gray-900">Edit Patient</h2>
                <p className="text-sm text-gray-600 mt-1">Update patient information below</p>
              </div>

              <div className="p-6 space-y-4">
                {patientFormError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">{patientFormError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={patientForm.fullName}
                      onChange={(e) => setPatientForm({ ...patientForm, fullName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Age</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={patientForm.age}
                      onChange={(e) =>
                        setPatientForm({ ...patientForm, age: e.target.value.replace(/\D/g, "").slice(0, 3) })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Gender</label>
                    <select
                      value={patientForm.gender}
                      onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Phone</label>
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={patientForm.email}
                      onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Blood Type</label>
                    <input
                      type="text"
                      value={patientForm.bloodType}
                      onChange={(e) => setPatientForm({ ...patientForm, bloodType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Emergency Contact</label>
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">Address</label>
                  <textarea
                    rows={3}
                    value={patientForm.address}
                    onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPatient(null);
                    setPatientForm(initialPatientForm);
                    setPatientFormError("");
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingPatient}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
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

