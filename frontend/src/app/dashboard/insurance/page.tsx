"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileHeart, Plus, RefreshCcw, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessInsurance, canManageInsuranceCatalog } from "@/lib/roles";
import { AuthUser, InsuranceClaim, InsuranceProvider } from "@/types/api";

type MeResponse = { success: boolean; data: AuthUser };
type ProvidersResponse = { success: boolean; data: { items: InsuranceProvider[] } };
type ClaimsResponse = { success: boolean; data: { items: InsuranceClaim[] } };
type ClaimResponse = { success: boolean; data: InsuranceClaim };
type ClaimEventResponse = { success: boolean; data: { claim: InsuranceClaim } };
type ReferenceDataResponse = {
  success: boolean;
  data: {
    patients: Array<{ id: string; patient_code: string | null; full_name: string; phone: string | null }>;
    doctors: Array<{ id: string; full_name: string; specialty: string | null }>;
    medicalRecords: Array<{
      id: string;
      patient_id: string;
      patient_name: string;
      patient_code: string | null;
      doctor_id: string | null;
      doctor_name: string | null;
      record_type: string;
      record_date: string;
      diagnosis: string | null;
    }>;
    invoices: Array<{
      id: string;
      patient_id: string;
      patient_name: string;
      patient_code: string | null;
      invoice_number: string;
      status: string;
      issue_date: string;
      total_amount: number;
      balance_amount: number;
    }>;
  };
};

type PatientReference = ReferenceDataResponse["data"]["patients"][number];
type PatientReferenceResponse = {
  success: boolean;
  data: PatientReference;
};

type ClaimStatus = InsuranceClaim["status"];

type ProviderForm = {
  payerCode: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  portalUrl: string;
};

type ClaimForm = {
  patientId: string;
  providerId: string;
  doctorId: string;
  medicalRecordId: string;
  invoiceId: string;
  policyNumber: string;
  memberId: string;
  status: ClaimStatus;
  claimedAmount: string;
  diagnosisSummary: string;
  treatmentSummary: string;
  submittedDate: string;
  responseDueDate: string;
  notes: string;
};

type ClaimUpdateForm = ClaimForm & {
  approvedAmount: string;
  paidAmount: string;
  rejectionReason: string;
};

type EventForm = {
  note: string;
  nextStatus: string;
  approvedAmount: string;
  paidAmount: string;
  rejectionReason: string;
  responseDueDate: string;
};

const claimStatuses: ClaimStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "partially_approved",
  "rejected",
  "settled",
  "cancelled"
];

const todayDateKey = () => new Date().toISOString().slice(0, 10);
const formatStatus = (value: string) => value.replace(/_/g, " ");
const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};
const formatCurrency = (value: number | string | null | undefined) =>
  `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const getStatusTone = (status: ClaimStatus) => {
  if (status === "settled") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "approved" || status === "partially_approved") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "rejected" || status === "cancelled") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "under_review" || status === "submitted") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-gray-100 text-gray-700 ring-gray-200";
};

const buildProviderForm = (): ProviderForm => ({
  payerCode: "",
  name: "",
  contactEmail: "",
  contactPhone: "",
  portalUrl: ""
});

const buildClaimForm = (patientId = ""): ClaimForm => ({
  patientId,
  providerId: "",
  doctorId: "",
  medicalRecordId: "",
  invoiceId: "",
  policyNumber: "",
  memberId: "",
  status: "draft",
  claimedAmount: "",
  diagnosisSummary: "",
  treatmentSummary: "",
  submittedDate: todayDateKey(),
  responseDueDate: "",
  notes: ""
});

const buildUpdateForm = (): ClaimUpdateForm => ({
  ...buildClaimForm(""),
  approvedAmount: "",
  paidAmount: "",
  rejectionReason: ""
});

const buildEventForm = (): EventForm => ({
  note: "",
  nextStatus: "",
  approvedAmount: "",
  paidAmount: "",
  rejectionReason: "",
  responseDueDate: ""
});

export default function InsurancePage() {
  const searchParams = useSearchParams();
  const patientFilterId = searchParams.get("patientId") || "";
  const LIST_PREVIEW_LIMIT = 6;
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [patients, setPatients] = useState<ReferenceDataResponse["data"]["patients"]>([]);
  const [doctors, setDoctors] = useState<ReferenceDataResponse["data"]["doctors"]>([]);
  const [medicalRecords, setMedicalRecords] = useState<ReferenceDataResponse["data"]["medicalRecords"]>([]);
  const [invoices, setInvoices] = useState<ReferenceDataResponse["data"]["invoices"]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [selectedClaim, setSelectedClaim] = useState<InsuranceClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filters, setFilters] = useState({ q: "", status: "", providerId: "", patientId: patientFilterId });
  const [providerForm, setProviderForm] = useState<ProviderForm>(buildProviderForm());
  const [claimForm, setClaimForm] = useState<ClaimForm>(buildClaimForm(patientFilterId));
  const [editForm, setEditForm] = useState<ClaimUpdateForm>(buildUpdateForm());
  const [eventForm, setEventForm] = useState<EventForm>(buildEventForm());
  const [showAllClaims, setShowAllClaims] = useState(false);
  const [showAllClaimEvents, setShowAllClaimEvents] = useState(false);

  const loadReferenceData = useCallback(async (patientId = "") => {
    const params = new URLSearchParams();
    if (patientId) params.set("patientId", patientId);
    const response = await apiRequest<ReferenceDataResponse>(
      `/insurance/reference-data${params.toString() ? `?${params.toString()}` : ""}`,
      { authenticated: true }
    );
    setPatients(response.data.patients || []);
    setDoctors(response.data.doctors || []);
    setMedicalRecords(response.data.medicalRecords || []);
    setInvoices(response.data.invoices || []);
  }, []);

  const loadClaims = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.providerId) params.set("providerId", filters.providerId);
    if (patientFilterId || filters.patientId) params.set("patientId", patientFilterId || filters.patientId);
    const response = await apiRequest<ClaimsResponse>(`/insurance/claims?${params.toString()}`, { authenticated: true });
    setClaims(response.data.items || []);
  }, [filters.patientId, filters.providerId, filters.q, filters.status, patientFilterId]);

  const loadClaimDetail = useCallback(async (claimId: string) => {
    if (!claimId) {
      setSelectedClaimId("");
      setSelectedClaim(null);
      return;
    }

    const response = await apiRequest<ClaimResponse>(`/insurance/claims/${claimId}`, { authenticated: true });
    const claim = response.data;
    setSelectedClaimId(claim.id);
    setSelectedClaim(claim);
    setEditForm({
      patientId: claim.patient_id,
      providerId: claim.provider_id,
      doctorId: claim.doctor_id || "",
      medicalRecordId: claim.medical_record_id || "",
      invoiceId: claim.invoice_id || "",
      policyNumber: claim.policy_number || "",
      memberId: claim.member_id || "",
      status: claim.status,
      claimedAmount: String(claim.claimed_amount || ""),
      approvedAmount: String(claim.approved_amount || ""),
      paidAmount: String(claim.paid_amount || ""),
      diagnosisSummary: claim.diagnosis_summary || "",
      treatmentSummary: claim.treatment_summary || "",
      submittedDate: claim.submitted_date || "",
      responseDueDate: claim.response_due_date || "",
      rejectionReason: claim.rejection_reason || "",
      notes: claim.notes || ""
    });
    setEventForm(buildEventForm());
    await loadReferenceData(claim.patient_id);
  }, [loadReferenceData]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const meResponse = await apiRequest<MeResponse>("/auth/me", { authenticated: true });
      setCurrentUser(meResponse.data);
      const patientContext = claimForm.patientId || patientFilterId || filters.patientId || "";
      const [providersResponse] = await Promise.all([
        apiRequest<ProvidersResponse>("/insurance/providers?limit=100", { authenticated: true }),
        loadReferenceData(patientContext),
        loadClaims()
      ]);
      setProviders(providersResponse.data.items || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load insurance workspace");
    } finally {
      setLoading(false);
    }
  }, [claimForm.patientId, filters.patientId, loadClaims, loadReferenceData, patientFilterId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setClaimForm(buildClaimForm(patientFilterId || filters.patientId || ""));
  }, [filters.patientId, patientFilterId]);

  useEffect(() => {
    if (!patientFilterId || patients.some((patient) => patient.id === patientFilterId)) {
      return;
    }

    apiRequest<PatientReferenceResponse>(`/patients/${patientFilterId}`, { authenticated: true })
      .then((response) => {
        setPatients((current) => {
          if (current.some((patient) => patient.id === response.data.id)) {
            return current;
          }

          return [
            {
              id: response.data.id,
              patient_code: response.data.patient_code || null,
              full_name: response.data.full_name,
              phone: response.data.phone || null
            },
            ...current
          ];
        });
      })
      .catch(() => undefined);
  }, [patientFilterId, patients]);

  const claimSummary = useMemo(() => ({
    total: claims.length,
    open: claims.filter((claim) => ["submitted", "under_review", "approved", "partially_approved"].includes(claim.status)).length,
    settledAmount: claims.reduce((sum, claim) => sum + Number(claim.paid_amount || 0), 0),
    atRisk: claims.filter((claim) => claim.days_to_response !== null && claim.days_to_response <= 2 && !["settled", "rejected", "cancelled"].includes(claim.status)).length
  }), [claims]);
  const visibleClaims = showAllClaims ? claims : claims.slice(0, LIST_PREVIEW_LIMIT);
  const visibleClaimEvents = showAllClaimEvents ? (selectedClaim?.events || []) : (selectedClaim?.events || []).slice(0, LIST_PREVIEW_LIMIT);

  const providerOptions = useMemo(
    () => providers.filter((provider) => provider.is_active).map((provider) => ({ id: provider.id, label: `${provider.name}${provider.payer_code ? ` | ${provider.payer_code}` : ""}` })),
    [providers]
  );

  const filteredMedicalRecords = useMemo(
    () => medicalRecords.filter((record) => !claimForm.patientId || record.patient_id === claimForm.patientId),
    [claimForm.patientId, medicalRecords]
  );
  const filteredInvoices = useMemo(
    () => invoices.filter((invoice) => !claimForm.patientId || invoice.patient_id === claimForm.patientId),
    [claimForm.patientId, invoices]
  );
  const selectedInvoice = useMemo(
    () => filteredInvoices.find((invoice) => invoice.id === claimForm.invoiceId) || null,
    [claimForm.invoiceId, filteredInvoices]
  );

  const handleClaimPatientChange = async (patientId: string) => {
    setClaimForm((current) => ({
      ...current,
      patientId,
      medicalRecordId: "",
      invoiceId: "",
      doctorId: "",
      claimedAmount: "",
      diagnosisSummary: "",
      treatmentSummary: ""
    }));
    await loadReferenceData(patientId);
  };

  const handleInvoiceChange = (invoiceId: string) => {
    const invoice = filteredInvoices.find((item) => item.id === invoiceId);
    setClaimForm((current) => ({
      ...current,
      invoiceId,
      claimedAmount: invoice ? String(invoice.balance_amount || invoice.total_amount || "") : current.claimedAmount
    }));
  };

  const handleRecordChange = (medicalRecordId: string) => {
    const record = filteredMedicalRecords.find((item) => item.id === medicalRecordId);
    setClaimForm((current) => ({
      ...current,
      medicalRecordId,
      doctorId: record?.doctor_id || current.doctorId,
      diagnosisSummary: record?.diagnosis || current.diagnosisSummary,
      treatmentSummary: record ? `${record.record_type} | ${formatDate(record.record_date)}` : current.treatmentSummary
    }));
  };

  const handleRefresh = async () => {
    setMessage("");
    await loadPage();
    if (selectedClaimId) {
      await loadClaimDetail(selectedClaimId);
    }
  };

  const submitProvider = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest<{ success: boolean; data: InsuranceProvider }>("/insurance/providers", {
        method: "POST",
        authenticated: true,
        body: {
          payerCode: providerForm.payerCode.trim() || undefined,
          name: providerForm.name.trim(),
          contactEmail: providerForm.contactEmail.trim() || undefined,
          contactPhone: providerForm.contactPhone.trim() || undefined,
          portalUrl: providerForm.portalUrl.trim() || undefined
        }
      });

      setProviders((current) => [response.data, ...current]);
      setProviderForm(buildProviderForm());
      setShowProviderForm(false);
      setMessage("Insurance provider created.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save insurance provider");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitClaim = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await apiRequest<ClaimResponse>("/insurance/claims", {
        method: "POST",
        authenticated: true,
        body: {
          patientId: claimForm.patientId,
          providerId: claimForm.providerId,
          doctorId: claimForm.doctorId || undefined,
          medicalRecordId: claimForm.medicalRecordId || undefined,
          invoiceId: claimForm.invoiceId || undefined,
          policyNumber: claimForm.policyNumber.trim() || undefined,
          memberId: claimForm.memberId.trim() || undefined,
          status: claimForm.status,
          claimedAmount: claimForm.claimedAmount ? Number(claimForm.claimedAmount) : undefined,
          diagnosisSummary: claimForm.diagnosisSummary.trim() || undefined,
          treatmentSummary: claimForm.treatmentSummary.trim() || undefined,
          submittedDate: claimForm.submittedDate || undefined,
          responseDueDate: claimForm.responseDueDate || undefined,
          notes: claimForm.notes.trim() || undefined
        }
      });

      setClaims((current) => [response.data, ...current]);
      setClaimForm(buildClaimForm(patientFilterId || filters.patientId || ""));
      setShowClaimForm(false);
      setMessage("Insurance claim submitted.");
      await loadClaimDetail(response.data.id);
      await loadClaims();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create insurance claim");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitClaimUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClaimId) return;

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      await apiRequest<ClaimResponse>(`/insurance/claims/${selectedClaimId}`, {
        method: "PATCH",
        authenticated: true,
        body: {
          providerId: editForm.providerId,
          patientId: editForm.patientId,
          doctorId: editForm.doctorId || undefined,
          medicalRecordId: editForm.medicalRecordId || undefined,
          invoiceId: editForm.invoiceId || undefined,
          policyNumber: editForm.policyNumber.trim() || undefined,
          memberId: editForm.memberId.trim() || undefined,
          status: editForm.status,
          claimedAmount: Number(editForm.claimedAmount),
          approvedAmount: editForm.approvedAmount ? Number(editForm.approvedAmount) : 0,
          paidAmount: editForm.paidAmount ? Number(editForm.paidAmount) : 0,
          diagnosisSummary: editForm.diagnosisSummary.trim() || undefined,
          treatmentSummary: editForm.treatmentSummary.trim() || undefined,
          submittedDate: editForm.submittedDate || undefined,
          responseDueDate: editForm.responseDueDate || undefined,
          rejectionReason: editForm.rejectionReason.trim() || undefined,
          notes: editForm.notes.trim() || undefined
        }
      });

      await Promise.all([loadClaims(), loadClaimDetail(selectedClaimId)]);
      setMessage("Insurance claim updated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update insurance claim");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitClaimEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedClaimId) return;

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      await apiRequest<ClaimEventResponse>(`/insurance/claims/${selectedClaimId}/events`, {
        method: "POST",
        authenticated: true,
        body: {
          note: eventForm.note.trim() || undefined,
          nextStatus: eventForm.nextStatus || undefined,
          approvedAmount: eventForm.approvedAmount ? Number(eventForm.approvedAmount) : undefined,
          paidAmount: eventForm.paidAmount ? Number(eventForm.paidAmount) : undefined,
          rejectionReason: eventForm.rejectionReason.trim() || undefined,
          responseDueDate: eventForm.responseDueDate || undefined
        }
      });

      setEventForm(buildEventForm());
      await Promise.all([loadClaims(), loadClaimDetail(selectedClaimId)]);
      setMessage("Insurance claim event recorded.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to record insurance claim event");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentUser && !canAccessInsurance(currentUser.role)) {
    return <p className="text-red-600">You do not have access to insurance management.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Claims</p>
          <h1 className="mt-2 text-2xl text-gray-900">Insurance Management</h1>
          <p className="mt-2 text-sm text-gray-600">Submit claims, track payer decisions, and keep invoice-linked insurance workflow visible.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void handleRefresh()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          {canManageInsuranceCatalog(currentUser?.role) && (
            <button data-testid="insurance-add-provider-button" type="button" onClick={() => setShowProviderForm((current) => !current)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
              <Plus className="h-4 w-4" />
              {showProviderForm ? "Hide Provider Form" : "Add Provider"}
            </button>
          )}
          <button data-testid="insurance-add-claim-button" type="button" onClick={() => setShowClaimForm((current) => !current)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" />
            {showClaimForm ? "Hide Claim Form" : "Submit Claim"}
          </button>
        </div>
      </div>

      {loading && <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading insurance workspace...</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}

      {!loading && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Total Claims</p><p className="mt-2 text-3xl text-gray-900">{claimSummary.total}</p></div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Open Claims</p><p className="mt-2 text-3xl text-gray-900">{claimSummary.open}</p></div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Settled Amount</p><p className="mt-2 text-3xl text-gray-900">{formatCurrency(claimSummary.settledAmount)}</p></div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5"><p className="text-sm text-gray-500">Response Risk</p><p className="mt-2 text-3xl text-gray-900">{claimSummary.atRisk}</p></div>
          </div>

          {showProviderForm && canManageInsuranceCatalog(currentUser?.role) && (
            <form data-testid="insurance-provider-form" onSubmit={submitProvider} className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-gray-900">Payer Catalog</h2><p className="mt-1 text-sm text-gray-500">Maintain the insurers your clinic submits claims to.</p></div>
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                <input data-testid="insurance-provider-code-input" value={providerForm.payerCode} onChange={(event) => setProviderForm((current) => ({ ...current, payerCode: event.target.value }))} placeholder="Payer code" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <input data-testid="insurance-provider-name-input" value={providerForm.name} onChange={(event) => setProviderForm((current) => ({ ...current, name: event.target.value }))} placeholder="Provider name" required className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <input data-testid="insurance-provider-email-input" type="email" value={providerForm.contactEmail} onChange={(event) => setProviderForm((current) => ({ ...current, contactEmail: event.target.value }))} placeholder="Contact email" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <input data-testid="insurance-provider-phone-input" value={providerForm.contactPhone} onChange={(event) => setProviderForm((current) => ({ ...current, contactPhone: event.target.value }))} placeholder="Contact phone" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <input data-testid="insurance-provider-portal-url-input" value={providerForm.portalUrl} onChange={(event) => setProviderForm((current) => ({ ...current, portalUrl: event.target.value }))} placeholder="Portal URL" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
              </div>
              <div className="mt-5 flex justify-end"><button data-testid="insurance-provider-submit-button" type="submit" disabled={isSubmitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">Save Provider</button></div>
            </form>
          )}

          {showClaimForm && (
            <form data-testid="insurance-claim-form" onSubmit={submitClaim} className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-gray-900">Claim Submission</h2><p className="mt-1 text-sm text-gray-500">Link a payer claim to the patient, invoice, and supporting record.</p></div>
                <FileHeart className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
                <select data-testid="insurance-claim-patient-select" value={claimForm.patientId} onChange={(event) => void handleClaimPatientChange(event.target.value)} required className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} | {patient.patient_code || patient.phone || "No code"}</option>)}</select>
                <select data-testid="insurance-claim-provider-select" value={claimForm.providerId} onChange={(event) => setClaimForm((current) => ({ ...current, providerId: event.target.value }))} required className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">Select provider</option>{providerOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select>
                <select data-testid="insurance-claim-doctor-select" value={claimForm.doctorId} onChange={(event) => setClaimForm((current) => ({ ...current, doctorId: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">Unassigned doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name} | {doctor.specialty || "General"}</option>)}</select>
                <select data-testid="insurance-claim-status-select" value={claimForm.status} onChange={(event) => setClaimForm((current) => ({ ...current, status: event.target.value as ClaimStatus }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">{claimStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select>
                <select data-testid="insurance-claim-record-select" value={claimForm.medicalRecordId} onChange={(event) => handleRecordChange(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">Select record</option>{filteredMedicalRecords.map((record) => <option key={record.id} value={record.id}>{record.record_type} | {record.patient_name} | {formatDate(record.record_date)}</option>)}</select>
                <select data-testid="insurance-claim-invoice-select" value={claimForm.invoiceId} onChange={(event) => handleInvoiceChange(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">Select invoice</option>{filteredInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} | Balance {formatCurrency(invoice.balance_amount)}</option>)}</select>
                <input data-testid="insurance-claim-policy-number-input" value={claimForm.policyNumber} onChange={(event) => setClaimForm((current) => ({ ...current, policyNumber: event.target.value }))} placeholder="Policy number" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <input data-testid="insurance-claim-member-id-input" value={claimForm.memberId} onChange={(event) => setClaimForm((current) => ({ ...current, memberId: event.target.value }))} placeholder="Member ID" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <input data-testid="insurance-claim-amount-input" type="number" min="0.01" step="0.01" value={claimForm.claimedAmount} onChange={(event) => setClaimForm((current) => ({ ...current, claimedAmount: event.target.value }))} placeholder="Claimed amount" required className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <input data-testid="insurance-claim-submitted-date-input" type="date" value={claimForm.submittedDate} onChange={(event) => setClaimForm((current) => ({ ...current, submittedDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <input data-testid="insurance-claim-response-due-date-input" type="date" value={claimForm.responseDueDate} onChange={(event) => setClaimForm((current) => ({ ...current, responseDueDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                <textarea data-testid="insurance-claim-diagnosis-input" rows={2} value={claimForm.diagnosisSummary} onChange={(event) => setClaimForm((current) => ({ ...current, diagnosisSummary: event.target.value }))} placeholder="Diagnosis summary" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 lg:col-span-2" />
                <textarea data-testid="insurance-claim-treatment-input" rows={2} value={claimForm.treatmentSummary} onChange={(event) => setClaimForm((current) => ({ ...current, treatmentSummary: event.target.value }))} placeholder="Treatment summary" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 lg:col-span-2" />
                <textarea data-testid="insurance-claim-notes-input" rows={2} value={claimForm.notes} onChange={(event) => setClaimForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 lg:col-span-4" />
              </div>
              {selectedInvoice && <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">Linked invoice {selectedInvoice.invoice_number} has a balance of {formatCurrency(selectedInvoice.balance_amount)}.</div>}
              <div className="mt-5 flex justify-end"><button data-testid="insurance-claim-submit-button" type="submit" disabled={isSubmitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">Create Claim</button></div>
            </form>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search claim, patient, provider" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">All statuses</option>{claimStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select>
              <select value={filters.providerId} onChange={(event) => setFilters((current) => ({ ...current, providerId: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">All providers</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select>
              <select value={filters.patientId} onChange={(event) => setFilters((current) => ({ ...current, patientId: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">All patients</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} | {patient.patient_code || patient.phone || "No code"}</option>)}</select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-200 px-6 py-4"><h2 className="text-gray-900">Claim Queue</h2><p className="mt-1 text-sm text-gray-500">Track submission, approval, and settlement follow-up in one queue.</p></div>
              <div className="divide-y divide-gray-100">
                {claims.length === 0 && <div className="px-6 py-6 text-sm text-gray-500">No insurance claims found for the selected filters.</div>}
                {visibleClaims.map((claim) => (
                  <button key={claim.id} data-testid="insurance-claim-queue-item" type="button" onClick={() => void loadClaimDetail(claim.id)} className={`w-full px-6 py-4 text-left transition ${selectedClaimId === claim.id ? "bg-emerald-50" : "hover:bg-gray-50"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{claim.claim_number}</p>
                          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ${getStatusTone(claim.status)}`}>{formatStatus(claim.status)}</span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">{claim.patient_name} | {claim.provider_name}</p>
                        <p className="mt-1 text-xs text-gray-500">{claim.invoice_number ? `Invoice ${claim.invoice_number}` : "No linked invoice"}{claim.record_type ? ` | ${claim.record_type}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">{formatCurrency(claim.claimed_amount)}</p>
                        <p className="mt-1 text-xs text-gray-500">Approved {formatCurrency(claim.approved_amount)} | Paid {formatCurrency(claim.paid_amount)}</p>
                        <p className="mt-1 text-xs text-gray-500">Due {formatDate(claim.response_due_date)}{claim.days_to_response !== null ? ` | ${claim.days_to_response}d` : ""}</p>
                      </div>
                    </div>
                  </button>
                ))}
                {claims.length > LIST_PREVIEW_LIMIT && (
                  <div className="px-6 py-4">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowAllClaims((current) => !current)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {showAllClaims ? "Show less" : "Show more"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
            <section className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="text-gray-900">Claim Detail</h2><p className="mt-1 text-sm text-gray-500">Selected claim financials, status, and linked references.</p></div>
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                </div>

                {!selectedClaim ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">Select a claim from the queue to review or update it.</div>
                ) : (
                  <>
                    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 p-4"><p className="text-sm text-gray-500">Patient</p><p className="mt-2 text-base text-gray-900">{selectedClaim.patient_name}</p><p className="mt-1 text-xs text-gray-500">{selectedClaim.patient_code || selectedClaim.phone || "-"}</p></div>
                      <div className="rounded-xl border border-gray-200 p-4"><p className="text-sm text-gray-500">Provider</p><p className="mt-2 text-base text-gray-900">{selectedClaim.provider_name}</p><p className="mt-1 text-xs text-gray-500">{selectedClaim.payer_code || "No payer code"}</p></div>
                    </div>

                    <form onSubmit={submitClaimUpdate} className="mt-5 space-y-4">
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value as ClaimStatus }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">{claimStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select>
                        <input type="date" value={editForm.responseDueDate} onChange={(event) => setEditForm((current) => ({ ...current, responseDueDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                        <input type="number" min="0.01" step="0.01" value={editForm.claimedAmount} onChange={(event) => setEditForm((current) => ({ ...current, claimedAmount: event.target.value }))} placeholder="Claimed amount" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                        <input type="number" min="0" step="0.01" value={editForm.approvedAmount} onChange={(event) => setEditForm((current) => ({ ...current, approvedAmount: event.target.value }))} placeholder="Approved amount" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                        <input type="number" min="0" step="0.01" value={editForm.paidAmount} onChange={(event) => setEditForm((current) => ({ ...current, paidAmount: event.target.value }))} placeholder="Paid amount" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                        <input type="date" value={editForm.submittedDate} onChange={(event) => setEditForm((current) => ({ ...current, submittedDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                        <textarea rows={2} value={editForm.rejectionReason} onChange={(event) => setEditForm((current) => ({ ...current, rejectionReason: event.target.value }))} placeholder="Rejection reason" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 lg:col-span-2" />
                        <textarea rows={3} value={editForm.notes} onChange={(event) => setEditForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Internal notes" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 lg:col-span-2" />
                      </div>
                      <div className="flex justify-end"><button type="submit" disabled={isSubmitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">Update Claim</button></div>
                    </form>
                  </>
                )}
              </div>

              {selectedClaim && (
                <>
                  <form onSubmit={submitClaimEvent} className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div><h2 className="text-gray-900">Record Follow-up</h2><p className="mt-1 text-sm text-gray-500">Log payer response, add notes, or move the claim to the next state.</p></div>
                    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <select value={eventForm.nextStatus} onChange={(event) => setEventForm((current) => ({ ...current, nextStatus: event.target.value }))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"><option value="">Keep current status</option>{claimStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select>
                      <input type="date" value={eventForm.responseDueDate} onChange={(event) => setEventForm((current) => ({ ...current, responseDueDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                      <input type="number" min="0" step="0.01" value={eventForm.approvedAmount} onChange={(event) => setEventForm((current) => ({ ...current, approvedAmount: event.target.value }))} placeholder="Approved amount" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                      <input type="number" min="0" step="0.01" value={eventForm.paidAmount} onChange={(event) => setEventForm((current) => ({ ...current, paidAmount: event.target.value }))} placeholder="Paid amount" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700" />
                      <textarea rows={2} value={eventForm.rejectionReason} onChange={(event) => setEventForm((current) => ({ ...current, rejectionReason: event.target.value }))} placeholder="Response / rejection note" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 lg:col-span-2" />
                      <textarea rows={3} value={eventForm.note} onChange={(event) => setEventForm((current) => ({ ...current, note: event.target.value }))} placeholder="Timeline note" className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 lg:col-span-2" />
                    </div>
                    <div className="mt-5 flex justify-end"><button type="submit" disabled={isSubmitting} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">Record Event</button></div>
                  </form>

                  <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    <div className="border-b border-gray-200 px-6 py-4"><h2 className="text-gray-900">Claim Timeline</h2><p className="mt-1 text-sm text-gray-500">Every claim action and status transition recorded against this case.</p></div>
                    <div className="divide-y divide-gray-100">
                      {(selectedClaim.events || []).length === 0 && <div className="px-6 py-5 text-sm text-gray-500">No claim events recorded yet.</div>}
                      {visibleClaimEvents.map((event) => (
                        <div key={event.id} className="px-6 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{formatStatus(event.event_type)}</p>
                              <p className="mt-1 text-xs text-gray-500">{event.actor_name || "System"} | {formatDateTime(event.created_at)}</p>
                              {(event.previous_status || event.next_status) && <p className="mt-2 text-xs uppercase tracking-[0.14em] text-gray-500">{event.previous_status ? formatStatus(event.previous_status) : "Start"} to {event.next_status ? formatStatus(event.next_status) : "No change"}</p>}
                              {event.note && <p className="mt-2 text-sm leading-6 text-gray-700">{event.note}</p>}
                            </div>
                            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ${getStatusTone((event.next_status as ClaimStatus) || selectedClaim.status)}`}>{formatStatus((event.next_status as ClaimStatus) || selectedClaim.status)}</span>
                          </div>
                        </div>
                      ))}
                      {(selectedClaim?.events || []).length > LIST_PREVIEW_LIMIT && (
                        <div className="px-6 py-4">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setShowAllClaimEvents((current) => !current)}
                              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              {showAllClaimEvents ? "Show less" : "Show more"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
