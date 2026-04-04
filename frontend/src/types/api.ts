export interface AuthUser {
  id: string;
  organization_id: string;
  organization_name?: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  notify_daily_schedule_sms?: boolean;
  notify_daily_schedule_email?: boolean;
}

export interface Patient {
  id: string;
  full_name: string;
  age: number | null;
  gender: string;
  phone: string;
  email: string | null;
  blood_type: string | null;
  emergency_contact: string | null;
  address: string | null;
  status: string;
  last_visit_at: string | null;
}

export interface Doctor {
  id: string;
  full_name: string;
  specialty: string;
  experience_years: number | null;
  availability: string | null;
  phone: string | null;
  email: string | null;
  user_id?: string | null;
  linked_user_full_name?: string | null;
  linked_user_email?: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
  weekly_off_days: string | null;
  holiday_dates: string | null;
  consultation_fee: number | null;
  rating: number;
  patient_count: number;
  status: string;
}

export interface Appointment {
  id: string;
  title: string;
  patient_id?: string | null;
  patient_name: string | null;
  patient_identifier: string | null;
  mobile_number: string | null;
  email: string | null;
  doctor_id: string | null;
  doctor_name?: string | null;
  category: string | null;
  status: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  planned_procedures: string | null;
  notes: string | null;
  reminder_3d_sent_at?: string | null;
  reminder_1d_sent_at?: string | null;
  reminder_same_day_sent_at?: string | null;
  invoice_id?: string | null;
  invoice_status?: string | null;
}

export interface MedicalRecord {
  id: string;
  appointment_id?: string | null;
  patient_id: string;
  patient_name: string;
  doctor_id: string;
  doctor_name: string;
  record_type: string;
  status: string;
  record_date: string;
  symptoms?: string | null;
  diagnosis?: string | null;
  prescription?: string | null;
  follow_up_date?: string | null;
  follow_up_reminder_status?: string | null;
  follow_up_reminder_sent_at?: string | null;
  follow_up_reminder_error?: string | null;
  follow_up_reminder_last_attempt_at?: string | null;
  notes: string | null;
  file_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityLog {
  id: string;
  event_type: string;
  title: string;
  entity_name: string | null;
  event_time: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  organization_name?: string;
  patient_id: string;
  patient_name: string;
  doctor_id: string | null;
  doctor_name: string | null;
  appointment_id?: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  currency: string;
  notes: string | null;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export interface Payment {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  paid_at: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
}

export interface SmartSummaryItem {
  label: string;
  value: string;
}
