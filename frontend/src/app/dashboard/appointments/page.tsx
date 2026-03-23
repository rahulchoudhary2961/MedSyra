"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Search,
  XCircle
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { Appointment, Doctor, Patient } from "@/types/api";

type AppointmentsResponse = {
  success: boolean;
  data: {
    items: Appointment[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

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

type PatientsResponse = {
  success: boolean;
  data: {
    items: Patient[];
  };
};

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";
type CalendarMode = "day" | "week";
type PageMode = "calendar" | "list";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_START_HOUR = 9;
const SLOT_END_HOUR = 18;
const SLOT_INTERVAL_MINUTES = 30;

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (hour: number, minute = 0) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const getStartOfWeek = (date: Date) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const formatWeekRange = (start: Date, end: Date) =>
  `${start.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} - ${end.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`;

const buildTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = SLOT_START_HOUR; hour <= SLOT_END_HOUR; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_INTERVAL_MINUTES) {
      if (hour === SLOT_END_HOUR && minute > 0) continue;
      slots.push(toTimeInputValue(hour, minute));
    }
  }
  return slots;
};

const getStatusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "completed") return "bg-green-100 text-green-700 border-green-200";
  if (normalized === "cancelled") return "bg-red-100 text-red-700 border-red-200";
  if (normalized === "confirmed") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-yellow-100 text-yellow-700 border-yellow-200";
};

const isValidClinicTime = (value: string) => {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h, m] = value.split(":").map(Number);
  const minutes = h * 60 + m;
  const start = SLOT_START_HOUR * 60;
  const end = SLOT_END_HOUR * 60;
  return minutes >= start && minutes <= end && m % SLOT_INTERVAL_MINUTES === 0;
};

const currentTimeSlot = () => {
  const now = new Date();
  const rounded = Math.floor(now.getMinutes() / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
  return `${String(now.getHours()).padStart(2, "0")}:${String(rounded).padStart(2, "0")}`;
};

const initialForm = {
  patientId: "",
  doctorId: "",
  appointmentDate: "",
  appointmentTime: "",
  appointmentType: "checkup",
  notes: ""
};

export default function AppointmentsPage() {
  const [mode, setMode] = useState<PageMode>("calendar");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("day");
  const [weekStart, setWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => toDateInputValue(new Date()));

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    doctorId: "",
    status: "",
    date: ""
  });

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const [patientQuery, setPatientQuery] = useState("");
  const [form, setForm] = useState(initialForm);

  const timeSlots = useMemo(buildTimeSlots, []);
  const currentSlot = useMemo(currentTimeSlot, []);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDates[6];

  const calendarDates = calendarMode === "day" ? [new Date(selectedDate)] : weekDates;

  const loadDoctors = useCallback(async () => {
    const all: Doctor[] = [];
    let p = 1;
    let pages = 1;

    do {
      const res = await apiRequest<DoctorsResponse>(`/doctors?page=${p}&limit=100`, { authenticated: true });
      all.push(...(res.data.items || []));
      pages = res.data.pagination?.totalPages || 1;
      p += 1;
    } while (p <= pages);

    setDoctors(all);
  }, []);

  const loadPatients = useCallback(async (query = "") => {
    setPatientsLoading(true);
    try {
      const path = query.trim() ? `/patients?limit=30&q=${encodeURIComponent(query.trim())}` : "/patients?limit=30";
      const res = await apiRequest<PatientsResponse>(path, { authenticated: true });
      setPatients(res.data.items || []);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", mode === "list" ? "20" : "100");
      params.set("order", mode === "list" ? "desc" : "asc");

      if (filters.q) params.set("q", filters.q);
      if (filters.doctorId) params.set("doctorId", filters.doctorId);
      if (filters.status) params.set("status", filters.status);

      if (mode === "calendar") {
        if (calendarMode === "day") {
          params.set("date", selectedDate);
        } else {
          params.set("startDate", toDateInputValue(weekStart));
          params.set("endDate", toDateInputValue(weekEnd));
        }
      } else {
        if (filters.date) params.set("date", filters.date);
      }

      if (mode === "calendar") {
        const allItems: Appointment[] = [];
        let currentPage = 1;
        let pages = 1;

        do {
          params.set("page", String(currentPage));
          const res = await apiRequest<AppointmentsResponse>(`/appointments?${params.toString()}`, {
            authenticated: true
          });
          allItems.push(...(res.data.items || []));
          pages = res.data.pagination?.totalPages || 1;
          currentPage += 1;
        } while (currentPage <= pages);

        setAppointments(allItems);
        setTotalPages(1);
        setTotalItems(allItems.length);
      } else {
        const res = await apiRequest<AppointmentsResponse>(`/appointments?${params.toString()}`, {
          authenticated: true
        });
        setAppointments(res.data.items || []);
        setTotalPages(res.data.pagination?.totalPages || 1);
        setTotalItems(res.data.pagination?.total || 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [calendarMode, filters, mode, page, selectedDate, weekEnd, weekStart]);

  useEffect(() => {
    void Promise.all([loadDoctors(), loadPatients()]).catch((err: Error) => {
      setError(err.message || "Failed to load metadata");
    });
  }, [loadDoctors, loadPatients]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments, refreshKey]);

  useEffect(() => {
    if (!showModal) return;
    const t = setTimeout(() => {
      void loadPatients(patientQuery);
    }, 250);
    return () => clearTimeout(t);
  }, [loadPatients, patientQuery, showModal]);

  const appointmentsBySlot = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    appointments.forEach((a) => {
      const key = `${a.appointment_date}|${a.appointment_time.slice(0, 5)}`;
      const arr = map.get(key) || [];
      arr.push(a);
      map.set(key, arr);
    });
    return map;
  }, [appointments]);

  const openCreate = (date?: string, time?: string) => {
    setEditing(null);
    setForm({
      ...initialForm,
      appointmentDate: date || selectedDate,
      appointmentTime: time || "",
      doctorId: filters.doctorId || ""
    });
    setPatientQuery("");
    setShowModal(true);
  };

  const openEdit = (appointment: Appointment) => {
    setEditing(appointment);
    setForm({
      patientId: appointment.patient_id,
      doctorId: appointment.doctor_id,
      appointmentDate: appointment.appointment_date,
      appointmentTime: appointment.appointment_time.slice(0, 5),
      appointmentType: appointment.appointment_type,
      notes: appointment.notes || ""
    });
    setShowModal(true);
  };

  const submitAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      if (!isValidClinicTime(form.appointmentTime)) {
        throw new Error("Appointment time must be in clinic hours (09:00-18:00) and in 30-minute slots.");
      }

      const payload = {
        patientId: form.patientId,
        doctorId: form.doctorId,
        appointmentDate: form.appointmentDate,
        appointmentTime: form.appointmentTime,
        appointmentType: form.appointmentType,
        notes: form.notes || null
      };

      if (editing) {
        await apiRequest(`/appointments/${editing.id}`, {
          method: "PATCH",
          authenticated: true,
          body: payload
        });
      } else {
        await apiRequest(`/appointments`, {
          method: "POST",
          authenticated: true,
          body: payload
        });
      }

      // Focus the booked/edited date so the record is visible immediately.
      if (form.appointmentDate) {
        const focusedDate = new Date(form.appointmentDate);
        setSelectedDate(form.appointmentDate);
        setWeekStart(getStartOfWeek(focusedDate));
      }

      // Reset filters that can hide newly created records.
      setMode("calendar");
      setCalendarMode("day");
      setSearchInput("");
      setFilters((prev) => ({
        ...prev,
        q: "",
        status: "",
        date: ""
      }));

      setPage(1);
      setShowModal(false);
      setEditing(null);
      setForm(initialForm);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save appointment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = async (appointment: Appointment, nextStatus: AppointmentStatus) => {
    setStatusUpdatingId(appointment.id);
    setError("");

    try {
      await apiRequest(`/appointments/${appointment.id}`, {
        method: "PATCH",
        authenticated: true,
        body: { status: nextStatus }
      });
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, status: nextStatus } : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const cancelAppointment = async (appointment: Appointment) => {
    setStatusUpdatingId(appointment.id);
    setError("");

    try {
      await apiRequest(`/appointments/${appointment.id}`, {
        method: "DELETE",
        authenticated: true
      });
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, status: "cancelled" } : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel appointment");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-gray-900">Appointments</h1>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => {
                setMode("calendar");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${mode === "calendar" ? "bg-cyan-600 text-white border-cyan-600" : "border-gray-300 text-gray-700"}`}
            >
              Calendar
            </button>
            <button
              onClick={() => {
                setMode("list");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm border ${mode === "list" ? "bg-cyan-600 text-white border-cyan-600" : "border-gray-300 text-gray-700"}`}
            >
              List
            </button>
            <button
              onClick={() => openCreate(selectedDate)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
            >
              <Plus className="w-4 h-4" />
              Book Appointment
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by patient name or phone"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <select
            value={filters.doctorId}
            onChange={(e) => setFilters((prev) => ({ ...prev, doctorId: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All doctors</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <div className="flex gap-2 mb-2">
            <input
              type="date"
              value={filters.date}
              onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <button
              onClick={() => {
                setPage(1);
                setFilters((prev) => ({ ...prev, q: searchInput.trim() }));
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Apply
            </button>
          </div>
        </div>

        {mode === "calendar" && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const now = new Date();
                    setSelectedDate(toDateInputValue(now));
                    setWeekStart(getStartOfWeek(now));
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                >
                  Today
                </button>
                <button onClick={() => setWeekStart((prev) => addDays(prev, -7))} className="p-2 border border-gray-300 rounded-lg">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5">{formatWeekRange(weekStart, weekEnd)}</div>
                <button onClick={() => setWeekStart((prev) => addDays(prev, 7))} className="p-2 border border-gray-300 rounded-lg">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCalendarMode("day")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${calendarMode === "day" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-700"}`}
                >
                  Day
                </button>
                <button
                  onClick={() => setCalendarMode("week")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${calendarMode === "week" ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-700"}`}
                >
                  Week
                </button>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-auto">
              <div className={`grid ${calendarMode === "day" ? "grid-cols-[72px_1fr]" : "grid-cols-[72px_repeat(7,minmax(120px,1fr))]"} min-w-[760px]`}>
                <div className="px-2 py-3 border-b border-r border-gray-200 text-xs text-gray-500">Time</div>
                {calendarDates.map((day) => {
                  const val = toDateInputValue(day);
                  return (
                    <button
                      key={val}
                      onClick={() => setSelectedDate(val)}
                      className={`px-2 py-3 border-b border-r border-gray-200 text-center ${selectedDate === val ? "bg-cyan-50" : "bg-white"}`}
                    >
                      <p className="text-xs text-gray-500">{DAYS[day.getDay()]}</p>
                      <p className="text-sm text-gray-800">{day.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</p>
                    </button>
                  );
                })}

                {timeSlots.map((slot) => (
                  <div
                    key={`row-${slot}`}
                    className={`grid ${calendarMode === "day" ? "grid-cols-[72px_1fr]" : "grid-cols-[72px_repeat(7,minmax(120px,1fr))]"}`}
                  >
                    <div key={`t-${slot}`} className={`px-2 py-3 border-b border-r border-gray-200 text-xs ${slot === currentSlot ? "text-cyan-700 font-medium" : "text-gray-500"}`}>
                      {slot}
                    </div>
                    {calendarDates.map((day) => {
                      const dateVal = toDateInputValue(day);
                      const key = `${dateVal}|${slot}`;
                      const items = (appointmentsBySlot.get(key) || []).filter((a) => {
                        if (filters.doctorId && a.doctor_id !== filters.doctorId) return false;
                        if (filters.status && a.status !== filters.status) return false;
                        if (filters.q) {
                          const q = filters.q.toLowerCase();
                          if (!a.patient_name.toLowerCase().includes(q)) return false;
                        }
                        return true;
                      });

                      return (
                        <button
                          key={`${key}-c`}
                          onClick={() => openCreate(dateVal, slot)}
                          className={`min-h-[56px] p-1 border-b border-r border-gray-100 text-left hover:bg-gray-50 ${slot === currentSlot && dateVal === toDateInputValue(new Date()) ? "bg-cyan-50/40" : ""}`}
                        >
                          {items.slice(0, 2).map((a) => (
                            <div key={a.id} className={`mb-1 text-[11px] border rounded px-2 py-1 ${getStatusClass(a.status)}`}>
                              <div className="truncate font-medium">{a.patient_name}</div>
                              <div className="truncate">{a.doctor_name}</div>
                            </div>
                          ))}
                          {items.length > 2 && <div className="text-[10px] text-gray-500 px-1">+{items.length - 2} more</div>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {mode === "list" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left text-sm text-gray-600 px-5 py-3">Patient</th>
                  <th className="text-left text-sm text-gray-600 px-5 py-3">Doctor</th>
                  <th className="text-left text-sm text-gray-600 px-5 py-3">Date & Time</th>
                  <th className="text-left text-sm text-gray-600 px-5 py-3">Status</th>
                  <th className="text-left text-sm text-gray-600 px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-5 py-4 text-sm text-gray-900">{a.patient_name}</td>
                    <td className="px-5 py-4 text-sm text-gray-700">{a.doctor_name}</td>
                    <td className="px-5 py-4 text-sm text-gray-700">{a.appointment_date} {a.appointment_time.slice(0, 5)}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded-full border text-xs ${getStatusClass(a.status)}`}>{a.status}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEdit(a)} className="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit</button>
                        <button
                          disabled={statusUpdatingId === a.id || a.status === "completed"}
                          onClick={() => updateStatus(a, "completed")}
                          className="px-2 py-1 text-xs border border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Complete
                        </button>
                        <button
                          disabled={statusUpdatingId === a.id || a.status === "cancelled"}
                          onClick={() => cancelAppointment(a)}
                          className="px-2 py-1 text-xs border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && appointments.length === 0 && (
                  <tr>
                    <td className="px-5 py-6 text-sm text-gray-500" colSpan={5}>No appointments found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">Total: {totalItems}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-gray-500">Loading appointments...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={submitAppointment} className="bg-white rounded-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg text-gray-900">{editing ? "Edit Appointment" : "Book Appointment"}</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Patient</label>
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                  placeholder="Search patient"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                />
                <select
                  value={form.patientId}
                  onChange={(e) => setForm((prev) => ({ ...prev, patientId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Select patient</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.full_name} ({patient.phone})</option>
                  ))}
                </select>
                {patientsLoading && <p className="text-xs text-gray-500 mt-1">Searching patients...</p>}
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Doctor</label>
                <select
                  value={form.doctorId}
                  onChange={(e) => setForm((prev) => ({ ...prev, doctorId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Select doctor</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={form.appointmentDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, appointmentDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Time</label>
                <input
                  type="time"
                  value={form.appointmentTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, appointmentTime: e.target.value }))}
                  min="09:00"
                  max="18:00"
                  step={1800}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Use 30-minute slots between 09:00 and 18:00.</p>
              </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Type</label>
                <select
                  value={form.appointmentType}
                  onChange={(e) => setForm((prev) => ({ ...prev, appointmentType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="checkup">Checkup</option>
                  <option value="followup">Follow-up</option>
                  <option value="consultation">Consultation</option>
                  <option value="surgery">Surgery</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditing(null);
                  setForm(initialForm);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                <CalendarDays className="w-4 h-4" />
                {isSubmitting ? "Saving..." : editing ? "Update" : "Book"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="text-xs text-gray-500 inline-flex items-center gap-2">
        <Clock3 className="w-3 h-3" />
        Current slot highlighted based on system time.
      </div>
    </div>
  );
}
