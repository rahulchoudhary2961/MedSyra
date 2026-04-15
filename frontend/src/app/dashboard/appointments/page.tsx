"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
import { ApiRequestError, apiRequest } from "@/lib/api";
import { formatClockTime, formatDateTime } from "@/lib/date-time";
import { canDeleteAppointments, canManageAppointments, canUseAiPrescription } from "@/lib/roles";
import {
  AiPrescriptionSuggestion,
  Appointment,
  Doctor,
  Invoice,
  MedicalRecord,
  NotificationDelivery,
  Patient
} from "@/types/api";
import ModalCloseButton from "@/app/components/ModalCloseButton";

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

type AppointmentMutationResponse = {
  success: boolean;
  data: Appointment;
};

type NoShowResponse = {
  success: boolean;
  data: {
    appointment: Appointment;
    notifications: Array<{
      channel: "sms" | "email";
      status: "sent" | "failed" | "fallback";
      recipient?: string;
      error?: string;
    }>;
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

type PatientResponse = {
  success: boolean;
  data: Patient;
};

type MeResponse = {
  success: boolean;
  data: {
    role: string;
    organization_name?: string;
  };
};

type MedicalRecordsResponse = {
  success: boolean;
  data: {
    items: MedicalRecord[];
  };
};

type AppointmentReminderResponse = {
  success: boolean;
  data: {
    appointment: Appointment;
    reminder: {
      stage: string;
      label: string;
      tracked: boolean;
      message: string;
      deliveries: NotificationDelivery[];
    };
  };
};

type FollowUpReminderResponse = {
  success: boolean;
  data: {
    record: MedicalRecord;
    deliveries: NotificationDelivery[];
  };
};

type CreateInvoiceResponse = {
  success: boolean;
  data: Invoice;
};

type AiPrescriptionSuggestionsResponse = {
  success: boolean;
  data: {
    items: AiPrescriptionSuggestion[];
  };
};

type AiPrescriptionSuggestionMutationResponse = {
  success: boolean;
  data: AiPrescriptionSuggestion;
};

type ViewMode = "day" | "week" | "month";

type StatusTone = {
  dot: string;
  block: string;
  badge: string;
  label: string;
};

type LayoutItem = {
  appointment: Appointment;
  column: number;
  totalColumns: number;
};

type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

type InvoiceDraftForm = {
  patientId: string;
  doctorId: string;
  appointmentId: string;
  description: string;
  amount: string;
  dueDate: string;
  notes: string;
};

type ConsultationForm = {
  symptoms: string;
  diagnosis: string;
  prescription: string;
  followUpInDays: string;
  sendFollowUpReminder: boolean;
  notes: string;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const START_HOUR = 8;
const END_HOUR = 20;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 48;

const initialForm = {
  patientName: "",
  patientId: "",
  patientCode: "",
  mobileNumber: "",
  email: "",
  doctorId: "",
  category: "consultation",
  status: "pending",
  appointmentDate: "",
  appointmentTime: "",
  durationMinutes: "15",
  plannedProcedures: "",
  notes: ""
};

const initialWalkInForm = {
  patientName: "",
  phone: ""
};

const initialInlinePatientForm = {
  fullName: "",
  phone: "",
  gender: "other",
  age: "",
  email: ""
};

const initialInvoiceDraft: InvoiceDraftForm = {
  patientId: "",
  doctorId: "",
  appointmentId: "",
  description: "Consultation",
  amount: "",
  dueDate: "",
  notes: ""
};

const initialConsultationForm: ConsultationForm = {
  symptoms: "",
  diagnosis: "",
  prescription: "",
  followUpInDays: "",
  sendFollowUpReminder: false,
  notes: ""
};

const STATUS_TONES: Record<string, StatusTone> = {
  confirmed: {
    dot: "bg-emerald-500",
    block: "border-emerald-200 bg-emerald-50 text-emerald-900",
    badge: "bg-emerald-100 text-emerald-800",
    label: "Confirmed"
  },
  pending: {
    dot: "bg-amber-400",
    block: "border-amber-200 bg-amber-50 text-amber-900",
    badge: "bg-amber-100 text-amber-800",
    label: "Pending"
  },
  cancelled: {
    dot: "bg-red-500",
    block: "border-red-200 bg-red-50 text-red-900",
    badge: "bg-red-100 text-red-800",
    label: "Cancelled"
  },
  completed: {
    dot: "bg-sky-500",
    block: "border-sky-200 bg-sky-50 text-sky-900",
    badge: "bg-sky-100 text-sky-800",
    label: "Completed"
  },
  "checked-in": {
    dot: "bg-violet-500",
    block: "border-violet-200 bg-violet-50 text-violet-900",
    badge: "bg-violet-100 text-violet-800",
    label: "Checked-in"
  },
  "no-show": {
    dot: "bg-slate-500",
    block: "border-slate-200 bg-slate-50 text-slate-900",
    badge: "bg-slate-100 text-slate-800",
    label: "No-show"
  }
};

const pad = (value: number) => String(value).padStart(2, "0");

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const toAppointmentDateKey = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }

  return toDateKey(parsed);
};
const parseDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const isSameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const buildMonthGrid = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  const shift = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - shift);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const buildWeekDays = (value: string) => {
  const current = parseDate(value);
  const monday = new Date(current);
  const shift = (current.getDay() + 6) % 7;
  monday.setDate(current.getDate() - shift);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
};

const buildTimeSlots = () => {
  const slots: { label: string; minutes: number }[] = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      const value = new Date();
      value.setHours(hour, minute, 0, 0);
      slots.push({
        label: value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        minutes: hour * 60 + minute
      });
    }
  }
  return slots;
};

const TIME_SLOTS = buildTimeSlots();
const timelineHeight = TIME_SLOTS.length * SLOT_HEIGHT;

const toMinutes = (value: string) => {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};

const clampAppointment = (appointment: Appointment) => {
  const start = toMinutes(appointment.appointment_time);
  const end = start + Math.max(appointment.duration_minutes || 30, 15);
  const dayStart = START_HOUR * 60;
  const dayEnd = END_HOUR * 60;

  if (end <= dayStart || start >= dayEnd) {
    return null;
  }

  return {
    top: ((Math.max(start, dayStart) - dayStart) / SLOT_MINUTES) * SLOT_HEIGHT,
    height: (Math.max(Math.min(end, dayEnd) - Math.max(start, dayStart), 15) / SLOT_MINUTES) * SLOT_HEIGHT
  };
};

const getStatusTone = (status?: string | null) =>
  STATUS_TONES[(status || "pending").toLowerCase()] || STATUS_TONES.pending;

const formatHeaderDate = (value: string) =>
  parseDate(value).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

const parseHolidayDates = (value?: string | null) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isDoctorAvailableForSlot = (doctor: Doctor | null | undefined, dateKey: string, startMinutes: number, durationMinutes: number) => {
  if (!doctor) {
    return true;
  }

  const holidays = new Set(parseHolidayDates(doctor.holiday_dates));
  if (holidays.has(dateKey)) {
    return false;
  }

  const workingStart = doctor.work_start_time ? toMinutes(doctor.work_start_time) : START_HOUR * 60;
  const workingEnd = doctor.work_end_time ? toMinutes(doctor.work_end_time) : END_HOUR * 60;
  const breakStart = doctor.break_start_time ? toMinutes(doctor.break_start_time) : null;
  const breakEnd = doctor.break_end_time ? toMinutes(doctor.break_end_time) : null;
  const slotEnd = startMinutes + Math.max(durationMinutes, 15);

  if (startMinutes < workingStart || slotEnd > workingEnd) {
    return false;
  }

  if (breakStart !== null && breakEnd !== null) {
    const overlapsBreak = startMinutes < breakEnd && slotEnd > breakStart;
    if (overlapsBreak) {
      return false;
    }
  }

  return true;
};

const isPastSlot = (dateKey: string, startMinutes: number) => {
  const now = new Date();
  const today = toDateKey(now);
  if (dateKey !== today) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return startMinutes < currentMinutes;
};

const buildAppointmentLayouts = (appointments: Appointment[]) => {
  const sorted = [...appointments].sort((a, b) => {
    const startDiff = toMinutes(a.appointment_time) - toMinutes(b.appointment_time);
    if (startDiff !== 0) {
      return startDiff;
    }
    return (a.duration_minutes || 0) - (b.duration_minutes || 0);
  });

  const groups: Appointment[][] = [];
  let currentGroup: Appointment[] = [];
  let currentGroupEnd = -1;

  sorted.forEach((appointment) => {
    const start = toMinutes(appointment.appointment_time);
    const end = start + Math.max(appointment.duration_minutes || 30, 15);

    if (currentGroup.length === 0 || start < currentGroupEnd) {
      currentGroup.push(appointment);
      currentGroupEnd = Math.max(currentGroupEnd, end);
      return;
    }

    groups.push(currentGroup);
    currentGroup = [appointment];
    currentGroupEnd = end;
  });

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  const layouts = new Map<string, LayoutItem>();

  groups.forEach((group) => {
    const columnEnds: number[] = [];
    const groupLayouts: LayoutItem[] = [];

    group.forEach((appointment) => {
      const start = toMinutes(appointment.appointment_time);
      const end = start + Math.max(appointment.duration_minutes || 30, 15);

      let column = columnEnds.findIndex((value) => value <= start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(end);
      } else {
        columnEnds[column] = end;
      }

      groupLayouts.push({
        appointment,
        column,
        totalColumns: 0
      });
    });

    const totalColumns = Math.max(columnEnds.length, 1);
    groupLayouts.forEach((item) => {
      layouts.set(item.appointment.id, {
        ...item,
        totalColumns
      });
    });
  });

  return layouts;
};

const getCurrentSlotTime = (date: Date) => {
  const slotMinutes = Math.floor(date.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES;
  return `${pad(date.getHours())}:${pad(slotMinutes)}`;
};

const truncateText = (value?: string | null, max = 18) => {
  if (!value) {
    return "";
  }
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
};

const getInvoiceDisplayStatus = (appointment: Appointment) => {
  if (!appointment.invoice_id) {
    return "No Invoice";
  }
  return (appointment.invoice_status || "").toLowerCase() === "paid" ? "Paid" : "Unpaid";
};

const diffDaysFromDateKey = (dateKey: string, baseDateKey: string) => {
  const target = parseDate(dateKey);
  const base = parseDate(baseDateKey);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - base.getTime()) / msPerDay);
};

const getAppointmentReminderWindow = (appointmentDate: string) => {
  const today = toDateKey(new Date());
  const dayDelta = diffDaysFromDateKey(toAppointmentDateKey(appointmentDate), today);

  if (dayDelta < 0) {
    return { key: "past", label: "Past appointment" };
  }
  if (dayDelta === 0) {
    return { key: "same_day", label: "Same-day reminder" };
  }

  return { key: "upcoming", label: "Available only on appointment day" };
};

const formatTimestamp = (value?: string | null) => {
  return formatDateTime(value);
};

const sortAppointments = (items: Appointment[]) =>
  [...items].sort((a, b) => {
    const dateDiff = toAppointmentDateKey(a.appointment_date).localeCompare(toAppointmentDateKey(b.appointment_date));
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return a.appointment_time.localeCompare(b.appointment_time);
  });

export default function AppointmentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientFilterId = searchParams.get("patientId") || "";
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [selectedDoctor, setSelectedDoctor] = useState("all");

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appointmentFormError, setAppointmentFormError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showConsultationModal, setShowConsultationModal] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedConsultationRecord, setSelectedConsultationRecord] = useState<MedicalRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);
  const [noShowTarget, setNoShowTarget] = useState<Appointment | null>(null);
  const [pendingDeletedIds, setPendingDeletedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWalkInSubmitting, setIsWalkInSubmitting] = useState(false);
  const [isInlinePatientSubmitting, setIsInlinePatientSubmitting] = useState(false);
  const [isBulkCancelling, setIsBulkCancelling] = useState(false);
  const [isInvoiceSubmitting, setIsInvoiceSubmitting] = useState(false);
  const [isConsultationSubmitting, setIsConsultationSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [currentRole, setCurrentRole] = useState("");
  const [organizationName, setOrganizationName] = useState("ABC Clinic");
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);
  const [showInlinePatientForm, setShowInlinePatientForm] = useState(false);
  const [inlinePatientForm, setInlinePatientForm] = useState(initialInlinePatientForm);
  const [form, setForm] = useState({
    ...initialForm,
    appointmentDate: todayKey
  });
  const [walkInForm, setWalkInForm] = useState(initialWalkInForm);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceDraftForm>(initialInvoiceDraft);
  const [consultationForm, setConsultationForm] = useState<ConsultationForm>(initialConsultationForm);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isSendingAppointmentReminder, setIsSendingAppointmentReminder] = useState(false);
  const [isSavingNoShow, setIsSavingNoShow] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiPrescriptionSuggestion[]>([]);
  const [aiSuggestionError, setAiSuggestionError] = useState("");
  const [isGeneratingAiSuggestion, setIsGeneratingAiSuggestion] = useState(false);
  const [reviewingAiSuggestionId, setReviewingAiSuggestionId] = useState<string | null>(null);
  const [noShowNotificationOptions, setNoShowNotificationOptions] = useState({
    sms: true,
    email: true
  });
  const patientSearchRef = useRef<HTMLDivElement | null>(null);
  const doctorSearchRef = useRef<HTMLDivElement | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const firstPageParams = new URLSearchParams();
      firstPageParams.set("limit", "100");
      firstPageParams.set("year", String(selectedYear));
      if (patientFilterId) {
        firstPageParams.set("patientId", patientFilterId);
      }

      const firstResponse = await apiRequest<AppointmentsResponse>(`/appointments?${firstPageParams.toString()}`, {
        authenticated: true
      });

      const allItems = [...(firstResponse.data.items || [])];
      const totalPages = firstResponse.data.pagination?.totalPages || 1;

      if (totalPages > 1) {
        const pageResponses = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) => {
            const page = index + 2;
            const pageParams = new URLSearchParams(firstPageParams);
            pageParams.set("page", String(page));
            return apiRequest<AppointmentsResponse>(`/appointments?${pageParams.toString()}`, {
              authenticated: true
            });
          })
        );

        for (const pageResponse of pageResponses) {
          allItems.push(...(pageResponse.data.items || []));
        }
      }

      setAppointments(allItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [patientFilterId, selectedYear]);

  const fetchDoctors = useCallback(async () => {
    try {
      const response = await apiRequest<DoctorsResponse>("/doctors?limit=100", {
        authenticated: true
      });
      setDoctors(response.data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load doctors");
    }
  }, []);

  const fetchPatients = useCallback(async () => {
    try {
      const response = await apiRequest<PatientsResponse>("/patients?limit=100", {
        authenticated: true
      });
      setPatients(response.data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patients");
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await apiRequest<MeResponse>("/auth/me", { authenticated: true });
      setCurrentRole(response.data.role || "");
      setOrganizationName(response.data.organization_name || "ABC Clinic");
    } catch {
      setCurrentRole("");
      setOrganizationName("ABC Clinic");
    }
  }, []);

  useEffect(() => {
    void fetchAppointments();
  }, [fetchAppointments]);

  useEffect(() => {
    void fetchDoctors();
  }, [fetchDoctors]);

  useEffect(() => {
    void fetchPatients();
  }, [fetchPatients]);

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

  useEffect(() => {
    void fetchCurrentUser();
  }, [fetchCurrentUser]);

  useEffect(() => {
    if (!selectedAppointment?.id) {
      setSelectedConsultationRecord(null);
      setAiSuggestions([]);
      setAiSuggestionError("");
      return;
    }

    apiRequest<MedicalRecordsResponse>(`/medical-records?appointmentId=${selectedAppointment.id}&limit=1`, {
      authenticated: true
    })
      .then((response) => {
        const record = response.data.items?.[0] || null;
        setSelectedConsultationRecord(record);
      })
      .catch(() => {
        setSelectedConsultationRecord(null);
      });
  }, [selectedAppointment]);

  useEffect(() => {
    if (!selectedAppointment?.id || !canUseAiPrescription(currentRole)) {
      setAiSuggestions([]);
      setAiSuggestionError("");
      return;
    }

    apiRequest<AiPrescriptionSuggestionsResponse>(
      `/ai/prescription-suggestions?appointmentId=${encodeURIComponent(selectedAppointment.id)}&limit=5`,
      {
        authenticated: true
      }
    )
      .then((response) => {
        setAiSuggestions(response.data.items || []);
        setAiSuggestionError("");
      })
      .catch((err: Error) => {
        setAiSuggestions([]);
        setAiSuggestionError(err.message || "Failed to load AI prescription suggestions");
      });
  }, [currentRole, selectedAppointment]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const refreshAppointments = () => {
      void fetchAppointments();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshAppointments();
      }
    };

    window.addEventListener("focus", refreshAppointments);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshAppointments);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchAppointments]);

  useEffect(() => {
    if (!selectedAppointment?.patient_id) {
      return;
    }

    router.prefetch(`/dashboard/patients/${selectedAppointment.patient_id}`);
  }, [router, selectedAppointment]);

  const selectedDate = useMemo(() => parseDate(selectedDay), [selectedDay]);
  const monthGrid = useMemo(() => buildMonthGrid(selectedYear, selectedMonth), [selectedMonth, selectedYear]);
  const weekDays = useMemo(() => buildWeekDays(selectedDay), [selectedDay]);

  const filteredAppointments = useMemo(() => {
    const visibleAppointments = appointments.filter((appointment) => !pendingDeletedIds.has(appointment.id));

    if (selectedDoctor === "all") {
      return visibleAppointments;
    }

    return visibleAppointments.filter((appointment) => appointment.doctor_id === selectedDoctor);
  }, [appointments, pendingDeletedIds, selectedDoctor]);
  const canManageCalendar = canManageAppointments(currentRole);
  const canDeleteCalendarAppointments = canDeleteAppointments(currentRole);
  const canGenerateAiPrescription = canUseAiPrescription(currentRole);

  const mergePrescriptionText = (current: string, next: string) => {
    const currentValue = current.trim();
    const nextValue = next.trim();

    if (!nextValue) {
      return currentValue;
    }

    if (!currentValue) {
      return nextValue;
    }

    if (currentValue.includes(nextValue)) {
      return currentValue;
    }

    return `${currentValue}\n\n${nextValue}`.trim();
  };

  const syncAcceptedSuggestionsToMedicalRecord = useCallback(
    async (medicalRecordId: string) => {
      const acceptedSuggestions = aiSuggestions.filter((item) => item.status === "accepted" && !item.medical_record_id);
      if (acceptedSuggestions.length === 0 || !selectedAppointment?.id) {
        return;
      }

      try {
        const responses = await Promise.all(
          acceptedSuggestions.map((item) =>
            apiRequest<AiPrescriptionSuggestionMutationResponse>(`/ai/prescription-suggestions/${item.id}/review`, {
              method: "PATCH",
              authenticated: true,
              body: {
                status: "accepted",
                appointmentId: selectedAppointment.id,
                medicalRecordId
              }
            })
          )
        );

        setAiSuggestions((current) =>
          current.map((item) => responses.find((entry) => entry.data.id === item.id)?.data || item)
        );
      } catch {
        // Linking accepted suggestions to the saved record is best-effort.
      }
    },
    [aiSuggestions, selectedAppointment]
  );

  const generateAiPrescriptionSuggestion = async () => {
    if (!selectedAppointment) {
      return;
    }

    setIsGeneratingAiSuggestion(true);
    setAiSuggestionError("");

    try {
      const response = await apiRequest<AiPrescriptionSuggestionMutationResponse>("/ai/prescription-suggestions/generate", {
        method: "POST",
        authenticated: true,
        body: {
          appointmentId: selectedAppointment.id,
          patientId: selectedAppointment.patient_id || undefined,
          doctorId: selectedAppointment.doctor_id || undefined,
          symptoms: consultationForm.symptoms.trim() || undefined,
          diagnosis: consultationForm.diagnosis.trim() || undefined,
          notes: consultationForm.notes.trim() || undefined
        }
      });

      setAiSuggestions((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)]);
      setToast({ type: "success", message: "AI prescription suggestion generated" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate AI prescription suggestion";
      setAiSuggestionError(message);
      setToast({ type: "error", message });
    } finally {
      setIsGeneratingAiSuggestion(false);
    }
  };

  const reviewAiPrescriptionSuggestion = async (
    suggestion: AiPrescriptionSuggestion,
    status: "accepted" | "rejected"
  ) => {
    if (!selectedAppointment) {
      return;
    }

    setReviewingAiSuggestionId(suggestion.id);
    setAiSuggestionError("");

    try {
      const response = await apiRequest<AiPrescriptionSuggestionMutationResponse>(
        `/ai/prescription-suggestions/${suggestion.id}/review`,
        {
          method: "PATCH",
          authenticated: true,
          body: {
            status,
            appointmentId: selectedAppointment.id,
            medicalRecordId: selectedConsultationRecord?.id || undefined,
            reviewNote:
              status === "accepted"
                ? "Applied in consultation review"
                : "Rejected during consultation review"
          }
        }
      );

      setAiSuggestions((current) =>
        current.map((item) => (item.id === suggestion.id ? response.data : item))
      );

      if (status === "accepted" && response.data.prescription_text) {
        setConsultationForm((current) => ({
          ...current,
          prescription: mergePrescriptionText(current.prescription, response.data.prescription_text || "")
        }));
      }

      setToast({
        type: "success",
        message: status === "accepted" ? "AI suggestion applied for review" : "AI suggestion rejected"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to review AI prescription suggestion";
      setAiSuggestionError(message);
      setToast({ type: "error", message });
    } finally {
      setReviewingAiSuggestionId(null);
    }
  };
  const selectedPatientFilter = useMemo(
    () => patients.find((patient) => patient.id === patientFilterId) || null,
    [patientFilterId, patients]
  );
  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) {
      return patients.slice(0, 50);
    }

    return patients
      .filter((patient) => {
        const haystack = `${patient.patient_code || ""} ${patient.full_name} ${patient.phone} ${patient.email || ""}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 50);
  }, [patientSearch, patients]);
  const filteredDoctors = useMemo(() => {
    const query = doctorSearch.trim().toLowerCase();
    if (!query) {
      return doctors.slice(0, 50);
    }

    return doctors
      .filter((doctor) => {
        const haystack = `${doctor.full_name} ${doctor.specialty || ""} ${doctor.phone || ""} ${doctor.email || ""}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 50);
  }, [doctorSearch, doctors]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (patientSearchRef.current && !patientSearchRef.current.contains(target)) {
        setShowPatientDropdown(false);
      }
      if (doctorSearchRef.current && !doctorSearchRef.current.contains(target)) {
        setShowDoctorDropdown(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const filteredByDate = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();

    filteredAppointments.forEach((appointment) => {
      const dateKey = toAppointmentDateKey(appointment.appointment_date);
      const items = grouped.get(dateKey) || [];
      items.push(appointment);
      items.sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
      grouped.set(dateKey, items);
    });

    return grouped;
  }, [filteredAppointments]);

  const dailyAppointments = useMemo(() => filteredByDate.get(selectedDay) || [], [filteredByDate, selectedDay]);

  const monthlyAppointments = useMemo(
    () =>
      filteredAppointments.filter((appointment) => {
        const date = parseDate(toAppointmentDateKey(appointment.appointment_date));
        return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
      }),
    [filteredAppointments, selectedMonth, selectedYear]
  );

  const weeklyAppointments = useMemo(() => {
    const keys = new Set(weekDays.map(toDateKey));
    return filteredAppointments.filter((appointment) => keys.has(toAppointmentDateKey(appointment.appointment_date)));
  }, [filteredAppointments, weekDays]);

  const weeklyByDate = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();

    weeklyAppointments.forEach((appointment) => {
      const dateKey = toAppointmentDateKey(appointment.appointment_date);
      const items = grouped.get(dateKey) || [];
      items.push(appointment);
      items.sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
      grouped.set(dateKey, items);
    });

    return grouped;
  }, [weeklyAppointments]);

  const layoutByDate = useMemo(() => {
    const layouts = new Map<string, Map<string, LayoutItem>>();

    filteredByDate.forEach((items, dateKey) => {
      layouts.set(dateKey, buildAppointmentLayouts(items));
    });

    return layouts;
  }, [filteredByDate]);

  const summaryAppointments = useMemo(() => {
    if (viewMode === "day") {
      return dailyAppointments;
    }
    if (viewMode === "week") {
      return weeklyAppointments;
    }
    return monthlyAppointments;
  }, [dailyAppointments, monthlyAppointments, viewMode, weeklyAppointments]);

  const statusSummary = useMemo(
    () =>
      summaryAppointments.reduce(
        (acc, appointment) => {
          const key = (appointment.status || "pending").toLowerCase();
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    [summaryAppointments]
  );

  const headerLabel = useMemo(() => {
    if (viewMode === "day") {
      return formatHeaderDate(selectedDay);
    }

    if (viewMode === "week") {
      const start = weekDays[0];
      const end = weekDays[6];
      return `${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })} - ${end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
    }

    return `${MONTHS[selectedMonth]} ${selectedYear}`;
  }, [selectedDay, selectedMonth, selectedYear, viewMode, weekDays]);

  const selectedDoctorLabel = useMemo(() => {
    if (selectedDoctor === "all") {
      return "All Doctors";
    }

    return doctors.find((doctor) => doctor.id === selectedDoctor)?.full_name || "Filtered Doctor";
  }, [doctors, selectedDoctor]);

  const selectedFilterDoctor = useMemo(
    () => (selectedDoctor === "all" ? null : doctors.find((doctor) => doctor.id === selectedDoctor) || null),
    [doctors, selectedDoctor]
  );

  const formDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === form.doctorId) || null,
    [doctors, form.doctorId]
  );
  const selectedFormPatient = useMemo(
    () => patients.find((patient) => patient.id === form.patientId) || null,
    [form.patientId, patients]
  );

  const validFormTimeOptions = useMemo(() => {
    const duration = Number(form.durationMinutes) || 15;
    const options = TIME_SLOTS.filter(
      (slot) =>
        isDoctorAvailableForSlot(formDoctor, form.appointmentDate, slot.minutes, duration) &&
        !isPastSlot(form.appointmentDate, slot.minutes)
    ).map((slot) => ({
      value: `${pad(Math.floor(slot.minutes / 60))}:${pad(slot.minutes % 60)}`,
      label: slot.label
    }));

    if (form.appointmentTime && !options.some((option) => option.value === form.appointmentTime)) {
      options.unshift({
        value: form.appointmentTime,
        label: formatClockTime(form.appointmentTime)
      });
    }

    return options;
  }, [form.appointmentDate, form.durationMinutes, formDoctor]);

  const movePeriod = (direction: -1 | 1) => {
    if (viewMode === "day") {
      const next = new Date(selectedDate);
      next.setDate(selectedDate.getDate() + direction);
      setSelectedDay(toDateKey(next));
      setSelectedYear(next.getFullYear());
      setSelectedMonth(next.getMonth());
      return;
    }

    if (viewMode === "week") {
      const next = new Date(selectedDate);
      next.setDate(selectedDate.getDate() + direction * 7);
      setSelectedDay(toDateKey(next));
      setSelectedYear(next.getFullYear());
      setSelectedMonth(next.getMonth());
      return;
    }

    const next = new Date(selectedYear, selectedMonth + direction, 1);
    setSelectedYear(next.getFullYear());
    setSelectedMonth(next.getMonth());
    setSelectedDay(toDateKey(next));
  };

  const jumpToToday = () => {
    const now = new Date();
    setSelectedDay(toDateKey(now));
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
    setViewMode("day");
  };

  const openCreate = (date?: string, time?: string) => {
    const selectedPatient = patients.find((item) => item.id === patientFilterId) || null;
    setEditingAppointmentId(null);
    setPatientSearch(selectedPatient?.full_name || "");
    setShowPatientDropdown(false);
    setDoctorSearch("");
    setShowDoctorDropdown(false);
    setShowInlinePatientForm(false);
    setInlinePatientForm(initialInlinePatientForm);
    setAppointmentFormError("");
    setForm({
      ...initialForm,
      patientId: selectedPatient?.id || patientFilterId,
      patientCode: selectedPatient?.patient_code || "",
      patientName: selectedPatient?.full_name || "",
      mobileNumber: selectedPatient?.phone || "",
      email: selectedPatient?.email || "",
      appointmentDate: date || selectedDay || todayKey,
      appointmentTime: time || "",
      doctorId: selectedDoctor !== "all" ? selectedDoctor : ""
    });
    setShowModal(true);
  };

  const openWalkIn = () => {
    setWalkInForm(initialWalkInForm);
    setShowWalkInModal(true);
  };

  const openAppointmentDetails = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
  };

  const openGenerateInvoice = (appointment: Appointment) => {
    if (!appointment.patient_id) {
      const message = "This appointment is not linked to a saved patient record yet.";
      setError(message);
      setToast({ type: "error", message });
      return;
    }

    const doctor = doctors.find((item) => item.id === appointment.doctor_id) || null;
    const consultationFee =
      doctor && doctor.consultation_fee !== null && doctor.consultation_fee !== undefined
        ? String(Number(doctor.consultation_fee).toFixed(2))
        : "";

    setInvoiceForm({
      patientId: appointment.patient_id || "",
      doctorId: appointment.doctor_id || "",
      appointmentId: appointment.id,
      description: appointment.category === "walk-in" ? "Walk-in Consultation" : "Consultation",
      amount: consultationFee,
      dueDate: "",
      notes: appointment.notes || ""
    });
    setShowInvoiceModal(true);
  };

  const openConsultationCompletion = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setShowConsultationModal(true);
  };

  useEffect(() => {
    if (!showConsultationModal || !selectedAppointment) {
      return;
    }

    const matchingRecord =
      selectedConsultationRecord?.appointment_id === selectedAppointment.id ? selectedConsultationRecord : null;

    if (matchingRecord) {
      setConsultationForm({
        symptoms: matchingRecord.symptoms || "",
        diagnosis: matchingRecord.diagnosis || "",
        prescription: matchingRecord.prescription || "",
        followUpInDays:
          matchingRecord.follow_up_date
            ? String(
                Math.max(
                  diffDaysFromDateKey(
                    matchingRecord.follow_up_date,
                    toAppointmentDateKey(selectedAppointment.appointment_date)
                  ),
                  1
                )
                )
              : "",
        sendFollowUpReminder: matchingRecord.follow_up_reminder_status !== "disabled" && Boolean(matchingRecord.follow_up_date),
        notes: matchingRecord.notes || selectedAppointment.notes || ""
      });
      return;
    }

      setConsultationForm({
        symptoms: "",
        diagnosis: "",
        prescription: "",
        followUpInDays: "",
        sendFollowUpReminder: false,
        notes: selectedAppointment.notes || ""
      });

    apiRequest<MedicalRecordsResponse>(`/medical-records?appointmentId=${selectedAppointment.id}&limit=1`, {
      authenticated: true
    })
      .then((response) => {
        const record = response.data.items?.[0] || null;
        if (!record) {
          return;
        }

        setSelectedConsultationRecord(record);
          setConsultationForm({
            symptoms: record.symptoms || "",
            diagnosis: record.diagnosis || "",
            prescription: record.prescription || "",
            followUpInDays:
            record.follow_up_date
              ? String(
                  Math.max(
                    diffDaysFromDateKey(record.follow_up_date, toAppointmentDateKey(selectedAppointment.appointment_date)),
                    1
                  )
                  )
                : "",
            sendFollowUpReminder: record.follow_up_reminder_status !== "disabled" && Boolean(record.follow_up_date),
            notes: record.notes || selectedAppointment.notes || ""
          });
      })
      .catch(() => {
        setConsultationForm((current) => ({
          ...current,
          notes: current.notes || selectedAppointment.notes || ""
        }));
      });
  }, [showConsultationModal, selectedAppointment, selectedConsultationRecord]);

  useEffect(() => {
    if (!showModal || editingAppointmentId || !patientFilterId) {
      return;
    }

    const patient = patients.find((item) => item.id === patientFilterId);
    if (!patient) {
      return;
    }

    setPatientSearch((current) => (current.trim() ? current : patient.full_name));
    setForm((current) => {
      if (
        current.patientId === patient.id &&
        current.patientCode === (patient.patient_code || "") &&
        current.patientName === patient.full_name &&
        current.mobileNumber === (patient.phone || "") &&
        current.email === (patient.email || "")
      ) {
        return current;
      }

      return {
        ...current,
        patientId: patient.id,
        patientCode: patient.patient_code || "",
        patientName: patient.full_name,
        mobileNumber: patient.phone || "",
        email: patient.email || ""
      };
    });
  }, [editingAppointmentId, patientFilterId, patients, showModal]);

  const openEdit = (appointment: Appointment) => {
    setSelectedAppointment(null);
    setEditingAppointmentId(appointment.id);
    setPatientSearch(appointment.patient_name || appointment.title || "");
    setShowPatientDropdown(false);
    setDoctorSearch(appointment.doctor_name || "");
    setShowDoctorDropdown(false);
    setShowInlinePatientForm(false);
    setInlinePatientForm(initialInlinePatientForm);
    setAppointmentFormError("");
    setForm({
      patientName: appointment.patient_name || appointment.title || "",
      patientId: appointment.patient_id || "",
      patientCode: appointment.patient_identifier || "",
      mobileNumber: appointment.mobile_number || "",
      email: appointment.email || "",
      doctorId: appointment.doctor_id || "",
      category: appointment.category || "consultation",
      status: appointment.status || "pending",
      appointmentDate: toAppointmentDateKey(appointment.appointment_date),
      appointmentTime: formatClockTime(appointment.appointment_time),
      durationMinutes: String(appointment.duration_minutes || 15),
      plannedProcedures: appointment.planned_procedures || "",
      notes: appointment.notes || ""
    });
    setShowModal(true);
  };

  const selectPatient = (patientId: string) => {
    const patient = patients.find((item) => item.id === patientId);
    if (!patient) {
      return;
    }

    setPatientSearch(patient.full_name);
    setShowPatientDropdown(false);
    setForm((prev) => ({
      ...prev,
      patientId: patient.id,
      patientCode: patient.patient_code || "",
      patientName: patient.full_name,
      mobileNumber: patient.phone || "",
      email: patient.email || ""
    }));
  };

  const selectDoctor = (doctorId: string) => {
    const doctor = doctors.find((item) => item.id === doctorId);
    if (!doctor) {
      return;
    }

    setDoctorSearch(doctor.full_name);
    setShowDoctorDropdown(false);
    setForm((prev) => {
      return { ...prev, doctorId: doctor.id };
    });
  };

  const handleDoctorSearchChange = (value: string) => {
    setDoctorSearch(value);
    setShowDoctorDropdown(true);

    if (!value.trim()) {
      setForm((prev) => ({ ...prev, doctorId: "" }));
    }
  };

  const handlePatientSearchChange = (value: string) => {
    setPatientSearch(value);
    setShowPatientDropdown(true);

    if (!value.trim()) {
      setForm((prev) => ({
        ...prev,
        patientId: "",
        patientCode: "",
        patientName: "",
        mobileNumber: "",
        email: ""
      }));
    }
  };

  const openInlinePatientForm = () => {
    setShowInlinePatientForm(true);
    setInlinePatientForm({
      ...initialInlinePatientForm,
      fullName: patientSearch.trim() || form.patientName || "",
      phone: form.mobileNumber || "",
      email: form.email || ""
    });
  };

  const submitInlinePatient = async () => {
    setIsInlinePatientSubmitting(true);
    setError("");

    try {
        const response = await apiRequest<{ success: boolean; data: Patient }>("/patients", {
          method: "POST",
          authenticated: true,
          body: {
            fullName: inlinePatientForm.fullName.trim(),
            phone: inlinePatientForm.phone.trim(),
            gender: inlinePatientForm.gender,
            age: inlinePatientForm.age ? Number(inlinePatientForm.age) : null,
            email: inlinePatientForm.email.trim() || null,
            status: "active"
          }
        });

      const createdPatient = response.data;
      setPatients((prev) => [createdPatient, ...prev]);
      setShowInlinePatientForm(false);
      setInlinePatientForm(initialInlinePatientForm);
      setPatientSearch(createdPatient.full_name);
      setShowPatientDropdown(false);
      setForm((prev) => ({
        ...prev,
        patientId: createdPatient.id,
        patientCode: createdPatient.patient_code || "",
        patientName: createdPatient.full_name,
        mobileNumber: createdPatient.phone || "",
        email: createdPatient.email || ""
      }));
      setToast({ type: "success", message: "Patient created and selected" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create patient";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsInlinePatientSubmitting(false);
    }
  };

  const submitAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    setAppointmentFormError("");

    try {
      const wasEditing = Boolean(editingAppointmentId);
      const resolvedAppointmentTime = form.appointmentTime || validFormTimeOptions[0]?.value || "";
      if (!resolvedAppointmentTime) {
        throw new Error("Select a valid appointment time");
      }
      if (!form.appointmentTime) {
        setForm((prev) => ({ ...prev, appointmentTime: resolvedAppointmentTime }));
      }

      const payload = {
        patientName: form.patientName,
        patientId: form.patientId,
        mobileNumber: form.mobileNumber || null,
        email: form.email || null,
        doctorId: form.doctorId,
        category: form.category,
        status: form.status,
        appointmentDate: form.appointmentDate,
        appointmentTime: resolvedAppointmentTime,
        durationMinutes: Number(form.durationMinutes),
        plannedProcedures: form.plannedProcedures || null,
        notes: form.notes || null
      };

      const response = await apiRequest<AppointmentMutationResponse>(editingAppointmentId ? `/appointments/${editingAppointmentId}` : "/appointments", {
        method: editingAppointmentId ? "PATCH" : "POST",
        authenticated: true,
        body: payload
      });

      const savedAppointment = response.data;
      setAppointments((prev) =>
        sortAppointments(
          wasEditing
            ? prev.map((item) => (item.id === savedAppointment.id ? { ...item, ...savedAppointment } : item))
            : [savedAppointment, ...prev.filter((item) => item.id !== savedAppointment.id)]
        )
      );
      setSelectedAppointment((prev) =>
        prev && prev.id === savedAppointment.id ? { ...prev, ...savedAppointment } : prev
      );

      const createdDate = parseDate(form.appointmentDate);
      setSelectedDay(form.appointmentDate);
      setSelectedYear(createdDate.getFullYear());
      setSelectedMonth(createdDate.getMonth());
      setViewMode("day");
      setShowModal(false);
      setEditingAppointmentId(null);
      setPatientSearch("");
      setShowPatientDropdown(false);
      setDoctorSearch("");
      setShowDoctorDropdown(false);
      setShowInlinePatientForm(false);
      setInlinePatientForm(initialInlinePatientForm);
      setForm({
        ...initialForm,
        appointmentDate: form.appointmentDate
      });
      setToast({ type: "success", message: wasEditing ? "Appointment updated" : "Appointment created" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save appointment";
      setError(message);
      if (err instanceof ApiRequestError && err.status === 409) {
        setAppointmentFormError("This doctor is already booked for that time. Choose a different slot or assign another doctor.");
      } else {
        setAppointmentFormError(message);
      }
      setToast({ type: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsWalkInSubmitting(true);
    setError("");

    const now = new Date();
    const appointmentDate = toDateKey(now);
    const appointmentTime = getCurrentSlotTime(now);
    const fallbackDoctorId =
      selectedDoctor !== "all" ? selectedDoctor : doctors.find((doctor) => doctor.status === "available")?.id || "";

    try {
      const response = await apiRequest<{ success: boolean; data: Appointment }>("/appointments", {
        method: "POST",
        authenticated: true,
        body: {
          patientName: walkInForm.patientName,
          mobileNumber: walkInForm.phone || null,
          doctorId: fallbackDoctorId || null,
          category: "walk-in",
          status: "checked-in",
          appointmentDate,
          appointmentTime,
          durationMinutes: 15,
          notes: "Walk-in"
        }
      });

      setAppointments((prev) =>
        [...prev, response.data].sort((a, b) => {
          const dateDiff = toAppointmentDateKey(a.appointment_date).localeCompare(toAppointmentDateKey(b.appointment_date));
          if (dateDiff !== 0) {
            return dateDiff;
          }
          return a.appointment_time.localeCompare(b.appointment_time);
        })
      );
      setSelectedDay(appointmentDate);
      setSelectedMonth(now.getMonth());
      setSelectedYear(now.getFullYear());
      setViewMode("day");
      setShowWalkInModal(false);
      setWalkInForm(initialWalkInForm);
      setToast({ type: "success", message: "Walk-in added" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create walk-in";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsWalkInSubmitting(false);
    }
  };

  const updateAppointmentStatus = async (appointment: Appointment, status: string) => {
    setError("");
    const previousAppointments = appointments;
    const nextAppointments = previousAppointments.map((item) =>
      item.id === appointment.id
        ? {
            ...item,
            status
          }
        : item
    );

    setAppointments(nextAppointments);
    setSelectedAppointment(null);

    try {
      await apiRequest(`/appointments/${appointment.id}`, {
        method: "PATCH",
        authenticated: true,
        body: { status }
      });
      setToast({ type: "success", message: `Appointment marked ${getStatusTone(status).label.toLowerCase()}` });
      void fetchAppointments();
    } catch (err) {
      setAppointments(previousAppointments);
      const message = err instanceof Error ? err.message : "Failed to update appointment";
      setError(message);
      setToast({ type: "error", message });
    }
  };

  const confirmNoShow = async () => {
    if (!noShowTarget) {
      return;
    }

    setIsSavingNoShow(true);
    setError("");
    try {
      const response = await apiRequest<NoShowResponse>(`/appointments/${noShowTarget.id}/no-show`, {
        method: "POST",
        authenticated: true,
        body: {
          notifySms: noShowNotificationOptions.sms,
          notifyEmail: noShowNotificationOptions.email
        }
      });

      const updatedAppointment = response.data.appointment;
      setAppointments((prev) =>
        prev.map((item) => (item.id === updatedAppointment.id ? { ...item, ...updatedAppointment } : item))
      );
      setSelectedAppointment((prev) =>
        prev && prev.id === updatedAppointment.id ? { ...prev, ...updatedAppointment } : prev
      );

      const notificationSummary = response.data.notifications
        .map((item) => `${item.channel.toUpperCase()}: ${item.status}`)
        .join(", ");

      setToast({
        type: "success",
        message: notificationSummary
          ? `Appointment marked no-show. ${notificationSummary}`
          : "Appointment marked no-show"
      });
      setNoShowTarget(null);
      void fetchAppointments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to mark appointment as no-show";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsSavingNoShow(false);
    }
  };

  const deleteAppointment = async (appointment: Appointment) => {
    setError("");
    const previousAppointments = appointments;
    const nextAppointments = previousAppointments.filter((item) => item.id !== appointment.id);

    setPendingDeletedIds((prev) => {
      const next = new Set(prev);
      next.add(appointment.id);
      return next;
    });
    setAppointments(nextAppointments);
    setSelectedAppointment(null);
    setDeleteTarget(null);

    try {
      await apiRequest(`/appointments/${appointment.id}`, {
        method: "DELETE",
        authenticated: true
      });
      setPendingDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(appointment.id);
        return next;
      });
      setToast({ type: "success", message: "Appointment deleted" });
    } catch (err) {
      setAppointments(previousAppointments);
      setPendingDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(appointment.id);
        return next;
      });
      const message = err instanceof Error ? err.message : "Failed to delete appointment";
      setError(message);
      setToast({ type: "error", message });
    }
  };

  const bulkCancelAppointments = async () => {
    setIsBulkCancelling(true);
    setError("");

    const visibleTargets = appointments.filter((appointment) => {
      const sameDate = toAppointmentDateKey(appointment.appointment_date) === selectedDay;
      const sameDoctor = selectedDoctor === "all" || appointment.doctor_id === selectedDoctor;
      const cancellable = !["cancelled", "completed", "no-show"].includes((appointment.status || "").toLowerCase());
      return sameDate && sameDoctor && cancellable;
    });

    const previousAppointments = appointments;
    const visibleIds = new Set(visibleTargets.map((item) => item.id));
    setAppointments((prev) =>
      prev.map((item) => (visibleIds.has(item.id) ? { ...item, status: "cancelled" } : item))
    );

    try {
      const result = await apiRequest<{ success: boolean; data: { updatedCount: number } }>("/appointments/bulk-cancel", {
        method: "POST",
        authenticated: true,
        body: {
          appointmentDate: selectedDay,
          doctorId: selectedDoctor === "all" ? null : selectedDoctor
        }
      });
      setToast({ type: "success", message: `${result.data.updatedCount} appointments cancelled` });
      setSelectedAppointment(null);
    } catch (err) {
      setAppointments(previousAppointments);
      const message = err instanceof Error ? err.message : "Failed to cancel appointments";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsBulkCancelling(false);
    }
  };

  const submitInvoiceDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInvoiceSubmitting(true);
    setError("");

    try {
      const response = await apiRequest<CreateInvoiceResponse>("/billings", {
        method: "POST",
        authenticated: true,
        body: {
          patientId: invoiceForm.patientId,
          doctorId: invoiceForm.doctorId || null,
          appointmentId: invoiceForm.appointmentId,
          description: invoiceForm.description.trim(),
          amount: invoiceForm.amount ? Number(invoiceForm.amount) : undefined,
          dueDate: invoiceForm.dueDate || null,
          notes: invoiceForm.notes.trim() || null
        }
      });

      const createdInvoice = response.data;

      setAppointments((prev) =>
        prev.map((item) =>
          item.id === invoiceForm.appointmentId
            ? {
                ...item,
                invoice_id: createdInvoice.id,
                invoice_status: createdInvoice.status
              }
            : item
        )
      );
      setSelectedAppointment((prev) =>
        prev && prev.id === invoiceForm.appointmentId
          ? { ...prev, invoice_id: createdInvoice.id, invoice_status: createdInvoice.status }
          : prev
      );
      setShowInvoiceModal(false);
      setInvoiceForm(initialInvoiceDraft);
      setToast({ type: "success", message: "Invoice generated" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate invoice";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsInvoiceSubmitting(false);
    }
  };

  const submitConsultationCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) {
      return;
    }

    setIsConsultationSubmitting(true);
    setError("");

    try {
      const response = await apiRequest<{ success: boolean; data: { appointment: Appointment; medicalRecord: MedicalRecord } }>(
        `/appointments/${selectedAppointment.id}/complete-consultation`,
        {
          method: "POST",
          authenticated: true,
          body: {
            symptoms: consultationForm.symptoms.trim() || null,
            diagnosis: consultationForm.diagnosis.trim() || null,
            prescription: consultationForm.prescription.trim() || null,
            followUpInDays: consultationForm.followUpInDays ? Number(consultationForm.followUpInDays) : null,
            sendFollowUpReminder: consultationForm.sendFollowUpReminder,
            notes: consultationForm.notes.trim() || null
          }
        }
      );

      const updatedAppointment = response.data.appointment;
      const updatedRecord = response.data.medicalRecord;

      setAppointments((prev) =>
        prev.map((item) => (item.id === updatedAppointment.id ? { ...item, ...updatedAppointment } : item))
      );
      setSelectedAppointment((prev) =>
        prev && prev.id === updatedAppointment.id ? { ...prev, ...updatedAppointment } : prev
      );
      setSelectedConsultationRecord(updatedRecord);
      await syncAcceptedSuggestionsToMedicalRecord(updatedRecord.id);
      setConsultationForm({
        symptoms: updatedRecord.symptoms || "",
        diagnosis: updatedRecord.diagnosis || "",
        prescription: updatedRecord.prescription || "",
        followUpInDays:
          updatedRecord.follow_up_date
            ? String(
                Math.max(
                  diffDaysFromDateKey(
                    updatedRecord.follow_up_date,
                    toAppointmentDateKey(updatedAppointment.appointment_date)
                  ),
                  1
                )
                )
              : "",
        sendFollowUpReminder: updatedRecord.follow_up_reminder_status !== "disabled" && Boolean(updatedRecord.follow_up_date),
        notes: updatedRecord.notes || updatedAppointment.notes || ""
      });
      setShowConsultationModal(false);
      setToast({
        type: "success",
        message: selectedAppointment.status === "completed" ? "Consultation updated" : "Consultation completed and saved"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to complete consultation";
      setError(message);
      setToast({ type: "error", message });
    } finally {
      setIsConsultationSubmitting(false);
    }
  };

  const sendFollowUpReminder = async () => {
    if (!selectedConsultationRecord?.follow_up_date || !selectedAppointment) {
      return;
    }

    setIsSendingReminder(true);
    try {
      const response = await apiRequest<FollowUpReminderResponse>(
        `/medical-records/${selectedConsultationRecord.id}/send-follow-up-reminder`,
        {
          method: "POST",
          authenticated: true,
          body: {}
        }
      );

      const updatedRecord = response.data.record;
      const sentChannels = response.data.deliveries
        .filter((item) => item.status === "sent")
        .map((item) => item.channel.toUpperCase());

      setSelectedConsultationRecord(updatedRecord);
      setToast({
        type: "success",
        message: sentChannels.length > 0
          ? `Follow-up reminder sent via ${sentChannels.join(", ")}`
          : "Follow-up reminder processed"
      });
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to send follow-up reminder"
      });
    } finally {
      setIsSendingReminder(false);
    }
  };

  const sendAppointmentReminder = async () => {
    if (!selectedAppointment) {
      return;
    }

    setIsSendingAppointmentReminder(true);

    try {
      const response = await apiRequest<AppointmentReminderResponse>(`/appointments/${selectedAppointment.id}/send-reminder`, {
        method: "POST",
        authenticated: true,
        body: {}
      });

      const updatedAppointment = response.data.appointment;
      const reminder = response.data.reminder;

      setAppointments((prev) =>
        prev.map((item) => (item.id === updatedAppointment.id ? { ...item, ...updatedAppointment } : item))
      );
      setSelectedAppointment((prev) =>
        prev && prev.id === updatedAppointment.id ? { ...prev, ...updatedAppointment } : prev
      );
      const sentChannels = reminder.deliveries
        .filter((item) => item.status === "sent")
        .map((item) => item.channel.toUpperCase());
      setToast({
        type: "success",
        message:
          sentChannels.length > 0
            ? `${reminder.label} sent via ${sentChannels.join(", ")}`
            : "Appointment reminder processed"
      });
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to send appointment reminder"
      });
    } finally {
      setIsSendingAppointmentReminder(false);
    }
  };

  const renderTimelineBlock = (appointment: Appointment, layoutItem?: LayoutItem, compact?: boolean) => {
    const position = clampAppointment(appointment);
    if (!position) {
      return null;
    }

    const tone = getStatusTone(appointment.status);
    const normalizedStatus = (appointment.status || "").toLowerCase();
    const isCompleted = normalizedStatus === "completed";
    const isCancelled = normalizedStatus === "cancelled";
    const isNoShow = normalizedStatus === "no-show";
    const isClosedStatus = isCompleted || isCancelled || isNoShow;
    const overlap = layoutItem || { appointment, column: 0, totalColumns: 1 };
    const width = `calc(${100 / overlap.totalColumns}% - 8px)`;
    const left = `calc(${(100 / overlap.totalColumns) * overlap.column}% + 4px)`;
    const showDoctorLine = !compact && Boolean(appointment.doctor_name);

    return (
      <button
        type="button"
        key={appointment.id}
        className={`absolute left-1 right-1 overflow-hidden rounded-xl border px-3 py-2 text-left shadow-sm ${tone.block}`}
        style={{
          top: position.top + 2,
          height: Math.max(position.height - 4, compact ? 42 : 74),
          width,
          left,
          right: "auto"
        }}
        onClick={() => openAppointmentDetails(appointment)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={`truncate font-medium ${compact ? "text-[11px]" : "text-sm"} ${isClosedStatus ? "line-through opacity-75" : ""}`}>
              {appointment.patient_name || appointment.title}
            </p>
            <p className={`${compact ? "text-[10px]" : "text-xs"} opacity-80 ${isClosedStatus ? "line-through" : ""}`}>
              {appointment.category === "walk-in" ? "Walk-in" : appointment.category || "Consultation"}
            </p>
            {appointment.notes && (
              <p className={`${compact ? "text-[10px]" : "text-xs"} mt-1 truncate opacity-70`}>
                {truncateText(appointment.notes)}
              </p>
            )}
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.badge}`}>
            {tone.label}
          </span>
        </div>
        {compact ? (
          <p className={`mt-1 truncate text-[10px] ${isClosedStatus ? "opacity-75" : ""}`}>
            {formatClockTime(appointment.appointment_time)}
            {appointment.doctor_name ? ` | ${appointment.doctor_name}` : ""}
          </p>
        ) : (
          <div className={`mt-2 space-y-1 text-xs ${isClosedStatus ? "opacity-75" : ""}`}>
            <p className="font-medium">{formatClockTime(appointment.appointment_time)}</p>
            {showDoctorLine && <p className="truncate">{appointment.doctor_name}</p>}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed right-4 top-4 z-[70] rounded-xl px-4 py-3 text-sm shadow-lg ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      <div data-tour-id="tour-appointments-calendar" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-600">Schedule</p>
            <h1 className="mt-2 text-2xl text-gray-900">Appointment Calendar</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Daily view is the working schedule, weekly view helps doctor planning, and monthly view gives a quick overview.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`rounded-lg border px-4 py-2 text-sm capitalize ${
                  viewMode === mode
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {mode}
              </button>
            ))}
            {canManageCalendar && (
              <button
                onClick={openWalkIn}
                className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700 hover:bg-violet-100"
              >
                Walk-in
              </button>
            )}
            {canManageCalendar && (
              <button
                data-testid="add-appointment-button"
                data-tour-id="tour-appointments-add"
                onClick={() => openCreate(selectedDay)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Add Appointment
              </button>
            )}
          </div>
        </div>

        {patientFilterId && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Patient Filter</p>
              <p className="mt-1 text-sm text-emerald-900">
                Showing appointments for {selectedPatientFilter?.full_name || "the selected patient"}.
              </p>
            </div>
            <Link
              href="/dashboard/appointments"
              className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
            >
              Clear Filter
            </Link>
          </div>
        )}

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm text-gray-700">Year</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              {Array.from({ length: 7 }, (_, index) => today.getFullYear() - 2 + index).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm text-gray-700">Month</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm text-gray-700">Date</span>
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => {
                const next = e.target.value;
                const parsed = parseDate(next);
                setSelectedDay(next);
                setSelectedYear(parsed.getFullYear());
                setSelectedMonth(parsed.getMonth());
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm text-gray-700">Doctor Filter</span>
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="all">All Doctors</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.full_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">Showing</p>
              <h2 className="text-xl text-gray-900">{headerLabel}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Date: {selectedDay}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  Doctor: {selectedDoctorLabel}
                </span>
                {patientFilterId && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Patient: {selectedPatientFilter?.full_name || "Selected patient"}
                  </span>
                )}
                {selectedFilterDoctor?.work_start_time && selectedFilterDoctor?.work_end_time && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Hours: {selectedFilterDoctor.work_start_time.slice(0, 5)}-{selectedFilterDoctor.work_end_time.slice(0, 5)}
                  </span>
                )}
                {selectedFilterDoctor?.break_start_time && selectedFilterDoctor?.break_end_time && (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    Break: {selectedFilterDoctor.break_start_time.slice(0, 5)}-{selectedFilterDoctor.break_end_time.slice(0, 5)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void fetchAppointments()}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Refresh
              </button>
              {canManageCalendar && (
                <button
                  onClick={() => void bulkCancelAppointments()}
                  disabled={isBulkCancelling}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 disabled:opacity-60"
                >
                  {isBulkCancelling ? "Cancelling..." : "Cancel All"}
                </button>
              )}
              <button
                onClick={() => movePeriod(-1)}
                className="rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => movePeriod(1)}
                className="rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
                aria-label="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {loading && (
            <div className="mt-6 flex items-center gap-3 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
              Loading appointments...
            </div>
          )}
          {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

          {!loading && viewMode === "day" && (
            <div className="mt-6 rounded-2xl border border-gray-200">
              <div className="grid grid-cols-[72px_1fr]">
                <div className="border-r border-gray-200 bg-gray-50">
                  {TIME_SLOTS.map((slot) => (
                    <div
                      key={slot.minutes}
                      className="border-b border-gray-200 px-3 pt-2 text-xs text-gray-500"
                      style={{ height: SLOT_HEIGHT }}
                    >
                      {slot.label}
                    </div>
                  ))}
                </div>

                <div className="relative bg-white" style={{ height: timelineHeight }}>
                  {TIME_SLOTS.map((slot) => (
                    (() => {
                      const isValid = isDoctorAvailableForSlot(selectedFilterDoctor, selectedDay, slot.minutes, 15);
                      const isBlockedPast = isPastSlot(selectedDay, slot.minutes);
                      return (
                        <button
                          key={`day-slot-${slot.minutes}`}
                          type="button"
                          disabled={(!isValid && Boolean(selectedFilterDoctor)) || isBlockedPast}
                          onClick={() => canManageCalendar && openCreate(selectedDay, `${pad(Math.floor(slot.minutes / 60))}:${pad(slot.minutes % 60)}`)}
                          className={`absolute inset-x-0 border-b border-dashed border-gray-200 ${
                            ((!isValid && selectedFilterDoctor) || isBlockedPast) ? "cursor-not-allowed bg-gray-100/80" : "hover:bg-emerald-50/40"
                          }`}
                          style={{ top: ((slot.minutes - START_HOUR * 60) / SLOT_MINUTES) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                        />
                      );
                    })()
                  ))}

                  {dailyAppointments.map((appointment) =>
                    renderTimelineBlock(appointment, layoutByDate.get(selectedDay)?.get(appointment.id))
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && viewMode === "week" && (
            <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200">
              <div className="grid min-w-[980px] grid-cols-[72px_repeat(7,minmax(0,1fr))]">
                <div className="border-r border-b border-gray-200 bg-gray-50" />
                {weekDays.map((date) => {
                  const dateKey = toDateKey(date);
                  const count = (weeklyByDate.get(dateKey) || []).length;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => {
                        setSelectedDay(dateKey);
                        setSelectedMonth(date.getMonth());
                        setSelectedYear(date.getFullYear());
                        setViewMode("day");
                      }}
                      className="border-b border-r border-gray-200 bg-gray-50 px-3 py-3 text-left hover:bg-gray-100"
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{WEEK_DAYS[(date.getDay() + 6) % 7]}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{date.getDate()}</p>
                      <p className="text-xs text-gray-500">{count} scheduled</p>
                    </button>
                  );
                })}

                <div className="border-r border-gray-200 bg-gray-50">
                  {TIME_SLOTS.map((slot) => (
                    <div
                      key={`week-time-${slot.minutes}`}
                      className="border-b border-gray-200 px-3 pt-2 text-xs text-gray-500"
                      style={{ height: SLOT_HEIGHT }}
                    >
                      {slot.label}
                    </div>
                  ))}
                </div>

                {weekDays.map((date) => {
                  const dateKey = toDateKey(date);
                  const dayAppointments = weeklyByDate.get(dateKey) || [];
                  const busySlots = new Set(
                    dayAppointments
                      .map((appointment) => Math.floor((toMinutes(appointment.appointment_time) - START_HOUR * 60) / SLOT_MINUTES))
                      .filter((slotIndex) => slotIndex >= 0 && slotIndex < TIME_SLOTS.length)
                  );

                  return (
                    <div key={`week-column-${dateKey}`} className="relative border-r border-gray-200 bg-white" style={{ height: timelineHeight }}>
                      {TIME_SLOTS.map((slot, index) => {
                        const busy = busySlots.has(index);
                        const isValid = isDoctorAvailableForSlot(selectedFilterDoctor, dateKey, slot.minutes, 15);
                        const isBlockedPast = isPastSlot(dateKey, slot.minutes);
                        return (
                          <button
                            key={`week-slot-${dateKey}-${slot.minutes}`}
                            type="button"
                            disabled={(!isValid && Boolean(selectedFilterDoctor)) || isBlockedPast}
                            onClick={() => canManageCalendar && openCreate(dateKey, `${pad(Math.floor(slot.minutes / 60))}:${pad(slot.minutes % 60)}`)}
                            className={`absolute inset-x-0 border-b border-dashed ${
                              ((!isValid && selectedFilterDoctor) || isBlockedPast)
                                ? "cursor-not-allowed bg-gray-100/80"
                                : busy
                                  ? "bg-emerald-50/50"
                                  : "bg-emerald-50/30 hover:bg-emerald-50/40"
                            }`}
                            style={{ top: ((slot.minutes - START_HOUR * 60) / SLOT_MINUTES) * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                          />
                        );
                      })}

                      {dayAppointments.map((appointment) =>
                        renderTimelineBlock(appointment, layoutByDate.get(dateKey)?.get(appointment.id), true)
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && viewMode === "month" && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
              <div className="grid grid-cols-7 bg-gray-50">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="border-b border-r border-gray-200 px-4 py-3 text-xs text-gray-500 last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {monthGrid.map((date) => {
                  const dateKey = toDateKey(date);
                  const dayAppointments = filteredByDate.get(dateKey) || [];
                  const inMonth = isSameMonth(date, new Date(selectedYear, selectedMonth, 1));

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => {
                        setSelectedDay(dateKey);
                        setSelectedMonth(date.getMonth());
                        setSelectedYear(date.getFullYear());
                        setViewMode("day");
                      }}
                      className={`min-h-[132px] border-b border-r border-gray-200 p-4 text-left transition last:border-r-0 ${
                        inMonth ? "bg-white text-gray-900 hover:bg-gray-50" : "bg-gray-50 text-gray-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium">{date.getDate()}</span>
                        {dayAppointments.length > 0 && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                            {dayAppointments.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {dayAppointments.slice(0, 4).map((appointment) => {
                          const tone = getStatusTone(appointment.status);
                          return <span key={appointment.id} className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />;
                        })}
                        {dayAppointments.length > 4 && (
                          <span className="text-[11px] font-medium text-gray-500">+{dayAppointments.length - 4} more</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Visible Appointments</p>
                <h2 className="text-xl text-gray-900">{summaryAppointments.length}</h2>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {Object.entries(STATUS_TONES).map(([key, tone]) => (
                <div key={key} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${tone.dot}`} />
                    <span className="text-sm text-gray-700">{tone.label}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${tone.badge}`}>
                    {statusSummary[key] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg text-gray-900">
              {viewMode === "day" ? "Daily Agenda" : viewMode === "week" ? "Weekly Agenda" : "Monthly Agenda"}
            </h3>
            <div className="mt-5 space-y-3">
              {summaryAppointments.length === 0 && !loading && (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                  No appointments match the current view.
                </div>
              )}

              {summaryAppointments.slice(0, 8).map((appointment) => {
                const tone = getStatusTone(appointment.status);
                const normalizedStatus = (appointment.status || "").toLowerCase();
                const isCompleted = normalizedStatus === "completed";
                const isCancelled = normalizedStatus === "cancelled";
                const isNoShow = normalizedStatus === "no-show";
                const isClosedStatus = isCompleted || isCancelled || isNoShow;
                return (
                  <div key={appointment.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-emerald-600">
                          {appointment.appointment_date} | {formatClockTime(appointment.appointment_time)}
                        </p>
                        <h3 className={`mt-1 text-gray-900 ${isClosedStatus ? "line-through opacity-70" : ""}`}>
                          {appointment.patient_name || appointment.title}
                        </h3>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${tone.badge}`}>{tone.label}</span>
                    </div>
                    <p className={`mt-2 text-sm text-gray-700 ${isClosedStatus ? "opacity-70" : ""}`}>
                      {appointment.category === "walk-in" ? "Walk-in" : appointment.category || "Consultation"}
                      {appointment.doctor_name ? ` with ${appointment.doctor_name}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <form data-testid="appointment-form-modal" onSubmit={submitAppointment} className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-lg text-gray-900">{editingAppointmentId ? "Edit Appointment" : "Add Appointment"}</h2>
            </div>

            <div className="grid gap-5 p-6 md:grid-cols-2">
              <div ref={patientSearchRef} className="relative block space-y-2">
                <span className="text-sm text-gray-700">Find Patient *</span>
                <input
                  data-testid="appointment-find-patient-input"
                  type="text"
                  value={patientSearch}
                  onChange={(e) => handlePatientSearchChange(e.target.value)}
                  onFocus={() => setShowPatientDropdown(true)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Search by patient name"
                  required
                />

                {showPatientDropdown && filteredPatients.length > 0 && (
                  <div
                    data-testid="appointment-patient-dropdown"
                    className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                  >
                    {filteredPatients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => selectPatient(patient.id)}
                        className="flex w-full flex-col gap-1 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-emerald-50"
                      >
                        <span className="text-sm font-medium text-gray-900">{patient.full_name}</span>
                        <span className="text-xs text-gray-500">
                          {patient.patient_code} | {patient.phone} {patient.email ? `| ${patient.email}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {showPatientDropdown && patientSearch.trim() && filteredPatients.length === 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-lg">
                    No patient matched the search.
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">
                    {filteredPatients.length === 0
                      ? "No patient matched the search."
                      : "Choose an existing patient or create one inline."}
                  </p>
                  <button
                    type="button"
                    onClick={openInlinePatientForm}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Create New Patient
                  </button>
                </div>
              </div>

              {selectedFormPatient && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 md:col-span-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-sky-950">{selectedFormPatient.full_name}</p>
                      <p className="mt-1 text-xs text-sky-800">
                        {selectedFormPatient.patient_code}
                        {selectedFormPatient.gender ? ` • ${selectedFormPatient.gender}` : ""}
                        {selectedFormPatient.age !== null ? ` • ${selectedFormPatient.age} yrs` : ""}
                      </p>
                    </div>
                    <div className="text-right text-xs text-sky-900">
                      <p>{selectedFormPatient.phone || "-"}</p>
                      <p>{selectedFormPatient.email || "No email"}</p>
                    </div>
                  </div>
                </div>
              )}

              {showInlinePatientForm && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm text-gray-900">Create New Patient</h3>
                      <p className="mt-1 text-xs text-gray-600">Add the patient here and continue booking immediately.</p>
                    </div>
                    <ModalCloseButton
                      onClick={() => {
                        setShowInlinePatientForm(false);
                        setInlinePatientForm(initialInlinePatientForm);
                      }}
                    />
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm text-gray-700">Full Name *</span>
                      <input
                        type="text"
                        value={inlinePatientForm.fullName}
                        onChange={(e) => setInlinePatientForm((prev) => ({ ...prev, fullName: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        required={showInlinePatientForm}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm text-gray-700">Phone *</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={inlinePatientForm.phone}
                        onChange={(e) =>
                          setInlinePatientForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        required={showInlinePatientForm}
                      />
                    </label>

                      <label className="block space-y-2">
                        <span className="text-sm text-gray-700">Gender *</span>
                        <select
                        value={inlinePatientForm.gender}
                        onChange={(e) => setInlinePatientForm((prev) => ({ ...prev, gender: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                        </select>
                      </label>

                      <label className="block space-y-2">
                        <span className="text-sm text-gray-700">Age</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="\d*"
                          value={inlinePatientForm.age}
                          onChange={(e) =>
                            setInlinePatientForm((prev) => ({
                              ...prev,
                              age: e.target.value.replace(/\D/g, "").slice(0, 3)
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        />
                      </label>

                      <label className="block space-y-2 md:col-span-2">
                        <span className="text-sm text-gray-700">Email</span>
                        <input
                        type="email"
                        value={inlinePatientForm.email}
                        onChange={(e) => setInlinePatientForm((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void submitInlinePatient()}
                      disabled={isInlinePatientSubmitting}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isInlinePatientSubmitting ? "Creating..." : "Create and Select"}
                    </button>
                  </div>
                </div>
              )}

              {appointmentFormError && (
                <div className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-800">Time slot conflict</p>
                  <p className="mt-1 text-sm text-red-700">{appointmentFormError}</p>
                </div>
              )}

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Patient Name *</span>
                <input
                  data-testid="appointment-patient-name-input"
                  type="text"
                  value={form.patientName}
                  readOnly
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-700"
                  placeholder="Select a patient first"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Patient ID *</span>
                <input
                  data-testid="appointment-patient-id-input"
                  type="text"
                  value={form.patientCode}
                  readOnly
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-700"
                  placeholder="Auto-filled from selected patient record"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Mobile Number</span>
                <input
                  data-testid="appointment-mobile-number-input"
                  type="text"
                  value={form.mobileNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, mobileNumber: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Enter Mobile Number"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Email ID</span>
                <input
                  data-testid="appointment-email-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Enter Email ID"
                />
              </label>

              <div ref={doctorSearchRef} className="relative block space-y-2">
                <span className="text-sm text-gray-700">Doctor *</span>
                <input
                  data-testid="appointment-doctor-search-input"
                  type="text"
                  value={doctorSearch}
                  onChange={(e) => handleDoctorSearchChange(e.target.value)}
                  onFocus={() => setShowDoctorDropdown(true)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Search by doctor name, specialty, phone, or email"
                  required
                />

                {showDoctorDropdown && filteredDoctors.length > 0 && (
                  <div
                    data-testid="appointment-doctor-dropdown"
                    className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                  >
                    {filteredDoctors.map((doctor) => (
                      <button
                        key={doctor.id}
                        type="button"
                        onClick={() => selectDoctor(doctor.id)}
                        className="flex w-full flex-col gap-1 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-emerald-50"
                      >
                        <span className="text-sm font-medium text-gray-900">{doctor.full_name}</span>
                        <span className="text-xs text-gray-500">
                          {doctor.specialty || "Doctor"} {doctor.phone ? `| ${doctor.phone}` : ""}
                          {doctor.email ? ` | ${doctor.email}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {showDoctorDropdown && doctorSearch.trim() && filteredDoctors.length === 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-lg">
                    No doctor matched the search.
                  </div>
                )}
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Category *</span>
                <select
                  data-testid="appointment-category-select"
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="consultation">Consultation</option>
                  <option value="follow-up">Follow-up</option>
                  <option value="procedure">Procedure</option>
                  <option value="checkup">Checkup</option>
                  <option value="emergency">Emergency</option>
                  <option value="review">Review</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Status *</span>
                <select
                  data-testid="appointment-status-select"
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked-in">Checked-in</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                  <option value="no-show">No-show</option>
                </select>
              </label>

              <div className="grid gap-4 md:col-span-2 md:grid-cols-[1.1fr_1fr_1fr]">
                <label className="block space-y-2">
                  <span className="text-sm text-gray-700">Scheduled On *</span>
                  <input
                    data-testid="appointment-date-input"
                    type="date"
                    value={form.appointmentDate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        appointmentDate: e.target.value
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    required
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-gray-700">Time *</span>
                  <select
                    data-testid="appointment-time-select"
                    value={form.appointmentTime}
                    onChange={(e) => setForm((prev) => ({ ...prev, appointmentTime: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    required
                  >
                    {!validFormTimeOptions.length && <option value="">Select time</option>}
                    {validFormTimeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-gray-700">Duration</span>
                  <select
                    data-testid="appointment-duration-select"
                    value={form.durationMinutes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        durationMinutes: e.target.value
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Planned Procedures</span>
                <textarea
                  data-testid="appointment-procedures-input"
                  rows={4}
                  value={form.plannedProcedures}
                  onChange={(e) => setForm((prev) => ({ ...prev, plannedProcedures: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Add Procedure"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Notes</span>
                <textarea
                  data-testid="appointment-notes-input"
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Add Notes"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                data-testid="appointment-cancel-button"
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditingAppointmentId(null);
                  setAppointmentFormError("");
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Cancel
              </button>
              <button
                data-testid="appointment-submit-button"
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : editingAppointmentId ? "Save Changes" : "Create Appointment"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showWalkInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={submitWalkIn} className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-lg text-gray-900">Add Walk-in</h2>
              <p className="mt-1 text-sm text-gray-500">Quick check-in for patients arriving physically.</p>
            </div>

            <div className="space-y-4 p-6">
              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Patient Name *</span>
                <input
                  type="text"
                  value={walkInForm.patientName}
                  onChange={(e) => setWalkInForm((prev) => ({ ...prev, patientName: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Enter patient name"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Phone</span>
                <input
                  type="text"
                  value={walkInForm.phone}
                  onChange={(e) => setWalkInForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Optional phone number"
                />
              </label>

              <div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-800">
                This will create a walk-in appointment for today at the current time slot and mark it as checked-in.
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                type="button"
                onClick={() => {
                  setShowWalkInModal(false);
                  setWalkInForm(initialWalkInForm);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isWalkInSubmitting}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {isWalkInSubmitting ? "Saving..." : "Save Walk-in"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showInvoiceModal && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={submitInvoiceDraft} className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-lg text-gray-900">Generate Invoice</h2>
              <p className="mt-1 text-sm text-gray-500">Create a bill from this completed appointment.</p>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2">
              <label className="block space-y-2 md:col-span-2">
                <span className="text-sm text-gray-700">Description</span>
                <input
                  type="text"
                  value={invoiceForm.description}
                  onChange={(e) => setInvoiceForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Amount</span>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Auto-filled from doctor fee if available"
                  required
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Due Date</span>
                <input
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(e) => setInvoiceForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>

              <label className="block space-y-2 md:col-span-2">
                <span className="text-sm text-gray-700">Notes</span>
                <textarea
                  rows={3}
                  value={invoiceForm.notes}
                  onChange={(e) => setInvoiceForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                type="button"
                onClick={() => {
                  setShowInvoiceModal(false);
                  setInvoiceForm(initialInvoiceDraft);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isInvoiceSubmitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isInvoiceSubmitting ? "Generating..." : "Generate Invoice"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showConsultationModal && selectedAppointment && (
        <div className="fixed inset-0 z-[56] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <form onSubmit={submitConsultationCompletion} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-lg text-gray-900">
                {selectedAppointment.status === "completed" ? "Update Consultation" : "Complete Consultation"}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Save clinical notes and mark this appointment as completed in one step.
              </p>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2">
              <label className="block space-y-2 md:col-span-2">
                <span className="text-sm text-gray-700">Symptoms / Chief Complaint</span>
                <textarea
                  rows={3}
                  value={consultationForm.symptoms}
                  onChange={(e) => setConsultationForm((prev) => ({ ...prev, symptoms: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Fever, cough, fatigue"
                />
              </label>

              <label className="block space-y-2 md:col-span-2">
                <span className="text-sm text-gray-700">Diagnosis</span>
                <textarea
                  rows={3}
                  value={consultationForm.diagnosis}
                  onChange={(e) => setConsultationForm((prev) => ({ ...prev, diagnosis: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Upper respiratory tract infection"
                />
              </label>

              {canGenerateAiPrescription && (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 md:col-span-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="inline-flex items-center gap-2 text-sm font-medium text-violet-900">
                        <Sparkles className="h-4 w-4" />
                        AI Prescription Suggestions
                      </p>
                      <p className="mt-1 text-sm text-violet-800">
                        Generate a conservative prescription draft from the current symptoms and diagnosis. A doctor must review it before use.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void generateAiPrescriptionSuggestion()}
                      disabled={
                        isGeneratingAiSuggestion ||
                        (!consultationForm.symptoms.trim() && !consultationForm.diagnosis.trim())
                      }
                      className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isGeneratingAiSuggestion ? "Generating..." : "Generate Suggestion"}
                    </button>
                  </div>

                  {aiSuggestionError && <p className="mt-3 text-sm text-red-600">{aiSuggestionError}</p>}

                  {aiSuggestions.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-dashed border-violet-200 bg-white px-4 py-3 text-sm text-violet-700">
                      No AI prescription drafts yet for this consultation.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {aiSuggestions.map((suggestion) => (
                        <div key={suggestion.id} className="rounded-xl border border-violet-200 bg-white p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                                  suggestion.status === "accepted"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : suggestion.status === "rejected"
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-violet-100 text-violet-800"
                                }`}
                              >
                                {suggestion.status}
                              </span>
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-700">
                                {suggestion.confidence} confidence
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {formatDateTime(suggestion.created_at, "Draft")}
                            </p>
                          </div>

                          {suggestion.clinical_summary && (
                            <p className="mt-3 text-sm text-gray-700">{suggestion.clinical_summary}</p>
                          )}

                          {suggestion.prescription_text && (
                            <div className="mt-3 rounded-xl bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950 whitespace-pre-wrap">
                              {suggestion.prescription_text}
                            </div>
                          )}

                          {suggestion.care_plan.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Care Plan</p>
                              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                                {suggestion.care_plan.map((item) => (
                                  <li key={item}>- {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {suggestion.guardrails.length > 0 && (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.14em] text-amber-700">Guardrails</p>
                              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                                {suggestion.guardrails.map((item) => (
                                  <li key={item}>- {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {suggestion.red_flags.length > 0 && (
                            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.14em] text-rose-700">Red Flags</p>
                              <ul className="mt-2 space-y-1 text-sm text-rose-900">
                                {suggestion.red_flags.map((item) => (
                                  <li key={item}>- {item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <p className="mt-3 text-xs text-gray-500">{suggestion.disclaimer}</p>

                          {suggestion.status === "generated" ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void reviewAiPrescriptionSuggestion(suggestion, "accepted")}
                                disabled={reviewingAiSuggestionId === suggestion.id}
                                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {reviewingAiSuggestionId === suggestion.id ? "Saving..." : "Apply Suggestion"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void reviewAiPrescriptionSuggestion(suggestion, "rejected")}
                                disabled={reviewingAiSuggestionId === suggestion.id}
                                className="rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                              >
                                Reject Draft
                              </button>
                            </div>
                          ) : (
                            <p className="mt-4 text-xs text-gray-500">
                              Reviewed {formatDateTime(suggestion.reviewed_at, "recently")}
                              {suggestion.reviewed_by_name ? ` by ${suggestion.reviewed_by_name}` : ""}.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <label className="block space-y-2 md:col-span-2">
                <span className="text-sm text-gray-700">Prescription / Plan</span>
                <textarea
                  rows={4}
                  value={consultationForm.prescription}
                  onChange={(e) => setConsultationForm((prev) => ({ ...prev, prescription: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Paracetamol 650 mg, hydration, follow-up in 3 days"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-gray-700">Follow-up in days</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={consultationForm.followUpInDays}
                  onChange={(e) =>
                    setConsultationForm((prev) => ({
                      ...prev,
                      followUpInDays: e.target.value.replace(/\D/g, "").slice(0, 3)
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="3"
                />
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={consultationForm.sendFollowUpReminder}
                  onChange={(e) =>
                    setConsultationForm((prev) => ({
                      ...prev,
                      sendFollowUpReminder: e.target.checked
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                />
                <div>
                  <p className="text-sm text-emerald-900">Send follow-up reminder on the follow-up day</p>
                  <p className="text-xs text-emerald-700">Only same-day follow-up reminders will be scheduled.</p>
                </div>
              </label>

              <label className="block space-y-2 md:col-span-2">
                <span className="text-sm text-gray-700">Clinical Notes</span>
                <textarea
                  rows={4}
                  value={consultationForm.notes}
                  onChange={(e) => setConsultationForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Additional consultation notes"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                type="button"
                onClick={() => setShowConsultationModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isConsultationSubmitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {isConsultationSubmitting ? "Saving..." : selectedAppointment.status === "completed" ? "Update Consultation" : "Complete & Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-6">
              <div>
                <p className="text-sm text-gray-500">Appointment Details</p>
                <h2 className="text-lg text-gray-900">{selectedAppointment.patient_name || selectedAppointment.title}</h2>
              </div>
              <ModalCloseButton onClick={() => setSelectedAppointment(null)} />
            </div>

            <div className="space-y-4 p-6">
              {(() => {
                const reminderWindow = getAppointmentReminderWindow(selectedAppointment.appointment_date);
                const canSendAppointmentReminder = !["completed", "cancelled", "no-show"].includes(
                  (selectedAppointment.status || "").toLowerCase()
                );
                const canOpenSameDayReminder = reminderWindow.key === "same_day";

                if (!canSendAppointmentReminder) {
                  return null;
                }

                return (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.14em] text-sky-700">Appointment Reminder</p>
                        <p className="mt-1 text-sm text-sky-900">
                          Use WhatsApp for same-day appointment reminders only.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void sendAppointmentReminder()}
                        disabled={isSendingAppointmentReminder || !canOpenSameDayReminder}
                        className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm text-sky-700 hover:bg-sky-100 disabled:opacity-60"
                      >
                        {isSendingAppointmentReminder ? "Opening..." : "Send Appointment Reminder"}
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-xs text-sky-700">Reminder Availability</p>
                        <p className="mt-1 text-sm text-sky-950">{reminderWindow.label}</p>
                      </div>
                      <div>
                        <p className="text-xs text-sky-700">Patient Phone</p>
                        <p className="mt-1 text-sm text-sky-950">{selectedAppointment.mobile_number || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-sky-700">Same-Day Sent</p>
                        <p className="mt-1 text-sm text-sky-950">{formatTimestamp(selectedAppointment.reminder_same_day_sent_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500">When</p>
                  <p className="mt-2 text-sm text-gray-900">
                    {selectedAppointment.appointment_date} at {formatClockTime(selectedAppointment.appointment_time)}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Doctor</p>
                  <p className="mt-2 text-sm text-gray-900">{selectedAppointment.doctor_name || "Not assigned"}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Reason</p>
                  <p className="mt-2 text-sm text-gray-900">{selectedAppointment.category || "Consultation"}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Status</p>
                  <p className="mt-2 text-sm text-gray-900">{getStatusTone(selectedAppointment.status).label}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Billing</p>
                  <p className="mt-2 text-sm text-gray-900">{getInvoiceDisplayStatus(selectedAppointment)}</p>
                </div>
              </div>

              {selectedAppointment.notes && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Notes</p>
                  <p className="mt-2 text-sm text-gray-900">{selectedAppointment.notes}</p>
                </div>
              )}

              {selectedConsultationRecord && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-emerald-700">Consultation Summary</p>
                      <p className="mt-1 text-sm text-emerald-900">Saved to the patient medical record.</p>
                    </div>
                    <Link
                      href="/dashboard/medical-records"
                      className="rounded-lg border border-emerald-200 px-3 py-2 text-xs text-emerald-700 hover:bg-white"
                    >
                      Open Records
                    </Link>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-emerald-700">Symptoms</p>
                      <p className="mt-1 text-sm text-emerald-950">{selectedConsultationRecord.symptoms || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700">Diagnosis</p>
                      <p className="mt-1 text-sm text-emerald-950">{selectedConsultationRecord.diagnosis || "-"}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-emerald-700">Prescription</p>
                      <p className="mt-1 text-sm text-emerald-950 whitespace-pre-wrap">{selectedConsultationRecord.prescription || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700">Follow-up Date</p>
                      <p className="mt-1 text-sm text-emerald-950">{selectedConsultationRecord.follow_up_date || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-700">Reminder Status</p>
                      <p className="mt-1 text-sm text-emerald-950">{selectedConsultationRecord.follow_up_reminder_status || "pending"}</p>
                    </div>
                  </div>
                  {selectedConsultationRecord.follow_up_date && (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void sendFollowUpReminder()}
                        disabled={isSendingReminder}
                        className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        {isSendingReminder ? "Opening..." : "Send Reminder"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4">
                {selectedAppointment.patient_id && (
                  <Link
                    href={`/dashboard/patients/${selectedAppointment.patient_id}`}
                    className="rounded-lg border border-emerald-200 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                  >
                    Open Patient Profile
                  </Link>
                )}
                {canManageCalendar && (
                  <button
                    type="button"
                    onClick={() => openEdit(selectedAppointment)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                )}
                {selectedAppointment.status !== "completed" && (
                  <button
                    type="button"
                    onClick={() => openConsultationCompletion(selectedAppointment)}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 hover:bg-sky-100"
                  >
                    Complete Consultation
                  </button>
                )}
                {selectedAppointment.status === "completed" && (
                  <button
                    type="button"
                    onClick={() => openConsultationCompletion(selectedAppointment)}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700 hover:bg-sky-100"
                  >
                    Update Consultation
                  </button>
                )}
                {!["checked-in", "completed", "cancelled", "no-show"].includes((selectedAppointment.status || "").toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => void updateAppointmentStatus(selectedAppointment, "checked-in")}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700 hover:bg-violet-100"
                  >
                    Check In
                  </button>
                )}
                {!["completed", "cancelled", "no-show"].includes((selectedAppointment.status || "").toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setNoShowNotificationOptions({ sms: true, email: true });
                      setNoShowTarget(selectedAppointment);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    Mark No-show
                  </button>
                )}
                {canManageCalendar && (selectedAppointment.status || "").toLowerCase() === "completed" && !selectedAppointment.invoice_id && (
                  <button
                    type="button"
                    onClick={() => openGenerateInvoice(selectedAppointment)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
                  >
                    Generate Invoice
                  </button>
                )}
                {canManageCalendar && selectedAppointment.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={() => void updateAppointmentStatus(selectedAppointment, "cancelled")}
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
                  >
                    Cancel Appointment
                  </button>
                )}
                {canDeleteCalendarAppointments && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(selectedAppointment)}
                    className="rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-lg text-gray-900">Delete Appointment</h2>
            </div>

            <div className="space-y-3 p-6">
              <p className="text-sm text-gray-700">
                Delete the appointment for <span className="font-medium text-gray-900">{deleteTarget.patient_name || deleteTarget.title}</span>?
              </p>
              <p className="text-sm text-gray-500">
                {deleteTarget.appointment_date} at {formatClockTime(deleteTarget.appointment_time)}
              </p>
              <p className="text-sm text-red-600">This removes it from the database. Cancel keeps the record, delete does not.</p>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                onClick={() => void deleteAppointment(deleteTarget)}
                className="rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {noShowTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-6 py-5">
              <h2 className="text-xl text-gray-900">
                Patient No Show - {noShowTarget.patient_name || noShowTarget.title}
              </h2>
            </div>

            <div className="space-y-5 px-6 py-6">
              <p className="text-base text-gray-800">
                Once marked PNS, action can&apos;t be reverted. Are you sure you want to mark no show?
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <span className="text-sm text-gray-700">Notify Patient via</span>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={noShowNotificationOptions.sms}
                    onChange={(e) =>
                      setNoShowNotificationOptions((prev) => ({ ...prev, sms: e.target.checked }))
                    }
                  />
                  <span>SMS</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={noShowNotificationOptions.email}
                    onChange={(e) =>
                      setNoShowNotificationOptions((prev) => ({ ...prev, email: e.target.checked }))
                    }
                  />
                  <span>EMAIL</span>
                </label>
              </div>

              <p className="text-sm leading-7 text-gray-600">
                Patient will be informed about no show. As the patient did not book via Medsyra.com,{" "}
                <span className="text-sky-600 underline">PNS Policy</span> is not applicable for them.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setNoShowTarget(null)}
                disabled={isSavingNoShow}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm text-gray-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmNoShow()}
                disabled={isSavingNoShow}
                className="rounded-lg bg-amber-400 px-5 py-2 text-sm text-white disabled:opacity-60"
              >
                {isSavingNoShow ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
