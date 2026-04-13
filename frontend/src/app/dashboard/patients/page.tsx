"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { canAccessPatients, canDeletePatients } from "@/lib/roles";
import { isUuid } from "@/lib/uuid";
import { Patient } from "@/types/api";
import NumberedPagination from "@/app/components/NumberedPagination";
import ModalCloseButton from "@/app/components/ModalCloseButton";

const BLOOD_TYPE_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

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

type GetPatientResponse = {
  success: boolean;
  data: Patient;
};

type MeResponse = {
  success: boolean;
  data: {
    role: string;
  };
};

type CreatePatientForm = {
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

const initialForm: CreatePatientForm = {
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

const PAGE_SIZE = 8;

const getStatusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-green-50 text-green-700";
  if (normalized.includes("follow")) return "bg-blue-50 text-blue-700";
  return "bg-yellow-50 text-yellow-700";
};

const calculateAgeFromDateOfBirth = (value: string) => {
  if (!value) {
    return "";
  }

  const dateOfBirth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dateOfBirth.getTime())) {
    return "";
  }

  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hasBirthdayPassed =
    now.getMonth() > dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() && now.getDate() >= dateOfBirth.getDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return String(Math.max(age, 0));
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

const stripTitlePrefix = (value: string) =>
  value.replace(/^(Mr\.|Miss\.|Mrs\.|Ms\.)\s*/i, "").trimStart();

const normalizeFullNameInput = (value: string) => stripTitlePrefix(value);

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

const patientMatchesQuery = (patient: Patient, currentQuery: string) => {
  const normalizedQuery = currentQuery.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [patient.patient_code, patient.full_name, patient.phone, patient.email]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalizedQuery));
};

export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
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
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [existingPatientIdHint, setExistingPatientIdHint] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState("");
  const [quickViewPatient, setQuickViewPatient] = useState<Patient | null>(null);
  const initialQuery = searchParams.get("q") || "";
  const isInitialLoading = isLoading && patients.length === 0;
  const isRefreshing = isLoading && patients.length > 0;

  const openEditModal = useCallback((patient: Patient) => {
    setFormError("");
    setExistingPatientIdHint(null);
    setEditingPatientId(patient.id);
    setFormData({
      fullName: normalizeFullNameInput(patient.full_name || ""),
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
    setShowModal(true);
  }, []);

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

    apiRequest<PatientsResponse>(`/patients?page=${currentPage}&limit=${PAGE_SIZE}${q}`, {
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
    setSearch(initialQuery);
    setQuery(initialQuery);
    fetchPatients(1, initialQuery);
  }, [fetchPatients, initialQuery]);

  useEffect(() => {
    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then((response) => setCurrentRole(response.data.role || ""))
      .catch(() => setCurrentRole(""));
  }, []);

  useEffect(() => {
    if (search === query) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
      fetchPatients(1, search);
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [search, query, fetchPatients]);

  useEffect(() => {
    const editPatientId = searchParams.get("edit");
    if (!editPatientId || showModal) {
      return;
    }

    const patientToEdit = patients.find((patient) => patient.id === editPatientId);
    if (patientToEdit) {
      openEditModal(patientToEdit);
      router.replace("/dashboard/patients");
      return;
    }

    apiRequest<GetPatientResponse>(`/patients/${editPatientId}`, {
      authenticated: true
    })
      .then((response) => {
        openEditModal(response.data);
        setPatients((currentPatients) => {
          if (currentPatients.some((patient) => patient.id === response.data.id)) {
            return currentPatients.map((patient) => (patient.id === response.data.id ? response.data : patient));
          }

          return [response.data, ...currentPatients];
        });
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load patient details");
      })
      .finally(() => {
        router.replace("/dashboard/patients");
      });
  }, [openEditModal, patients, router, searchParams, showModal]);

  const handleCreateOrUpdatePatient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError("");
    setExistingPatientIdHint(null);

    try {
      const body = {
        fullName: `${getTitlePrefix(formData.gender)}${stripTitlePrefix(formData.fullName)}`,
        age: formData.age ? Number(formData.age) : null,
        ...(formData.dateOfBirth ? { dateOfBirth: formData.dateOfBirth } : {}),
        gender: formData.gender,
        phone: formData.phone,
        email: formData.email || null,
        bloodType: formData.bloodType ? formData.bloodType.trim() : null,
        description: formData.description || null,
        emergencyContact: formData.emergencyContact || null,
        address: formData.address || null,
        status: "active"
      };

      if (editingPatientId) {
        const response = await apiRequest<UpdatePatientResponse>(`/patients/${editingPatientId}`, {
          method: "PATCH",
          authenticated: true,
          body
        });

        const updatedPatient = response.data;
        const matchesCurrentQuery = patientMatchesQuery(updatedPatient, query);

        setPatients((currentPatients) => {
          const nextPatients = currentPatients
            .map((patient) => (patient.id === updatedPatient.id ? updatedPatient : patient))
            .filter((patient) => patient.id !== updatedPatient.id || matchesCurrentQuery);

          if (!matchesCurrentQuery) {
            return nextPatients;
          }

          return nextPatients;
        });
      } else {
        const response = await apiRequest<CreatePatientResponse>("/patients", {
          method: "POST",
          authenticated: true,
          body
        });

        const createdPatient = response.data;
        const matchesCurrentQuery = patientMatchesQuery(createdPatient, query);

        if (matchesCurrentQuery) {
          setPatients((currentPatients) =>
            [createdPatient, ...currentPatients.filter((patient) => patient.id !== createdPatient.id)].slice(0, PAGE_SIZE)
          );
        }

        setTotalPatients((current) => {
          const nextTotal = current + 1;
          setTotalPages(Math.max(1, Math.ceil(nextTotal / PAGE_SIZE)));
          return nextTotal;
        });
        setPage(1);
      }

      setShowModal(false);
      setFormData(initialForm);
      setEditingPatientId(null);

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
    if (!isUuid(patient.id)) {
      setError("This patient record has an invalid id and cannot be opened.");
      return;
    }

    router.push(`/dashboard/patients/${encodeURIComponent(patient.id)}`);
  };

  const handleEditPatient = (patient: Patient) => {
    openEditModal(patient);
  };

  const handleDeletePatient = async (patient: Patient) => {
    setPatientToDelete(patient);
  };

  const confirmDeletePatient = async () => {
    if (!patientToDelete) return;
    setDeletingPatientId(patientToDelete.id);
    setError("");
    const deletedPatientId = patientToDelete.id;
    const previousPatients = patients;
    const previousTotalPatients = totalPatients;

    setPatients((currentPatients) => currentPatients.filter((patient) => patient.id !== deletedPatientId));
    setTotalPatients((currentTotal) => Math.max(0, currentTotal - 1));

    try {
      await apiRequest<{ success: boolean; message: string }>(`/patients/${patientToDelete.id}`, {
        method: "DELETE",
        authenticated: true
      });

      const hasOnlyOnePatientOnPage = previousPatients.length === 1;

      if (hasOnlyOnePatientOnPage && page > 1) {
        const previousPage = page - 1;
        setPage(previousPage);
        fetchPatients(previousPage, query);
      } else {
        fetchPatients(page, query);
      }
    } catch (err) {
      setPatients(previousPatients);
      setTotalPatients(previousTotalPatients);
      const message = err instanceof Error ? err.message : "Failed to delete patient";
      setError(message);
    } finally {
      setPatientToDelete(null);
      setDeletingPatientId(null);
    }
  };

  if (currentRole && !canAccessPatients(currentRole)) {
    return <p className="text-red-600">You do not have access to patients.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-gray-900">Patients</h1>
          <p className="text-gray-600 mt-1">Manage and view all patient records</p>
        </div>
        <button
          data-testid="add-patient-button"
          data-tour-id="tour-patients-add"
          onClick={() => {
          setEditingPatientId(null);
          setFormData(initialForm);
          setFormError("");
          setExistingPatientIdHint(null);
          setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add New Patient
        </button>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="space-y-2">
          <span className="text-sm text-gray-700">Search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient ID, name, phone, or email..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
          />
        </label>
      </section>

      <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" aria-busy={isLoading}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Patient</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Age</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">DOB</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Gender</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Phone</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Email</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Last Visit</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Status</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoading && (
                <tr>
                  <td className="px-6 py-8 text-sm text-gray-500" colSpan={9}>
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
                      Loading patients...
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && patients.length === 0 && (
                <tr>
                  <td className="px-6 py-5 text-sm text-gray-500" colSpan={9}>
                    No patients found.
                  </td>
                </tr>
              )}

              {patients.map((patient) => (
                <tr
                  key={patient.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleViewPatient(patient)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleViewPatient(patient);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open profile for ${patient.full_name}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center text-white">
                        {patient.full_name
                          .split(" ")
                          .map((n) => n?.[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="text-gray-900">{patient.full_name}</p>
                        <p className="text-xs text-gray-500">{patient.patient_code}{patient.blood_type ? ` • ${patient.blood_type}` : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{patient.age ?? "-"}</td>
                  <td className="px-6 py-4 text-gray-600">{formatLastVisitDate(patient.date_of_birth)}</td>
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
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEditPatient(patient);
                        }}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                        title="Edit patient"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {canDeletePatients(currentRole) && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeletePatient(patient);
                          }}
                          disabled={deletingPatientId === patient.id}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-60"
                          title="Delete patient"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isRefreshing && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center border-b border-gray-200 bg-white/70 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
              Loading next page...
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-gray-600">Total patients: {totalPatients}</p>
          <NumberedPagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(nextPage) => fetchPatients(nextPage, query)}
            className="justify-start lg:justify-end"
            disabled={isLoading}
          />
        </div>
        {error && <p className="text-sm text-red-600 px-6 pb-4">{error}</p>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div data-testid="patient-form-modal" className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
                        className="text-sm text-emerald-700 mt-2 hover:underline"
                      >
                        Open existing patient record
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Full Name</label>
                    <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-300">
                      {getTitlePrefix(formData.gender) && (
                        <span className="flex items-center border-r border-gray-300 bg-gray-50 px-4 text-sm font-medium text-gray-600">
                          {getTitlePrefix(formData.gender).trim()}
                        </span>
                      )}
                      <input
                        data-testid="patient-full-name-input"
                        type="text"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: normalizeFullNameInput(e.target.value) })}
                        className="min-w-0 flex-1 px-4 py-2 outline-none"
                        placeholder="Enter full name"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Age</label>
                    <input
                      data-testid="patient-age-input"
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={formData.age}
                      onChange={(e) =>
                        setFormData({ ...formData, age: e.target.value.replace(/\D/g, "").slice(0, 3) })
                      }
                      disabled={Boolean(formData.dateOfBirth)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Date of Birth</label>
                    <input
                      data-testid="patient-dob-input"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      value={formData.dateOfBirth}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          dateOfBirth: e.target.value,
                          age: e.target.value ? calculateAgeFromDateOfBirth(e.target.value) : current.age
                        }))
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Gender</label>
                    <div className="relative">
                      {!formData.gender && (
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                          Select gender
                        </span>
                      )}
                      <select
                        data-testid="patient-gender-select"
                        value={formData.gender || ""}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2"
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
                    <label className="block text-sm text-gray-700 mb-2">Phone</label>
                    <input
                      data-testid="patient-phone-input"
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
                      data-testid="patient-email-input"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Blood Group</label>
                    {formData.bloodTypeMode === "other" ? (
                      <input
                        data-testid="patient-blood-type-input"
                        type="text"
                        value={formData.bloodType}
                        onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                        placeholder="Enter blood group"
                      />
                    ) : (
                      <div className="relative">
                        {!isKnownBloodType(formData.bloodType) && (
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                            Select blood group
                          </span>
                        )}
                        <select
                          data-testid="patient-blood-type-select"
                          value={isKnownBloodType(formData.bloodType) ? normalizeBloodTypeSelection(formData.bloodType) : ""}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bloodType: e.target.value === "other" ? "" : e.target.value,
                              bloodTypeMode: e.target.value === "other" ? "other" : "select"
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2"
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
                    <label className="block text-sm text-gray-700 mb-2">Emergency Contact</label>
                    <input
                      data-testid="patient-emergency-contact-input"
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
                  <label className="block text-sm text-gray-700 mb-2">Description</label>
                  <textarea
                    data-testid="patient-description-input"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="Optional notes about the patient"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">Address</label>
                  <textarea
                    data-testid="patient-address-input"
                    rows={3}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  data-testid="patient-cancel-button"
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
                  data-testid="patient-submit-button"
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : editingPatientId ? "Save Changes" : "Add Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {patientToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <div>
              <h2 className="text-lg text-gray-900">Delete Patient</h2>
              <p className="mt-2 text-sm text-gray-600">
                Delete <span className="text-gray-900">{patientToDelete.full_name}</span>? This action can be reverted only from database.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPatientToDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeletePatient}
                disabled={deletingPatientId === patientToDelete.id}
                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-60"
              >
                {deletingPatientId === patientToDelete.id ? "Deleting..." : "Delete Patient"}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickViewPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-200 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl text-gray-900">{quickViewPatient.full_name}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {quickViewPatient.patient_code}
                    {quickViewPatient.blood_type ? ` · ${quickViewPatient.blood_type}` : ""}
                  </p>
                </div>
                <ModalCloseButton onClick={() => setQuickViewPatient(null)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 px-6 py-5 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Age</p>
                <p className="mt-1 text-sm text-gray-900">{quickViewPatient.age ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Gender</p>
                <p className="mt-1 text-sm text-gray-900">{quickViewPatient.gender || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Phone</p>
                <p className="mt-1 text-sm text-gray-900">{quickViewPatient.phone || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Email</p>
                <p className="mt-1 text-sm text-gray-900">{quickViewPatient.email || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">DOB</p>
                <p className="mt-1 text-sm text-gray-900">{quickViewPatient.date_of_birth || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
                <p className="mt-1 text-sm text-gray-900">{quickViewPatient.status || "-"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">Description</p>
                <p className="mt-1 text-sm text-gray-900">{quickViewPatient.description || "No description added."}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-gray-500">Last Visit</p>
                <p className="mt-1 text-sm text-gray-900">{formatLastVisitDate(quickViewPatient.last_visit_at)}</p>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setQuickViewPatient(null);
                  handleEditPatient(quickViewPatient);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setQuickViewPatient(null)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


