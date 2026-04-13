"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, Link as LinkIcon, Mail, Phone, Plus, Star, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessDoctors, canManageDoctors, isFullAccessRole } from "@/lib/roles";
import { Doctor } from "@/types/api";
import NumberedPagination from "@/app/components/NumberedPagination";

type DoctorsResponse = {
  success: boolean;
  data: {
    items: Doctor[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type CreateDoctorResponse = {
  success: boolean;
  data: Doctor;
};

type DoctorUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

type UsersResponse = {
  success: boolean;
  data: {
    items: DoctorUser[];
  };
};

type MeResponse = {
  success: boolean;
  data: {
    role: string;
  };
};

type DoctorForm = {
  fullName: string;
  specialty: string;
  experienceYears: string;
  availability: string;
  phone: string;
  email: string;
  userId: string;
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  weeklyOffDays: string;
  holidayDates: string;
  consultationFee: string;
};

const availabilityOptions = [
  { value: "morning-shift", label: "Morning Shift", description: "Best for OPD or half-day clinics" },
  { value: "day-shift", label: "Day Shift", description: "Standard full working day" },
  { value: "evening-shift", label: "Evening Shift", description: "Late clinic availability" },
  { value: "weekdays", label: "Weekdays Only", description: "Regular Monday to Friday schedule" },
  { value: "custom", label: "Custom Schedule", description: "Use your own working hours below" }
];

const hourOptions = Array.from({ length: 12 }, (_, index) => {
  const hour = index + 1;

  return {
    value: String(hour),
    label: String(hour)
  };
});

const periodOptions = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" }
];

const weekdayOptions = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" }
];

const formatWeeklyOffDays = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  const labels = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => weekdayOptions.find((option) => option.value === item)?.label || item);

  return labels.length ? labels.join(", ") : "-";
};

const parseTimeParts = (value: string) => {
  const [hoursRaw] = (value || "10:00").split(":");
  const hours24 = Number(hoursRaw);

  if (!Number.isFinite(hours24)) {
    return { hour: "10", period: "AM" };
  }

  const period = hours24 >= 12 ? "PM" : "AM";
  const normalizedHour = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return {
    hour: String(normalizedHour),
    period
  };
};

const buildTimeValue = (hourValue: string, periodValue: string) => {
  const normalizedHour = Number(hourValue) || 12;
  let hours24 = normalizedHour % 12;

  if (periodValue === "PM") {
    hours24 += 12;
  }

  return `${String(hours24).padStart(2, "0")}:00`;
};

const initialForm: DoctorForm = {
  fullName: "",
  specialty: "",
  experienceYears: "",
  availability: "day-shift",
  phone: "",
  email: "",
  userId: "",
  workStartTime: "10:00",
  workEndTime: "18:00",
  breakStartTime: "13:00",
  breakEndTime: "14:00",
  weeklyOffDays: "",
  holidayDates: "",
  consultationFee: ""
};

export default function DoctorsPage() {
  const searchParams = useSearchParams();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorUsers, setDoctorUsers] = useState<DoctorUser[]>([]);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doctorToDelete, setDoctorToDelete] = useState<Doctor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDoctors, setTotalDoctors] = useState(0);
  const [form, setForm] = useState<DoctorForm>(initialForm);
  const initialQuery = searchParams.get("q") || "";
  const isInitialLoading = loading && doctors.length === 0;
  const isRefreshing = loading && doctors.length > 0;

  const resetForm = useCallback(() => {
    setForm(initialForm);
  }, []);

  const loadDoctors = useCallback((currentPage: number, currentQuery: string) => {
    setLoading(true);
    setError("");
    const q = currentQuery.trim() ? `&q=${encodeURIComponent(currentQuery.trim())}` : "";

    apiRequest<DoctorsResponse>(`/doctors?page=${currentPage}&limit=12${q}`, { authenticated: true })
      .then((response) => {
        setDoctors(response.data.items || []);
        setPage(response.data.pagination?.page || currentPage);
        setTotalPages(response.data.pagination?.totalPages || 1);
        setTotalDoctors(response.data.pagination?.total || 0);
      })
      .catch((err: Error) => setError(err.message || "Failed to load doctors"))
      .finally(() => setLoading(false));
  }, []);

  const loadDoctorUsers = useCallback(() => {
    setLoadingUsers(true);
    apiRequest<UsersResponse>("/auth/users?role=doctor", { authenticated: true })
      .then((response) => setDoctorUsers(response.data.items || []))
      .catch(() => setDoctorUsers([]))
      .finally(() => setLoadingUsers(false));
  }, []);

  const loadCurrentUser = useCallback(() => {
    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then((response) => setCurrentRole(response.data.role || null))
      .catch(() => setCurrentRole(null));
  }, []);

  useEffect(() => {
    setSearch(initialQuery);
    setQuery(initialQuery);
    loadDoctors(1, initialQuery);
    loadDoctorUsers();
    loadCurrentUser();
  }, [loadDoctors, loadDoctorUsers, loadCurrentUser, initialQuery]);

  useEffect(() => {
    if (search === query) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
      loadDoctors(1, search);
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [search, query, loadDoctors]);

  const linkedUserIds = useMemo(() => new Set(doctors.map((doctor) => doctor.user_id).filter(Boolean)), [doctors]);
  const availableDoctorUsers = useMemo(
    () => doctorUsers.filter((user) => !linkedUserIds.has(user.id) || user.id === form.userId),
    [doctorUsers, linkedUserIds, form.userId]
  );
  const selectedDoctorUser = useMemo(
    () => doctorUsers.find((user) => user.id === form.userId) || null,
    [doctorUsers, form.userId]
  );
  const linkedDoctorsCount = useMemo(
    () => doctors.filter((doctor) => Boolean(doctor.user_id)).length,
    [doctors]
  );
  const customScheduleCount = useMemo(
    () => doctors.filter((doctor) => Boolean(doctor.work_start_time && doctor.work_end_time)).length,
    [doctors]
  );

  const handleFormChange = <K extends keyof DoctorForm>(key: K, value: DoctorForm[K]) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "userId") {
        const linked = doctorUsers.find((user) => user.id === value);
        if (linked) {
          next.email = current.email || linked.email;
          next.fullName = current.fullName || linked.full_name;
        }
      }
      return next;
    });
  };

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await apiRequest<CreateDoctorResponse>("/doctors", {
        method: "POST",
        authenticated: true,
        body: {
          fullName: form.fullName,
          specialty: form.specialty,
          experienceYears: form.experienceYears ? Number(form.experienceYears) : null,
          availability: form.availability || null,
          phone: form.phone || null,
          email: form.email || null,
          userId: form.userId || null,
          workStartTime: form.workStartTime || null,
          workEndTime: form.workEndTime || null,
          breakStartTime: form.breakStartTime || null,
          breakEndTime: form.breakEndTime || null,
          weeklyOffDays: form.weeklyOffDays || null,
          holidayDates: form.holidayDates || null,
          consultationFee: form.consultationFee ? Number(form.consultationFee) : null,
          status: "available"
        }
      });
      setShowCreate(false);
      resetForm();
      loadDoctors(1, query);
      loadDoctorUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create doctor";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDoctor = async () => {
    if (!doctorToDelete) return;

    setIsDeleting(true);
    setError("");

    try {
      await apiRequest<{ success: boolean; message: string }>(`/doctors/${doctorToDelete.id}`, {
        method: "DELETE",
        authenticated: true
      });

      setDoctors((currentDoctors) => currentDoctors.filter((doctor) => doctor.id !== doctorToDelete.id));
      setTotalDoctors((current) => {
        const nextTotal = Math.max(0, current - 1);
        setTotalPages(Math.max(1, Math.ceil(nextTotal / 12)));
        return nextTotal;
      });
      setDoctorToDelete(null);
      loadDoctorUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete doctor";
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const canCreateDoctors = canManageDoctors(currentRole);
  const canDeleteDoctors = isFullAccessRole(currentRole);

  if (currentRole && !canAccessDoctors(currentRole)) {
    return <p className="text-red-600">You do not have access to doctors.</p>;
  }

  const toggleWeeklyOffDay = (weekday: string) => {
    setForm((current) => {
      const activeDays = new Set(
        current.weeklyOffDays
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      );

      if (activeDays.has(weekday)) {
        activeDays.delete(weekday);
      } else {
        activeDays.add(weekday);
      }

      const orderedDays = weekdayOptions.map((option) => option.value).filter((value) => activeDays.has(value));

      return {
        ...current,
        weeklyOffDays: orderedDays.join(",")
      };
    });
  };

  const renderTimeField = (
    label: string,
    value: string,
    onChange: (nextValue: string) => void
  ) => {
    const parts = parseTimeParts(value);

    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <label className="block text-sm text-gray-700 mb-2">{label}</label>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
          <select
            value={parts.hour}
            onChange={(e) => onChange(buildTimeValue(e.target.value, parts.period))}
            className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg"
          >
            {hourOptions.map((option) => (
              <option key={`${label}-hour-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={parts.period}
            onChange={(e) => onChange(buildTimeValue(parts.hour, e.target.value))}
            className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg"
          >
            {periodOptions.map((option) => (
              <option key={`${label}-period-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-gray-900">Doctors</h1>
          <p className="text-gray-600 mt-1">Manage medical staff and link doctor profiles to login accounts</p>
        </div>
        {canCreateDoctors && (
          <button
            data-tour-id="tour-doctors-add"
            data-testid="add-doctor-button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add New Doctor
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Doctor Profiles</p>
          <p className="mt-2 text-2xl text-gray-900">{totalDoctors}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Linked Login Accounts</p>
          <p className="mt-2 text-2xl text-gray-900">{linkedDoctorsCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Custom Work Hours</p>
          <p className="mt-2 text-2xl text-gray-900">{customScheduleCount}</p>
        </div>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="space-y-2">
          <span className="text-sm text-gray-700">Search</span>
          <input
            data-testid="doctor-search-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, specialty, email or phone"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
          />
        </label>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {isInitialLoading && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
            Loading doctors...
          </div>
        </div>
      )}
      {!loading && doctors.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No doctor profiles found for the current search.
        </div>
      )}

      <div className="relative">
        {isRefreshing && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-4 py-3">
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
              Loading next page...
            </div>
          </div>
        )}

        <div className={`grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 ${isRefreshing ? "opacity-75" : ""}`}>
          {doctors.map((doctor) => (
          <div key={doctor.id} data-testid="doctor-card" className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-full flex items-center justify-center text-white text-xl">
                  {doctor.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h3 className="text-gray-900">{doctor.full_name}</h3>
                  <p className="text-sm text-emerald-600 mt-0.5">{doctor.specialty}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm text-gray-600">{doctor.rating || 0}</span>
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-1 text-xs rounded-full ${
                  doctor.status === "available"
                    ? "bg-green-50 text-green-700"
                    : doctor.status === "busy"
                      ? "bg-yellow-50 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {doctor.status}
              </span>
            </div>
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>
                  {doctor.work_start_time && doctor.work_end_time
                    ? `${doctor.work_start_time.slice(0, 5)}-${doctor.work_end_time.slice(0, 5)}`
                    : doctor.availability || "-"}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                Break:{" "}
                {doctor.break_start_time && doctor.break_end_time
                  ? `${doctor.break_start_time.slice(0, 5)}-${doctor.break_end_time.slice(0, 5)}`
                  : "-"}
              </div>
              <div className="text-sm text-gray-600">Weekly Off: {formatWeeklyOffDays(doctor.weekly_off_days)}</div>
              <div className="text-sm text-gray-600">Holidays: {doctor.holiday_dates || "-"}</div>
              <div className="text-sm text-gray-600">
                Consultation Fee: {doctor.consultation_fee !== null ? `Rs. ${Number(doctor.consultation_fee).toFixed(2)}` : "-"}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{doctor.phone || "-"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4" />
                <span>{doctor.email || "-"}</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-gray-600">
                <LinkIcon className="w-4 h-4 mt-0.5" />
                <div>
                  <p>{doctor.linked_user_full_name || "No login account linked"}</p>
                  <p className="text-xs text-gray-500">{doctor.linked_user_email || "Link a doctor-role user for reliable access control"}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-gray-200">
              <div>
                <p className="text-sm text-gray-600">Experience</p>
                <p className="text-gray-900 mt-1">{doctor.experience_years ? `${doctor.experience_years} years` : "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Patients</p>
                <p className="text-gray-900 mt-1">{doctor.patient_count}</p>
              </div>
            </div>
            {canDeleteDoctors && (
              <div className="pt-4 border-t border-gray-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setDoctorToDelete(doctor);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-gray-600">Total doctors: {totalDoctors}</p>
        <NumberedPagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={(nextPage) => loadDoctors(nextPage, query)}
          className="justify-start lg:justify-end"
          disabled={loading}
        />
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form data-testid="doctor-form-modal" onSubmit={handleCreateDoctor} className="bg-white rounded-xl p-6 w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg text-gray-900">Add New Doctor</h2>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Linked Login Account</label>
              <select
                data-testid="doctor-user-select"
                value={form.userId}
                onChange={(e) => handleFormChange("userId", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">No linked account</option>
                {availableDoctorUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {loadingUsers
                  ? "Loading doctor-role users..."
                  : "Use a linked login so doctor access is scoped by account instead of email matching."}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Full Name</label>
                <input
                  data-testid="doctor-full-name-input"
                  type="text"
                  value={form.fullName}
                  onChange={(e) => handleFormChange("fullName", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Specialty</label>
                <input
                  data-testid="doctor-specialty-input"
                  type="text"
                  value={form.specialty}
                  onChange={(e) => handleFormChange("specialty", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Experience (Years)</label>
                <input
                  data-testid="doctor-experience-years-input"
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  value={form.experienceYears}
                  onChange={(e) => handleFormChange("experienceYears", e.target.value.replace(/\D/g, "").slice(0, 2))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Availability</label>
                <select
                  data-testid="doctor-availability-select"
                  value={form.availability}
                  onChange={(e) => handleFormChange("availability", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {availabilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {availabilityOptions.find((option) => option.value === form.availability)?.description}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
              <div>
                <h3 className="text-sm text-gray-900">Working Hours</h3>
                <p className="mt-1 text-xs text-gray-500">Set the doctor&apos;s main shift and break timing clearly.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderTimeField("Work Start", form.workStartTime, (nextValue) => handleFormChange("workStartTime", nextValue))}
                {renderTimeField("Work End", form.workEndTime, (nextValue) => handleFormChange("workEndTime", nextValue))}
                {renderTimeField("Break Start", form.breakStartTime, (nextValue) =>
                  handleFormChange("breakStartTime", nextValue)
                )}
                {renderTimeField("Break End", form.breakEndTime, (nextValue) => handleFormChange("breakEndTime", nextValue))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-2">Weekly Off Days</label>
              <div className="grid grid-cols-4 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                {weekdayOptions.map((option) => {
                  const checked = form.weeklyOffDays.split(",").includes(option.value);

                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                        checked
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWeeklyOffDay(option.value)}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Use this for recurring weekly closures like Saturday and Sunday.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Holidays</label>
              <input
                data-testid="doctor-holiday-dates-input"
                type="text"
                value={form.holidayDates}
                onChange={(e) => handleFormChange("holidayDates", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="2026-04-10, 2026-04-14"
              />
              <p className="mt-1 text-xs text-gray-500">Use comma-separated dates in YYYY-MM-DD format.</p>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Consultation Fee</label>
              <input
                data-testid="doctor-consultation-fee-input"
                type="text"
                inputMode="decimal"
                value={form.consultationFee}
                onChange={(e) => {
                  const normalized = e.target.value
                    .replace(/[^0-9.]/g, "")
                    .replace(/(\..*)\./g, "$1");
                  handleFormChange("consultationFee", normalized);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="120.00"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Phone</label>
                <input
                  data-testid="doctor-phone-input"
                  type="text"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => handleFormChange("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="10-digit number"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Email</label>
                <input
                  data-testid="doctor-email-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => handleFormChange("email", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={selectedDoctorUser?.email || "doctor@example.com"}
                />
              </div>
            </div>
            {selectedDoctorUser && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Linked account: {selectedDoctorUser.full_name} ({selectedDoctorUser.email})
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                data-testid="doctor-cancel-button"
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                data-testid="doctor-submit-button"
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-60"
              >
                {isSubmitting ? "Adding..." : "Add Doctor"}
              </button>
            </div>
          </form>
        </div>
      )}

      {doctorToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <div>
              <h2 className="text-lg text-gray-900">Delete Doctor</h2>
              <p className="mt-2 text-sm text-gray-600">
                Delete <span className="text-gray-900">{doctorToDelete.full_name}</span>? This only works when the doctor has no linked appointments, medical records, or invoices.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDoctorToDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDoctor}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete Doctor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


