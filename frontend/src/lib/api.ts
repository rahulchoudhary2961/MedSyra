import { getSelectedBranchId } from "./branch-selection";
import { isGuestModeEnabled } from "./guest-mode";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  authenticated?: boolean;
};

type SessionFetchOptions = RequestInit & {
  authenticated?: boolean;
};

export class ApiRequestError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const guestToday = new Date().toISOString().slice(0, 10);
const guestPatients = [
  {
    id: "33333333-3333-3333-3333-333333333331",
    patient_code: "PAT-0001",
    full_name: "Sarah Johnson",
    age: 32,
    date_of_birth: new Date(Date.now() - 32 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    gender: "female",
    phone: "(555) 123-4567",
    email: "sarah.j@email.com",
    blood_type: "O+",
    emergency_contact: null,
    address: null,
    status: "active",
    last_visit_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "33333333-3333-3333-3333-333333333332",
    patient_code: "PAT-0002",
    full_name: "Mike Chen",
    age: 45,
    date_of_birth: new Date(Date.now() - 45 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    gender: "male",
    phone: "(555) 234-5678",
    email: "mike.c@email.com",
    blood_type: "A+",
    emergency_contact: null,
    address: null,
    status: "active",
    last_visit_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    patient_code: "PAT-0003",
    full_name: "Emma Davis",
    age: 28,
    date_of_birth: new Date(Date.now() - 28 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    gender: "female",
    phone: "(555) 345-6789",
    email: "emma.d@email.com",
    blood_type: "B+",
    emergency_contact: null,
    address: null,
    status: "follow-up",
    last_visit_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  }
];

const guestDoctors = [
  {
    id: "44444444-4444-4444-4444-444444444441",
    full_name: "Dr. Emily Smith",
    specialty: "Cardiology",
    experience_years: 15,
    availability: "Mon-Fri, 10:00-18:00",
    phone: "(555) 111-2222",
    email: "e.smith@hospital.com",
    user_id: null,
    linked_user_full_name: null,
    linked_user_email: null,
    work_start_time: "10:00",
    work_end_time: "18:00",
    break_start_time: "13:00",
    break_end_time: "13:30",
    weekly_off_days: null,
    holiday_dates: null,
    consultation_fee: 120,
    rating: 4.9,
    patient_count: 342,
    status: "available"
  },
  {
    id: "44444444-4444-4444-4444-444444444442",
    full_name: "Dr. Michael Williams",
    specialty: "Pediatrics",
    experience_years: 12,
    availability: "Mon-Sat, 09:00-15:00",
    phone: "(555) 222-3333",
    email: "m.williams@hospital.com",
    user_id: null,
    linked_user_full_name: null,
    linked_user_email: null,
    work_start_time: "09:00",
    work_end_time: "15:00",
    break_start_time: "12:00",
    break_end_time: "12:30",
    weekly_off_days: null,
    holiday_dates: null,
    consultation_fee: 95,
    rating: 4.8,
    patient_count: 289,
    status: "available"
  },
  {
    id: "44444444-4444-4444-4444-444444444443",
    full_name: "Dr. Sarah Brown",
    specialty: "Orthopedics",
    experience_years: 18,
    availability: "Mon-Fri, 11:00-17:00",
    phone: "(555) 333-4444",
    email: "s.brown@hospital.com",
    user_id: null,
    linked_user_full_name: null,
    linked_user_email: null,
    work_start_time: "11:00",
    work_end_time: "17:00",
    break_start_time: "14:00",
    break_end_time: "14:30",
    weekly_off_days: null,
    holiday_dates: null,
    consultation_fee: 150,
    rating: 4.9,
    patient_count: 421,
    status: "busy"
  }
];

const guestDoctor = guestDoctors[0];

const guestBranch = {
  id: "44444444-4444-4444-4444-444444444444",
  organization_id: "11111111-1111-1111-1111-111111111111",
  branch_code: "MAIN",
  name: "City General Hospital",
  address: "Hospital Campus",
  phone: "(555) 101-0000",
  email: "admin@citygeneral.com",
  timezone: "Asia/Calcutta",
  is_active: true,
  is_default: true,
  staff_count: 4,
  today_appointments: 1,
  active_patients: 3,
  recent_revenue: 0
};

const guestAppointments = [
  {
    id: "55555555-5555-5555-5555-555555555551",
    branch_id: guestBranch.id,
    title: "Sarah Johnson",
    patient_id: guestPatients[0].id,
    patient_name: guestPatients[0].full_name,
    patient_identifier: guestPatients[0].patient_code,
    mobile_number: guestPatients[0].phone,
    email: guestPatients[0].email,
    doctor_id: guestDoctors[0].id,
    doctor_name: guestDoctors[0].full_name,
    category: "consultation",
    status: "scheduled",
    appointment_date: new Date().toISOString().slice(0, 10),
    appointment_time: "09:00:00",
    duration_minutes: 15,
    planned_procedures: "Blood pressure review",
    notes: "Check follow-up medication response",
    reminder_3d_sent_at: null,
    reminder_1d_sent_at: null,
    reminder_same_day_sent_at: null,
    invoice_id: null,
    invoice_status: null
  },
  {
    id: "55555555-5555-5555-5555-555555555552",
    branch_id: guestBranch.id,
    title: "Mike Chen",
    patient_id: guestPatients[1].id,
    patient_name: guestPatients[1].full_name,
    patient_identifier: guestPatients[1].patient_code,
    mobile_number: guestPatients[1].phone,
    email: guestPatients[1].email,
    doctor_id: guestDoctors[1].id,
    doctor_name: guestDoctors[1].full_name,
    category: "follow-up",
    status: "scheduled",
    appointment_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    appointment_time: "11:30:00",
    duration_minutes: 30,
    planned_procedures: "Routine child wellness visit",
    notes: "General follow-up discussion",
    reminder_3d_sent_at: null,
    reminder_1d_sent_at: null,
    reminder_same_day_sent_at: null,
    invoice_id: null,
    invoice_status: null
  },
  {
    id: "55555555-5555-5555-5555-555555555553",
    branch_id: guestBranch.id,
    title: "Emma Davis",
    patient_id: guestPatients[2].id,
    patient_name: guestPatients[2].full_name,
    patient_identifier: guestPatients[2].patient_code,
    mobile_number: guestPatients[2].phone,
    email: guestPatients[2].email,
    doctor_id: guestDoctors[2].id,
    doctor_name: guestDoctors[2].full_name,
    category: "procedure",
    status: "scheduled",
    appointment_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    appointment_time: "15:00:00",
    duration_minutes: 45,
    planned_procedures: "Minor orthopedic procedure",
    notes: "Operations planning meeting",
    reminder_3d_sent_at: null,
    reminder_1d_sent_at: null,
    reminder_same_day_sent_at: null,
    invoice_id: null,
    invoice_status: null
  }
];

const guestMedicalRecords = [
  {
    id: "66666666-6666-6666-6666-666666666661",
    branch_id: guestBranch.id,
    appointment_id: null,
    patient_id: guestPatients[0].id,
    patient_name: guestPatients[0].full_name,
    doctor_id: guestDoctors[0].id,
    doctor_name: guestDoctors[0].full_name,
    record_type: "Lab Results",
    status: "completed",
    record_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    symptoms: null,
    diagnosis: null,
    prescription: null,
    follow_up_date: null,
    follow_up_reminder_status: "pending",
    follow_up_reminder_sent_at: null,
    follow_up_reminder_error: null,
    follow_up_reminder_last_attempt_at: null,
    notes: "Lipid profile normal",
    file_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "66666666-6666-6666-6666-666666666662",
    branch_id: guestBranch.id,
    appointment_id: null,
    patient_id: guestPatients[1].id,
    patient_name: guestPatients[1].full_name,
    doctor_id: guestDoctors[1].id,
    doctor_name: guestDoctors[1].full_name,
    record_type: "X-Ray",
    status: "pending review",
    record_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    symptoms: null,
    diagnosis: null,
    prescription: null,
    follow_up_date: null,
    follow_up_reminder_status: "pending",
    follow_up_reminder_sent_at: null,
    follow_up_reminder_error: null,
    follow_up_reminder_last_attempt_at: null,
    notes: "Requires specialist review",
    file_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const guestAppointment = guestAppointments[0];
const guestMedicalRecord = guestMedicalRecords[0];

const guestDashboardPayload = {
  stats: {
    todayAppointments: 1,
    todayRevenue: 0,
    pendingPayments: 0,
    noShows: 0
  },
  insights: {
    patientsDidNotReturn: 0,
    mostCommonIssue: {
      label: "Blood pressure review",
      count: 1
    },
    weeklyRevenue: 0,
    followUpsDueToday: 0
  },
  operations: {
    todayWaiting: 1,
    pendingPayments: 0,
    pendingPaymentAmount: 0,
    followUpsDue: 0,
    followUpsOverdue: 0,
    labReportsReady: 0,
    insuranceFollowUpsDue: 0,
    actionRequired: []
  },
  crm: {
    followUpQueue: [],
    recallQueue: []
  },
  recentActivity: [
    {
      id: "77777777-7777-7777-7777-777777777771",
      event_type: "patient_created",
      title: "Patient created",
      entity_name: "Sarah Johnson",
      event_time: new Date().toISOString()
    },
    {
      id: "77777777-7777-7777-7777-777777777772",
      event_type: "record",
      title: "Medical record updated",
      entity_name: "Mike Chen",
      event_time: new Date().toISOString()
    },
    {
      id: "77777777-7777-7777-7777-777777777773",
      event_type: "record",
      title: "Lab review completed",
      entity_name: "Emma Davis",
      event_time: new Date().toISOString()
    }
  ]
};

const guestPharmacyInsights = {
  generated_at: new Date().toISOString(),
  low_stock_count: 0,
  out_of_stock_count: 0,
  total_suggested_reorder_quantity: 0,
  low_stock_items: []
};

const buildGuestPatientProfile = (patientId: string) => {
  const patient = guestPatients.find((item) => item.id === patientId) || guestPatients[0];
  const visits = guestAppointments.filter((appointment) => appointment.patient_id === patient.id);
  const records = guestMedicalRecords.filter((record) => record.patient_id === patient.id);

  return {
    patient,
    visits,
    medicalRecords: records,
    invoices: [],
    labOrders: [],
    pharmacyDispenses: [],
    smartSummary: patient.id === guestPatients[0].id
      ? [
          { label: "Last visit", value: "1 day ago - Blood pressure review" },
          { label: "Visit frequency", value: "1 visit in last 2 months" },
          { label: "Ongoing issue", value: "Lab Results" }
        ]
      : [
          { label: "Last visit", value: "Recent visit logged" },
          { label: "Visit frequency", value: "1 visit in last 2 months" }
        ],
    summary: {
      totalVisits: visits.length,
      totalSpent: 0,
      lastVisitDate: patient.last_visit_at || guestToday,
      pendingAmount: 0
    }
  };
};

const mockGuestResponse = (path: string, options: RequestOptions = {}) => {
  const method = options.method || "GET";
  if (method !== "GET") {
    return new Response(JSON.stringify({ success: false, message: "Guest mode is read-only" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  const cleanPath = path.split("?")[0];

  if (cleanPath === "/auth/me") {
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: "22222222-2222-2222-2222-222222222222",
        organization_id: "11111111-1111-1111-1111-111111111111",
        organization_name: "City General Hospital",
        branch_id: null,
        branch_name: null,
        full_name: "Dr. Admin",
        email: "admin@citygeneral.com",
        phone: "(555) 101-0000",
        role: "admin"
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/dashboard/summary") {
    return new Response(JSON.stringify({ success: true, data: guestDashboardPayload }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath.startsWith("/patients/") && cleanPath.endsWith("/profile")) {
    const patientId = cleanPath.split("/")[2];
    return new Response(JSON.stringify({ success: true, data: buildGuestPatientProfile(patientId) }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/patients") {
    return new Response(JSON.stringify({ success: true, data: { items: guestPatients, pagination: { page: 1, limit: 20, total: guestPatients.length, totalPages: 1 } } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath.startsWith("/patients/")) {
    const id = cleanPath.split("/")[2];
    const patient = guestPatients.find((item) => item.id === id) || guestPatients[0];
    return new Response(JSON.stringify({ success: true, data: patient }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/appointments") {
    return new Response(JSON.stringify({
      success: true,
      data: {
        items: guestAppointments,
        pagination: { page: 1, limit: 20, total: guestAppointments.length, totalPages: 1 }
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/medical-records") {
    return new Response(JSON.stringify({
      success: true,
      data: {
        items: guestMedicalRecords,
        pagination: { page: 1, limit: 20, total: guestMedicalRecords.length, totalPages: 1 }
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/billings") {
    return new Response(JSON.stringify({ success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/crm/tasks") {
    return new Response(JSON.stringify({ success: true, data: { items: [], summary: { totalTasks: 0, openTasks: 0, contactedTasks: 0, scheduledTasks: 0, closedTasks: 0, overdueTasks: 0, dueTodayTasks: 0 } } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/crm/intelligence") {
    return new Response(JSON.stringify({ success: true, data: { summary: { autoSuggestions: 0, missedFollowUps: 0, inactive30Days: 0, inactive60Days: 0, chronicPatients: 0 }, autoSuggestions: [], missedFollowUps: [], inactive30Days: [], inactive60Days: [], chronicPatients: [] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/branches") {
    return new Response(JSON.stringify({ success: true, data: { items: [guestBranch] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/doctors") {
    return new Response(JSON.stringify({ success: true, data: { items: guestDoctors } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/lab/tests") {
    return new Response(JSON.stringify({ success: true, data: { items: [] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/lab/orders") {
    return new Response(JSON.stringify({ success: true, data: { items: [] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/pharmacy/insights") {
    return new Response(JSON.stringify({ success: true, data: guestPharmacyInsights }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/pharmacy") {
    return new Response(JSON.stringify({ success: true, data: { items: [] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/inventory") {
    return new Response(JSON.stringify({ success: true, data: { items: [] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/insurance") {
    return new Response(JSON.stringify({ success: true, data: { items: [] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/reports") {
    return new Response(JSON.stringify({ success: true, data: { period: "30d" } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/assistant") {
    return new Response(JSON.stringify({ success: true, data: { reply: "Guest preview mode: browse the workspace with demo data only." } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/doctor-tools/prescription-workspace") {
    return new Response(JSON.stringify({ success: true, data: { actor_doctor_id: null, templates: [], favorites: [], lastPrescription: null, suggestions: [] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (cleanPath === "/notifications") {
    return new Response(JSON.stringify({ success: true, data: { items: [], preferences: {}, logs: [] } }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ success: true, data: { items: [] } }), {
    headers: { "Content-Type": "application/json" }
  });
};

export const apiFetch = async (path: string, options: SessionFetchOptions = {}) => {
  if (isGuestModeEnabled()) {
    return mockGuestResponse(path, options as RequestOptions);
  }

  const { authenticated = false, headers: rawHeaders, ...requestInit } = options;
  const headers = new Headers(rawHeaders || undefined);

  if (authenticated) {
    const selectedBranchId = getSelectedBranchId();
    if (selectedBranchId) {
      headers.set("X-Branch-Id", selectedBranchId);
    }
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers,
    credentials: "include"
  });
};

export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  if (isGuestModeEnabled()) {
    const response = mockGuestResponse(path, options);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.message || "Guest mode is read-only";
      throw new ApiRequestError(message, response.status, payload?.details || null);
    }
    return payload as T;
  }

  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await apiFetch(path, {
    method: options.method || "GET",
    authenticated: options.authenticated,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || "Something went wrong";
    throw new ApiRequestError(message, response.status, payload?.details || null);
  }

  return payload as T;
};
