"use client";

import { useCallback, useEffect, useState } from "react";
import { Edit2, Eye, Plus, Search, Trash2 } from "lucide-react";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { Patient } from "@/types/api";

type PatientsResponse = {
  success: boolean;
  data: {
    items: Patient[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type CreatePatientResponse = {
  success: boolean;
  data: Patient;
};

type UpdatePatientResponse = {
  success: boolean;
  data: Patient;
};

type CreatePatientForm = {
  fullName: string;
  age: string;
  gender: string;
  phone: string;
  email: string;
  bloodType: string;
  emergencyContact: string;
  address: string;
};

const initialForm: CreatePatientForm = {
  fullName: "",
  age: "",
  gender: "",
  phone: "",
  email: "",
  bloodType: "",
  emergencyContact: "",
  address: ""
};

const getStatusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-green-50 text-green-700";
  if (normalized.includes("follow")) return "bg-blue-50 text-blue-700";
  return "bg-yellow-50 text-yellow-700";
};

export default function PatientsPage() {
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPatients, setTotalPatients] = useState(0);
  const [formData, setFormData] = useState<CreatePatientForm>(initialForm);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [existingPatientIdHint, setExistingPatientIdHint] = useState<string | null>(null);

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

  const fetchPatients = useCallback((currentPage: number, currentQuery: string) => {
    setIsLoading(true);
    setError("");

    const q = currentQuery.trim() ? `&q=${encodeURIComponent(currentQuery.trim())}` : "";

    apiRequest<PatientsResponse>(`/patients?page=${currentPage}&limit=20${q}`, {
      authenticated: true
    })
      .then((response) => {
        setPatients(response.data.items || []);
        setPage(response.data.pagination?.page || currentPage);
        setTotalPages(response.data.pagination?.totalPages || 1);
        setTotalPatients(response.data.pagination?.total || 0);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load patients");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchPatients(1, "");
  }, [fetchPatients]);

  const handleCreateOrUpdatePatient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError("");
    setExistingPatientIdHint(null);

    try {
      const body = {
        fullName: formData.fullName,
        age: formData.age ? Number(formData.age) : null,
        gender: formData.gender,
        phone: formData.phone,
        email: formData.email || null,
        bloodType: formData.bloodType ? formData.bloodType.trim().toUpperCase() : null,
        emergencyContact: formData.emergencyContact || null,
        address: formData.address || null,
        status: "active"
      };

      if (editingPatientId) {
        await apiRequest<UpdatePatientResponse>(`/patients/${editingPatientId}`, {
          method: "PATCH",
          authenticated: true,
          body
        });
      } else {
        await apiRequest<CreatePatientResponse>("/patients", {
          method: "POST",
          authenticated: true,
          body
        });
      }

      setShowModal(false);
      setFormData(initialForm);
      setEditingPatientId(null);
      fetchPatients(1, query);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        const details = (err.details || {}) as { existingPatientId?: string };
        setExistingPatientIdHint(details.existingPatientId || null);
      }

      const message = err instanceof Error ? err.message : "Failed to save patient";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openExistingPatientRecord = () => {
    if (!existingPatientIdHint) return;
    const existing = patients.find((patient) => patient.id === existingPatientIdHint);
    if (existing) {
      setShowModal(false);
      handleViewPatient(existing);
    }
  };

  const handleViewPatient = async (patient: Patient) => {
    setError("");
    try {
      const response = await apiRequest<{ success: boolean; data: Patient }>(`/patients/${patient.id}`, {
        authenticated: true
      });
      setSelectedPatient(response.data);
      setShowViewModal(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load patient details";
      setError(message);
    }
  };

  const handleEditPatient = (patient: Patient) => {
    setEditingPatientId(patient.id);
    setFormData({
      fullName: patient.full_name || "",
      age: patient.age?.toString() || "",
      gender: patient.gender || "",
      phone: patient.phone || "",
      email: patient.email || "",
      bloodType: patient.blood_type || "",
      emergencyContact: patient.emergency_contact || "",
      address: patient.address || ""
    });
    setShowModal(true);
  };

  const handleDeletePatient = async (patient: Patient) => {
    const confirmed = window.confirm(`Delete patient "${patient.full_name}"? This action can be reverted only from database.`);
    if (!confirmed) return;

    setDeletingPatientId(patient.id);
    setError("");

    try {
      await apiRequest<{ success: boolean; message: string }>(`/patients/${patient.id}`, {
        method: "DELETE",
        authenticated: true
      });

      fetchPatients(page, query);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete patient";
      setError(message);
    } finally {
      setDeletingPatientId(null);
    }
  };

  const runSearch = () => {
    setQuery(search);
    setPage(1);
    fetchPatients(1, search);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-gray-900">Patients</h1>
          <p className="text-gray-600 mt-1">Manage and view all patient records</p>
        </div>
        <button
          onClick={() => {
            setEditingPatientId(null);
            setFormData(initialForm);
            setFormError("");
            setExistingPatientIdHint(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add New Patient
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-4 py-2 flex-1">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search by name, phone, or email..."
              className="bg-transparent border-none outline-none flex-1 text-sm"
            />
          </div>
          <button
            onClick={runSearch}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Patient Name</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Age</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Gender</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Phone</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Email</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Last Visit</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Status</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="px-6 py-5 text-sm text-gray-500" colSpan={8}>
                    Loading patients...
                  </td>
                </tr>
              )}

              {!isLoading && patients.length === 0 && (
                <tr>
                  <td className="px-6 py-5 text-sm text-gray-500" colSpan={8}>
                    No patients found.
                  </td>
                </tr>
              )}

              {patients.map((patient) => (
                <tr key={patient.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white">
                        {patient.full_name
                          .split(" ")
                          .map((n) => n?.[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="text-gray-900">{patient.full_name}</p>
                        <p className="text-xs text-gray-500">{patient.blood_type || "-"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{patient.age ?? "-"}</td>
                  <td className="px-6 py-4 text-gray-600">{patient.gender}</td>
                  <td className="px-6 py-4 text-gray-600">{patient.phone}</td>
                  <td className="px-6 py-4 text-gray-600">{patient.email || "-"}</td>
                  <td className="px-6 py-4 text-gray-600">{formatLastVisitDate(patient.last_visit_at)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusClass(patient.status)}`}>
                      {patient.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewPatient(patient)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                        title="View patient"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditPatient(patient)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                        title="Edit patient"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletePatient(patient)}
                        disabled={deletingPatientId === patient.id}
                        className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-60"
                        title="Delete patient"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-600">Total patients: {totalPatients}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchPatients(Math.max(1, page - 1), query)}
              disabled={page <= 1 || isLoading}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => fetchPatients(Math.min(totalPages, page + 1), query)}
              disabled={page >= totalPages || isLoading}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 px-6 pb-4">{error}</p>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleCreateOrUpdatePatient}>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl text-gray-900">{editingPatientId ? "Edit Patient" : "Add New Patient"}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {editingPatientId ? "Update patient information below" : "Fill in the patient information below"}
                </p>
              </div>

              <div className="p-6 space-y-4">
                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">{formError}</p>
                    {existingPatientIdHint && (
                      <button
                        type="button"
                        onClick={openExistingPatientRecord}
                        className="text-sm text-cyan-700 mt-2 hover:underline"
                      >
                        Open existing patient record
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Age</label>
                    <input
                      type="number"
                      min={1}
                      max={130}
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Gender</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
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
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
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
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Blood Type</label>
                    <input
                      type="text"
                      value={formData.bloodType}
                      onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Emergency Contact</label>
                    <input
                      type="text"
                      value={formData.emergencyContact}
                      onChange={(e) =>
                        setFormData({ ...formData, emergencyContact: e.target.value.replace(/\D/g, "").slice(0, 10) })
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
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingPatientId(null);
                    setFormData(initialForm);
                    setFormError("");
                    setExistingPatientIdHint(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : editingPatientId ? "Save Changes" : "Add Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showViewModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl text-gray-900">Patient Details</h2>
              <p className="text-sm text-gray-600 mt-1">{selectedPatient.full_name}</p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <p><span className="text-gray-500">Age:</span> {selectedPatient.age ?? "-"}</p>
              <p><span className="text-gray-500">Gender:</span> {selectedPatient.gender || "-"}</p>
              <p><span className="text-gray-500">Phone:</span> {selectedPatient.phone || "-"}</p>
              <p><span className="text-gray-500">Email:</span> {selectedPatient.email || "-"}</p>
              <p><span className="text-gray-500">Blood Type:</span> {selectedPatient.blood_type || "-"}</p>
              <p><span className="text-gray-500">Emergency Contact:</span> {selectedPatient.emergency_contact || "-"}</p>
              <p><span className="text-gray-500">Status:</span> {selectedPatient.status || "-"}</p>
              <p><span className="text-gray-500">Last Visit:</span> {formatLastVisitDate(selectedPatient.last_visit_at)}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Address:</span> {selectedPatient.address || "-"}</p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedPatient(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

