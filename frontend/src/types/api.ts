export interface AuthUser {
  id: string;
  organization_id: string;
  organization_name?: string;
  branch_id?: string | null;
  branch_name?: string | null;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  notify_daily_schedule_sms?: boolean;
  notify_daily_schedule_email?: boolean;
}

export interface Branch {
  id: string;
  organization_id: string;
  branch_code: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  is_active: boolean;
  is_default: boolean;
  staff_count?: number;
  today_appointments?: number;
  active_patients?: number;
  recent_revenue?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Patient {
  id: string;
  patient_code: string;
  full_name: string;
  age: number | null;
  date_of_birth: string | null;
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
  branch_id?: string | null;
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
  branch_id?: string | null;
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

export interface AiPrescriptionSuggestionItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  reason: string;
}

export interface AiPrescriptionSuggestion {
  id: string;
  organization_id?: string;
  branch_id?: string | null;
  patient_id: string;
  patient_name?: string | null;
  doctor_id?: string | null;
  doctor_name?: string | null;
  appointment_id?: string | null;
  medical_record_id?: string | null;
  generated_by_user_id?: string | null;
  generated_by_name?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_by_name?: string | null;
  status: "generated" | "accepted" | "rejected";
  input_symptoms?: string | null;
  input_diagnosis?: string | null;
  input_notes?: string | null;
  clinical_summary?: string | null;
  prescription_text?: string | null;
  suggestion_items: AiPrescriptionSuggestionItem[];
  care_plan: string[];
  guardrails: string[];
  red_flags: string[];
  confidence: "low" | "medium" | "high";
  disclaimer: string;
  suggestion_payload?: Record<string, unknown>;
  patient_snapshot?: Record<string, unknown>;
  review_note?: string | null;
  reviewed_at?: string | null;
  model_name?: string | null;
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
  branch_id?: string | null;
  invoice_number: string;
  organization_name?: string;
  organization_id?: string;
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
  payment_links?: InvoicePaymentLink[];
  latest_payment_link?: InvoicePaymentLink | null;
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

export interface InvoicePaymentLink {
  id: string;
  organization_id?: string;
  invoice_id?: string;
  provider: string;
  provider_link_id?: string | null;
  short_url: string | null;
  status: string;
  amount: number;
  currency: string;
  expires_at: string | null;
  paid_at: string | null;
  last_synced_at?: string | null;
  provider_payment_id?: string | null;
  provider_payload?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReconciliationReport {
  summary: {
    totalInvoices: number;
    mismatchedInvoices: number;
    outstandingInvoices: number;
    refundedPayments: number;
    refundedAmount: number;
  };
  items: Array<{
    id: string;
    invoice_number: string;
    status: string;
    total_amount: number;
    paid_amount: number;
    balance_amount: number;
    computed_paid_amount: number;
    computed_balance_amount: number;
  }>;
}

export interface InsuranceProvider {
  id: string;
  organization_id: string;
  payer_code: string | null;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  portal_url: string | null;
  is_active: boolean;
  open_claim_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface InsuranceClaimEvent {
  id: string;
  organization_id: string;
  claim_id: string;
  actor_user_id: string | null;
  actor_name?: string | null;
  event_type: "claim_created" | "claim_submitted" | "status_changed" | "claim_updated" | "approval_recorded" | "payment_recorded" | "note_added";
  previous_status: string | null;
  next_status: string | null;
  note: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface InsuranceClaim {
  id: string;
  organization_id: string;
  claim_number: string;
  provider_id: string;
  provider_name: string;
  payer_code: string | null;
  patient_id: string;
  patient_code: string | null;
  patient_name: string;
  phone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  appointment_id: string | null;
  medical_record_id: string | null;
  record_type: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  policy_number: string | null;
  member_id: string | null;
  status: "draft" | "submitted" | "under_review" | "approved" | "partially_approved" | "rejected" | "settled" | "cancelled";
  claimed_amount: number;
  approved_amount: number;
  paid_amount: number;
  diagnosis_summary: string | null;
  treatment_summary: string | null;
  submitted_date: string | null;
  response_due_date: string | null;
  approved_date: string | null;
  settled_date: string | null;
  rejection_reason: string | null;
  notes: string | null;
  last_status_changed_at: string | null;
  days_to_response: number | null;
  event_count?: number;
  events?: InsuranceClaimEvent[];
  created_at?: string;
  updated_at?: string;
}

export interface NotificationDelivery {
  channel: "whatsapp" | "sms" | "email";
  status: "sent" | "failed" | "fallback" | "opened" | "skipped";
  recipient?: string;
  error?: string;
}

export interface NotificationPreferencesData {
  preferences: {
    appointment_whatsapp_enabled: boolean;
    appointment_sms_enabled: boolean;
    follow_up_whatsapp_enabled: boolean;
    follow_up_sms_enabled: boolean;
    staff_schedule_email_enabled: boolean;
    staff_schedule_sms_enabled: boolean;
    smart_timing_enabled: boolean;
    appointment_lead_minutes: number;
    follow_up_send_hour: number;
    condition_based_follow_up_enabled: boolean;
    campaign_whatsapp_enabled: boolean;
    campaign_sms_enabled: boolean;
    created_at?: string;
    updated_at?: string;
  };
  providers: {
    whatsapp: {
      enabled: boolean;
      configured: boolean;
    };
    sms: {
      enabled: boolean;
      configured: boolean;
    };
    email: {
      enabled?: boolean;
      configured: boolean;
      provider?: string;
    };
  };
}

export interface NotificationLog {
  id: string;
  notification_type: string;
  channel: "whatsapp" | "sms" | "email";
  status: "sent" | "failed" | "fallback" | "opened" | "skipped";
  reference_id: string | null;
  recipient: string | null;
  message_preview: string | null;
  error_message: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface NotificationTemplate {
  id: string;
  organization_id: string;
  name: string;
  notification_type: "appointment_reminder" | "follow_up_reminder" | "marketing_campaign";
  channel: "whatsapp" | "sms";
  template_key: string;
  condition_tag: string | null;
  body: string;
  is_default: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationCampaign {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  audience_type: "all_active" | "dormant_30" | "dormant_60" | "follow_up_due" | "chronic";
  template_id: string;
  template_name?: string | null;
  template_channel?: "whatsapp" | "sms" | null;
  channel_config: {
    whatsapp: boolean;
    sms: boolean;
  };
  scheduled_for: string | null;
  status: "draft" | "scheduled" | "sent" | "partial" | "failed";
  total_recipients: number;
  successful_recipients: number;
  failed_recipients: number;
  notes: string | null;
  last_sent_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CrmTask {
  id: string;
  patient_id: string;
  patient_code: string | null;
  patient_name: string;
  phone: string | null;
  source_record_id: string | null;
  source_appointment_id: string | null;
  task_type: "follow_up" | "recall" | "retention";
  title: string;
  priority: "high" | "medium" | "low";
  status: "open" | "contacted" | "scheduled" | "not_reachable" | "closed" | "dismissed";
  due_date: string;
  days_until_due: number;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  last_contacted_at: string | null;
  next_action_at: string | null;
  outcome_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  record_type?: string | null;
  next_appointment_id?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  next_appointment_status?: string | null;
}

export interface LabTest {
  id: string;
  organization_id: string;
  code: string | null;
  name: string;
  department: string | null;
  price: number;
  turnaround_hours: number | null;
  instructions: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LabOrderItem {
  id: string;
  lab_test_id: string | null;
  test_name: string;
  price: number;
  result_summary: string | null;
}

export interface LabOrder {
  id: string;
  organization_id: string;
  order_number: string;
  patient_id: string;
  patient_code: string | null;
  patient_name: string;
  phone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  appointment_id: string | null;
  ordered_by_user_id: string | null;
  ordered_by_name: string | null;
  status: "ordered" | "sample_collected" | "processing" | "report_ready" | "completed" | "cancelled";
  ordered_date: string;
  due_date: string | null;
  notes: string | null;
  report_file_url: string | null;
  sample_collected_at: string | null;
  processing_started_at: string | null;
  report_ready_at: string | null;
  completed_at: string | null;
  items: LabOrderItem[];
  created_at?: string;
  updated_at?: string;
}

export interface Medicine {
  id: string;
  organization_id: string;
  code: string | null;
  name: string;
  generic_name: string | null;
  dosage_form: string | null;
  strength: string | null;
  unit: string;
  reorder_level: number;
  is_active: boolean;
  current_stock?: number;
  active_batch_count?: number;
  nearest_expiry_date?: string | null;
  expiring_batch_count?: number;
  dispensed_last_30_days?: number;
  suggested_reorder_quantity?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MedicineBatch {
  id: string;
  organization_id: string;
  medicine_id: string;
  medicine_code: string | null;
  medicine_name: string;
  generic_name: string | null;
  unit: string;
  reorder_level?: number;
  batch_number: string;
  manufacturer: string | null;
  expiry_date: string;
  received_quantity: number;
  available_quantity: number;
  purchase_price: number;
  sale_price: number;
  received_date: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PharmacyDispenseItem {
  id: string;
  medicine_id: string;
  medicine_batch_id: string;
  medicine_name: string;
  batch_number: string;
  expiry_date: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  directions: string | null;
}

export interface PharmacyDispense {
  id: string;
  organization_id: string;
  dispense_number: string;
  patient_id: string;
  patient_code: string | null;
  patient_name: string;
  phone: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  appointment_id: string | null;
  medical_record_id: string | null;
  medical_record_date: string | null;
  medical_record_type: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  dispensed_by_user_id: string | null;
  dispensed_by_name: string | null;
  status: "dispensed" | "cancelled";
  dispensed_date: string;
  prescription_snapshot: string | null;
  notes: string | null;
  items: PharmacyDispenseItem[];
  created_at?: string;
  updated_at?: string;
}

export interface InventoryItem {
  id: string;
  organization_id: string;
  code: string | null;
  name: string;
  category: string | null;
  unit: string;
  reorder_level: number;
  is_active: boolean;
  current_stock: number;
  total_movements: number;
  last_movement_date?: string | null;
  latest_unit_cost: number;
  wastage_quantity: number;
  wastage_value: number;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryMovement {
  id: string;
  organization_id: string;
  item_id: string;
  item_code: string | null;
  item_name: string;
  item_category: string | null;
  item_unit: string;
  movement_type: "stock_in" | "usage" | "wastage" | "adjustment_in" | "adjustment_out";
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
  movement_date: string;
  performed_by_user_id: string | null;
  performed_by_name: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SmartSummaryItem {
  label: string;
  value: string;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  module: string;
  action: string;
  summary: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  severity: "info" | "warning" | "critical";
  outcome: "success" | "denied" | "failed";
  is_destructive: boolean;
  ip_address: string | null;
  user_agent: string | null;
  path: string | null;
  method: string | null;
  metadata?: Record<string, unknown>;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  created_at: string;
}

export interface SecurityOverviewData {
  summary: {
    windowDays: number;
    totalEvents: number;
    destructiveActions: number;
    deniedActions: number;
    criticalEvents: number;
    lockedAccounts: number;
    activeAccounts7d: number;
  };
  moduleBreakdown: Array<{
    module: string;
    total: number;
    destructiveCount: number;
    deniedCount: number;
  }>;
  recentDestructive: Array<{
    id: string;
    summary: string;
    module: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    entity_label: string | null;
    severity: "info" | "warning" | "critical";
    outcome: "success" | "denied" | "failed";
    created_at: string;
    actor_role: string | null;
    actor_name: string | null;
  }>;
  userAccess: Array<{
    role: string;
    total: number;
    verifiedTotal: number;
    loggedInTotal: number;
    lockedTotal: number;
    latestLoginAt: string | null;
  }>;
  protectedActions: Array<{
    action: string;
    roles: string[];
    description: string;
  }>;
}
