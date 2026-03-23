export interface AuthUser {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
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
  rating: number;
  patient_count: number;
  status: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string;
  doctor_id: string;
  doctor_name: string;
  appointment_date: string;
  appointment_time: string;
  appointment_type: string;
  status: string;
  notes: string | null;
  fee_amount: number;
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  patient_name: string;
  doctor_id: string;
  doctor_name: string;
  record_type: string;
  status: string;
  record_date: string;
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
  patient_id: string;
  patient_name: string;
  doctor_id: string | null;
  doctor_name: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  currency: string;
  notes: string | null;
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
