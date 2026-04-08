"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Clock, Download, ExternalLink, IndianRupee, Link2, Plus, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { canAccessBilling } from "@/lib/roles";
import { Doctor, Invoice, InvoicePaymentLink, Patient, ReconciliationReport } from "@/types/api";

type BillingsResponse = {
  success: boolean;
  data: {
    items: Invoice[];
    stats: {
      totalRevenue: number;
      paidInvoices: number;
      pendingInvoices: number;
      overdueInvoices: number;
      cashTotal: number;
      upiTotal: number;
      cardTotal: number;
    };
  };
};

type DoctorsResponse = { success: boolean; data: { items: Doctor[] } };
type PatientsResponse = { success: boolean; data: { items: Patient[] } };
type PatientResponse = { success: boolean; data: Patient };
type MeResponse = { success: boolean; data: { role: string } };
type CreateInvoiceResponse = { success: boolean; data: Invoice };
type ReconciliationResponse = { success: boolean; data: ReconciliationReport };
type PaymentLinkResponse = {
  success: boolean;
  data: {
    invoice: Invoice;
    paymentLink: InvoicePaymentLink;
  };
};

const formatRupee = (value: number) => `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const formatInvoiceMoney = (amount: number, currency?: string | null) =>
  currency && currency !== "INR" ? `${currency} ${Number(amount || 0).toFixed(2)}` : `Rs. ${Number(amount || 0).toFixed(2)}`;
const normalizeDateInput = (value?: string | null) => (value ? String(value).slice(0, 10) : null);

type InvoiceFormItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const createInvoiceFormItem = (overrides: Partial<InvoiceFormItem> = {}): InvoiceFormItem => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  description: "",
  quantity: "1",
  unitPrice: "",
  ...overrides
});

const initialInvoiceForm = {
  patientId: "",
  doctorId: "",
  items: [createInvoiceFormItem()],
  dueDate: "",
  notes: ""
};

const initialPaymentForm = {
  amount: "",
  method: "cash",
  reference: ""
};

const statusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return "bg-green-50 text-green-700";
  if (normalized === "overdue") return "bg-red-50 text-red-700";
  if (normalized === "partially_paid") return "bg-amber-50 text-amber-700";
  if (normalized === "issued") return "bg-teal-50 text-teal-700";
  return "bg-gray-100 text-gray-700";
};

const paymentLinkStatusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return "bg-green-50 text-green-700";
  if (normalized === "partially_paid") return "bg-amber-50 text-amber-700";
  if (normalized === "expired" || normalized === "failed" || normalized === "cancelled") {
    return "bg-red-50 text-red-700";
  }
  return "bg-sky-50 text-sky-700";
};

const initialReconciliation: ReconciliationReport = {
  summary: {
    totalInvoices: 0,
    mismatchedInvoices: 0,
    outstandingInvoices: 0,
    refundedPayments: 0,
    refundedAmount: 0
  },
  items: []
};

export default function BillingsPage() {
  const searchParams = useSearchParams();
  const patientFilterId = searchParams.get("patientId") || "";
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    cashTotal: 0,
    upiTotal: 0,
    cardTotal: 0
  });
  const [reconciliation, setReconciliation] = useState<ReconciliationReport>(initialReconciliation);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState(initialInvoiceForm);
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatusFilter, setAppliedStatusFilter] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [creatingPaymentLinkId, setCreatingPaymentLinkId] = useState<string | null>(null);
  const [refreshingPaymentLinkId, setRefreshingPaymentLinkId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);

  const invoiceDraftTotal = useMemo(
    () =>
      invoiceForm.items.reduce((sum, item) => {
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        return sum + (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0);
      }, 0),
    [invoiceForm.items]
  );

  const loadInvoices = useCallback(() => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set("limit", "100");
    if (appliedSearch.trim()) params.set("q", appliedSearch.trim());
    if (appliedStatusFilter) params.set("status", appliedStatusFilter);
    if (patientFilterId) params.set("patientId", patientFilterId);

    Promise.all([
      apiRequest<BillingsResponse>(`/billings?${params.toString()}`, { authenticated: true }),
      apiRequest<ReconciliationResponse>("/billings/reconciliation", { authenticated: true })
    ])
      .then(([billingRes, reconciliationRes]) => {
        if (requestId !== loadRequestRef.current) {
          return;
        }
        setInvoices(billingRes.data.items || []);
        setStats(
          billingRes.data.stats || {
            totalRevenue: 0,
            paidInvoices: 0,
            pendingInvoices: 0,
            overdueInvoices: 0,
            cashTotal: 0,
            upiTotal: 0,
            cardTotal: 0
          }
        );
        setReconciliation(reconciliationRes.data || initialReconciliation);
      })
      .catch((err: Error) => {
        if (requestId !== loadRequestRef.current) {
          return;
        }

        setError(err.message || "Failed to load billing data");
      })
      .finally(() => {
        if (requestId === loadRequestRef.current) {
          setLoading(false);
        }
      });
  }, [appliedSearch, appliedStatusFilter, patientFilterId]);

  const loadMetadata = useCallback(async () => {
    const [patientsResult, doctorsResult] = await Promise.allSettled([
      apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true }),
      apiRequest<DoctorsResponse>("/doctors?limit=100", { authenticated: true })
    ]);

    if (patientsResult.status === "fulfilled") {
      setPatients(patientsResult.value.data.items || []);
    }

    if (doctorsResult.status === "fulfilled") {
      setDoctors(doctorsResult.value.data.items || []);
    }

    if (patientsResult.status === "rejected" && doctorsResult.status === "rejected") {
      const reason = patientsResult.reason instanceof Error ? patientsResult.reason : doctorsResult.reason;
      setError(reason instanceof Error ? reason.message : "Failed to load billing form data");
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

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
      .catch(() => {
        // Keep the page usable even if the patient lookup fails.
      });
  }, [patientFilterId, patients]);

  useEffect(() => {
    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then((response) => setCurrentRole(response.data.role || ""))
      .catch(() => setCurrentRole(""));
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (search === appliedSearch && statusFilter === appliedStatusFilter) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAppliedSearch(search);
      setAppliedStatusFilter(statusFilter);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [search, statusFilter, appliedSearch, appliedStatusFilter]);

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const query = search.toLowerCase();
    return invoices.filter(
      (invoice) =>
        invoice.invoice_number.toLowerCase().includes(query) ||
        (invoice.patient_name || "").toLowerCase().includes(query)
      );
  }, [invoices, search]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === patientFilterId) || null,
    [patientFilterId, patients]
  );
  const selectedInvoicePatient = useMemo(
    () => patients.find((patient) => patient.id === invoiceForm.patientId) || null,
    [invoiceForm.patientId, patients]
  );
  const selectedInvoiceDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === invoiceForm.doctorId) || null,
    [invoiceForm.doctorId, doctors]
  );

  const replaceInvoiceInState = (nextInvoice: Invoice) => {
    setInvoices((previous) => previous.map((invoice) => (invoice.id === nextInvoice.id ? nextInvoice : invoice)));
  };

  const invoiceMatchesCurrentView = (invoice: Invoice) => {
    if (patientFilterId && invoice.patient_id !== patientFilterId) {
      return false;
    }

    if (appliedStatusFilter && invoice.status !== appliedStatusFilter) {
      return false;
    }

    const query = appliedSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      invoice.invoice_number.toLowerCase().includes(query) ||
      (invoice.patient_name || "").toLowerCase().includes(query)
    );
  };

  if (currentRole && !canAccessBilling(currentRole)) {
    return <p className="text-red-600">You do not have access to billing.</p>;
  }

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const normalizedItems = invoiceForm.items
        .map((item) => ({
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice)
        }))
        .filter((item) => item.description && item.quantity > 0 && item.unitPrice > 0);

      if (normalizedItems.length === 0) {
        throw new Error("Add at least one valid treatment, medicine, or other charge.");
      }

      const response = await apiRequest<CreateInvoiceResponse>("/billings", {
        method: "POST",
        authenticated: true,
        body: {
          patientId: invoiceForm.patientId,
          doctorId: invoiceForm.doctorId || null,
          items: normalizedItems,
          dueDate: invoiceForm.dueDate || null,
          notes: invoiceForm.notes.trim() || null
        }
      });

      const createdInvoice = response.data;
      if (invoiceMatchesCurrentView(createdInvoice)) {
        setInvoices((previous) => [createdInvoice, ...previous.filter((invoice) => invoice.id !== createdInvoice.id)]);
      }

      if (!patientFilterId || createdInvoice.patient_id === patientFilterId) {
        setStats((previous) => ({
          ...previous,
          totalRevenue: Number((previous.totalRevenue + Number(createdInvoice.total_amount || 0)).toFixed(2)),
          paidInvoices: previous.paidInvoices + (createdInvoice.status === "paid" ? 1 : 0),
          pendingInvoices:
            previous.pendingInvoices + (createdInvoice.status === "issued" || createdInvoice.status === "partially_paid" ? 1 : 0),
          overdueInvoices: previous.overdueInvoices + (createdInvoice.status === "overdue" ? 1 : 0)
        }));
      }

      setReconciliation((previous) => ({
        ...previous,
        summary: {
          ...previous.summary,
          totalInvoices: previous.summary.totalInvoices + 1,
          outstandingInvoices:
            previous.summary.outstandingInvoices +
            (createdInvoice.status === "issued" || createdInvoice.status === "partially_paid" || createdInvoice.status === "overdue"
              ? 1
              : 0)
        }
      }));

      setShowCreate(false);
      setInvoiceForm({
        ...initialInvoiceForm,
        items: [createInvoiceFormItem()]
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvoiceItemChange = (itemId: string, field: keyof InvoiceFormItem, value: string) => {
    setInvoiceForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    }));
  };

  const handleAddInvoiceItem = () => {
    setInvoiceForm((current) => ({
      ...current,
      items: [...current.items, createInvoiceFormItem()]
    }));
  };

  const addQuickInvoiceItem = (description: string, unitPrice: number) => {
    setInvoiceForm((current) => ({
      ...current,
      items: [
        ...current.items,
        createInvoiceFormItem({
          description,
          quantity: "1",
          unitPrice: String(Number(unitPrice || 0).toFixed(2))
        })
      ]
    }));
  };

  const handleRemoveInvoiceItem = (itemId: string) => {
    setInvoiceForm((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((item) => item.id !== itemId) : current.items
    }));
  };

  const handleIssue = async (invoice: Invoice) => {
    setIssuingId(invoice.id);
    setError("");
    try {
      await apiRequest(`/billings/${invoice.id}/issue`, {
        method: "POST",
        authenticated: true,
        body: { dueDate: normalizeDateInput(invoice.due_date) }
      });
      loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to issue invoice");
    } finally {
      setIssuingId(null);
    }
  };

  const handleOpenPayment = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentForm({
      amount: invoice.balance_amount > 0 ? String(invoice.balance_amount) : "",
      method: "cash",
      reference: ""
    });
    setShowPaymentModal(true);
  };

  const handleMarkPaid = async (invoice: Invoice) => {
    setIssuingId(invoice.id);
    setError("");
    try {
      await apiRequest(`/billings/${invoice.id}/mark-paid`, {
        method: "POST",
        authenticated: true,
        body: { method: "cash" }
      });
      loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark invoice as paid");
    } finally {
      setIssuingId(null);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setIsSubmitting(true);
    setError("");
    try {
      await apiRequest(`/billings/${selectedInvoice.id}/payments`, {
        method: "POST",
        authenticated: true,
        body: {
          amount: Number(paymentForm.amount),
          method: paymentForm.method,
          reference: paymentForm.reference || null
        }
      });
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      setPaymentForm(initialPaymentForm);
      loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    setError("");
    try {
      const token = getAuthToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1"}/billings/${invoiceId}/pdf`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!res.ok) {
        throw new Error("Failed to download invoice PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download invoice");
    }
  };

  const handleCreatePaymentLink = async (invoice: Invoice) => {
    setCreatingPaymentLinkId(invoice.id);
    setError("");
    try {
      const response = await apiRequest<PaymentLinkResponse>(`/billings/${invoice.id}/payment-links`, {
        method: "POST",
        authenticated: true,
        body: {}
      });

      replaceInvoiceInState(response.data.invoice);
      loadInvoices();

      if (response.data.paymentLink?.short_url) {
        window.open(response.data.paymentLink.short_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create payment link");
    } finally {
      setCreatingPaymentLinkId(null);
    }
  };

  const handleRefreshPaymentLink = async (invoice: Invoice) => {
    const paymentLink = invoice.latest_payment_link;
    if (!paymentLink?.id) {
      return;
    }

    setRefreshingPaymentLinkId(paymentLink.id);
    setError("");
    try {
      const response = await apiRequest<PaymentLinkResponse>(`/billings/${invoice.id}/payment-links/${paymentLink.id}/refresh`, {
        method: "POST",
        authenticated: true,
        body: {}
      });

      replaceInvoiceInState(response.data.invoice);
      loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh payment link");
    } finally {
      setRefreshingPaymentLinkId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-gray-900">Billing & Payments</h1>
          <p className="text-gray-600 mt-1">Manage invoices and payment records</p>
        </div>
        <button
          data-testid="create-invoice-button"
          onClick={() => {
            setInvoiceForm({
              ...initialInvoiceForm,
              patientId: patientFilterId,
              items: [createInvoiceFormItem()]
            });
            setShowCreate(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          Create Invoice
        </button>
      </div>

      {patientFilterId && (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Patient Filter</p>
            <p className="mt-1 text-sm text-emerald-900">
              Showing billing for {selectedPatient?.full_name || "the selected patient"}.
            </p>
          </div>
          <Link
            href="/dashboard/billings"
            className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
          >
            Clear Filter
          </Link>
        </div>
      )}

      <div data-tour-id="tour-billings-overview" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{patientFilterId ? "Patient Revenue" : "Total Revenue"}</p>
              <p className="text-2xl mt-2 text-gray-900">{formatRupee(stats.totalRevenue)}</p>
            </div>
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-lg flex items-center justify-center">
              <IndianRupee className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{patientFilterId ? "Paid Bills" : "Paid Invoices"}</p>
              <p className="text-2xl mt-2 text-gray-900">{stats.paidInvoices}</p>
            </div>
            <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{patientFilterId ? "Pending Bills" : "Pending"}</p>
              <p className="text-2xl mt-2 text-gray-900">{stats.pendingInvoices}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{patientFilterId ? "Overdue Bills" : "Overdue"}</p>
              <p className="text-2xl mt-2 text-gray-900">{stats.overdueInvoices}</p>
            </div>
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-600">Cash Collected</p>
          <p className="mt-2 text-xl text-gray-900">{formatRupee(stats.cashTotal)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-600">UPI Collected</p>
          <p className="mt-2 text-xl text-gray-900">{formatRupee(stats.upiTotal)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-200">
          <p className="text-sm text-gray-600">Card Collected</p>
          <p className="mt-2 text-xl text-gray-900">{formatRupee(stats.cardTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-600">Reconciliation</p>
          <p className="mt-2 text-xl text-gray-900">{reconciliation.summary.totalInvoices}</p>
          <p className="mt-1 text-xs text-gray-500">Tracked invoices in the audit check</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-600">Mismatches</p>
          <p className="mt-2 text-xl text-gray-900">{reconciliation.summary.mismatchedInvoices}</p>
          <p className="mt-1 text-xs text-gray-500">Invoices needing payment review</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-600">Outstanding</p>
          <p className="mt-2 text-xl text-gray-900">{reconciliation.summary.outstandingInvoices}</p>
          <p className="mt-1 text-xs text-gray-500">Issued invoices still carrying balance</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-600">Refunded</p>
          <p className="mt-2 text-xl text-gray-900">{formatRupee(reconciliation.summary.refundedAmount)}</p>
          <p className="mt-1 text-xs text-gray-500">{reconciliation.summary.refundedPayments} refunded payments</p>
        </div>
      </div>

      {reconciliation.items.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-950">Payment Reconciliation Review</p>
              <p className="mt-1 text-sm text-amber-800">
                These invoices have a mismatch between invoice totals and recorded payments.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-amber-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              {reconciliation.summary.mismatchedInvoices} flagged
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-amber-200 bg-white">
            <table className="w-full">
              <thead className="border-b border-amber-100 bg-amber-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-amber-700">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-amber-700">Status</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-amber-700">Stored Paid</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-amber-700">Computed Paid</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-amber-700">Stored Balance</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.14em] text-amber-700">Computed Balance</th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.items.map((item) => (
                  <tr key={item.id} className="border-b border-amber-100 last:border-0">
                    <td className="px-4 py-3 text-sm text-amber-950">{item.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-amber-900">{item.status}</td>
                    <td className="px-4 py-3 text-sm text-amber-900">{formatRupee(item.paid_amount)}</td>
                    <td className="px-4 py-3 text-sm text-amber-900">{formatRupee(item.computed_paid_amount)}</td>
                    <td className="px-4 py-3 text-sm text-amber-900">{formatRupee(item.balance_amount)}</td>
                    <td className="px-4 py-3 text-sm text-amber-900">{formatRupee(item.computed_balance_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice number or patient..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading invoices...</p>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Invoice</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Patient</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Amount</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Paid</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Date</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Status</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredInvoices.length === 0 && (
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-500" colSpan={7}>
                    No invoices found.
                  </td>
                </tr>
              )}
                {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="text-emerald-700">{invoice.invoice_number}</p>
                    <p className="mt-1 text-xs text-gray-500">{invoice.currency}</p>
                    {invoice.latest_payment_link && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${paymentLinkStatusClass(
                            invoice.latest_payment_link.status
                          )}`}
                        >
                          {invoice.latest_payment_link.provider} {invoice.latest_payment_link.status}
                        </span>
                        {invoice.latest_payment_link.expires_at && (
                          <span className="text-[11px] text-gray-500">
                            Expires {new Date(invoice.latest_payment_link.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-gray-800">{invoice.patient_name}</p>
                    {invoice.doctor_name && <p className="mt-1 text-xs text-gray-500">{invoice.doctor_name}</p>}
                  </td>
                  <td className="px-6 py-4 text-gray-800">
                    {formatInvoiceMoney(invoice.total_amount, invoice.currency)}
                  </td>
                  <td className="px-6 py-4 text-gray-800">
                    <p>{formatInvoiceMoney(invoice.paid_amount, invoice.currency)}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Balance {formatInvoiceMoney(invoice.balance_amount, invoice.currency)}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{invoice.issue_date}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${statusClass(invoice.status)}`}>{invoice.status}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleDownloadInvoice(invoice.id)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        PDF
                      </button>
                      {(invoice.status === "draft" || invoice.status === "void") && (
                        <button
                          onClick={() => handleIssue(invoice)}
                          disabled={issuingId === invoice.id}
                          className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          Issue
                        </button>
                      )}
                      {invoice.balance_amount > 0 && invoice.status !== "void" && (
                        <button
                          onClick={() => handleOpenPayment(invoice)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700"
                        >
                          Add Payment
                        </button>
                      )}
                      {invoice.balance_amount > 0 && ["issued", "partially_paid", "overdue"].includes(invoice.status) && (
                        <button
                          onClick={() => handleCreatePaymentLink(invoice)}
                          disabled={creatingPaymentLinkId === invoice.id}
                          className="px-3 py-1.5 text-xs rounded-lg border border-sky-200 text-sky-700 hover:bg-sky-50 disabled:opacity-60 inline-flex items-center gap-1"
                        >
                          <Link2 className="w-3 h-3" />
                          {creatingPaymentLinkId === invoice.id ? "Creating..." : "Create Link"}
                        </button>
                      )}
                      {invoice.latest_payment_link?.short_url && (
                        <button
                          onClick={() => window.open(invoice.latest_payment_link?.short_url || "", "_blank", "noopener,noreferrer")}
                          className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open Link
                        </button>
                      )}
                      {invoice.latest_payment_link && !["paid", "cancelled", "expired", "failed"].includes(invoice.latest_payment_link.status) && (
                        <button
                          onClick={() => handleRefreshPaymentLink(invoice)}
                          disabled={refreshingPaymentLinkId === invoice.latest_payment_link?.id}
                          className="px-3 py-1.5 text-xs rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-60 inline-flex items-center gap-1"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${refreshingPaymentLinkId === invoice.latest_payment_link?.id ? "animate-spin" : ""}`}
                          />
                          Refresh Link
                        </button>
                      )}
                      {invoice.balance_amount > 0 && invoice.status !== "void" && (
                        <button
                          onClick={() => handleMarkPaid(invoice)}
                          disabled={issuingId === invoice.id}
                          className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Mark as Paid
                        </button>
                      )}
                      <Link
                        href={`/dashboard/patients/${invoice.patient_id}`}
                        className="px-3 py-1.5 text-xs rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        Open Patient
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto p-4">
          <form data-testid="invoice-form-modal" onSubmit={handleCreateInvoice} className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg text-gray-900">Create Invoice</h2>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Patient</label>
              <select
                data-testid="invoice-patient-select"
                value={invoiceForm.patientId}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, patientId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">Select patient</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name} | {patient.patient_code}
                  </option>
                ))}
              </select>
            </div>
            {selectedInvoicePatient && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                <p className="text-sm font-medium text-sky-950">{selectedInvoicePatient.full_name}</p>
                <p className="mt-1 text-xs text-sky-800">
                  {selectedInvoicePatient.patient_code}
                  {selectedInvoicePatient.phone ? ` | ${selectedInvoicePatient.phone}` : ""}
                  {selectedInvoicePatient.age !== null ? ` | ${selectedInvoicePatient.age} yrs` : ""}
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-700 mb-1">Doctor (optional)</label>
              <select
                data-testid="invoice-doctor-select"
                value={invoiceForm.doctorId}
                onChange={(e) => {
                  const nextDoctorId = e.target.value;
                  const doctor = doctors.find((item) => item.id === nextDoctorId) || null;
                  setInvoiceForm((p) => ({
                    ...p,
                    doctorId: nextDoctorId,
                    items:
                      doctor &&
                      doctor.consultation_fee !== null &&
                      doctor.consultation_fee !== undefined &&
                      p.items.length === 1 &&
                      !p.items[0].description &&
                      !p.items[0].unitPrice
                        ? [
                            {
                              ...p.items[0],
                              description: `Consultation - ${doctor.full_name}`,
                              unitPrice: String(Number(doctor.consultation_fee).toFixed(2))
                            }
                          ]
                        : p.items
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.full_name}
                  </option>
                ))}
              </select>
            </div>
            {selectedInvoiceDoctor && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-medium text-emerald-950">{selectedInvoiceDoctor.full_name}</p>
                <p className="mt-1 text-xs text-emerald-800">
                  {selectedInvoiceDoctor.specialty}
                  {selectedInvoiceDoctor.consultation_fee !== null && selectedInvoiceDoctor.consultation_fee !== undefined
                    ? ` | Consultation ${formatRupee(selectedInvoiceDoctor.consultation_fee)}`
                    : ""}
                </p>
              </div>
            )}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="block text-sm text-gray-700">Invoice Items</label>
                  <p className="mt-1 text-xs text-gray-500">Add treatments, medicines, tests, consumables, or any other charge.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddInvoiceItem}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedInvoiceDoctor && selectedInvoiceDoctor.consultation_fee !== null && selectedInvoiceDoctor.consultation_fee !== undefined && (
                  <button
                    type="button"
                    onClick={() =>
                      addQuickInvoiceItem(`Consultation - ${selectedInvoiceDoctor.full_name}`, selectedInvoiceDoctor.consultation_fee || 0)
                    }
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Add Consultation Fee
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => addQuickInvoiceItem("Procedure Charge", 0)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Add Procedure Charge
                </button>
                <button
                  type="button"
                  onClick={() => addQuickInvoiceItem("Medicine Charge", 0)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Add Medicine Charge
                </button>
              </div>

              <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                {invoiceForm.items.map((item, index) => {
                  const quantity = Number(item.quantity || 0);
                  const unitPrice = Number(item.unitPrice || 0);
                  const lineTotal = (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0);

                  return (
                    <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-900">Item {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => handleRemoveInvoiceItem(item.id)}
                          disabled={invoiceForm.items.length === 1}
                          className="text-xs text-red-600 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1.6fr_0.6fr_0.8fr]">
                        <div>
                          <label className="mb-1 block text-sm text-gray-700">Description</label>
                          <input
                            data-testid={index === 0 ? "invoice-item-description-input" : undefined}
                            type="text"
                            value={item.description}
                            onChange={(e) => handleInvoiceItemChange(item.id, "description", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="Treatment / Medicine / Other charge"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-700">Qty</label>
                          <input
                            data-testid={index === 0 ? "invoice-item-quantity-input" : undefined}
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => handleInvoiceItemChange(item.id, "quantity", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-700">Unit Price</label>
                          <input
                            data-testid={index === 0 ? "invoice-item-unit-price-input" : undefined}
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => handleInvoiceItemChange(item.id, "unitPrice", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            required
                          />
                        </div>
                      </div>
                      <p className="mt-3 text-right text-sm text-gray-600">Line Total: {formatRupee(lineTotal)}</p>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
                  <p className="text-sm text-emerald-800">Invoice Total</p>
                  <p className="text-lg font-semibold text-emerald-900">{formatRupee(invoiceDraftTotal)}</p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Due Date</label>
              <input
                data-testid="invoice-due-date-input"
                type="date"
                value={invoiceForm.dueDate}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Notes</label>
              <textarea
                data-testid="invoice-notes-input"
                rows={3}
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                data-testid="invoice-cancel-button"
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setInvoiceForm({
                    ...initialInvoiceForm,
                    items: [createInvoiceFormItem()]
                  });
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button data-testid="invoice-submit-button" type="submit" disabled={isSubmitting} className="px-4 py-2 bg-emerald-600 text-white rounded-lg">
                {isSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto p-4">
          <form data-testid="payment-form-modal" onSubmit={handleRecordPayment} className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg text-gray-900">Record Payment</h2>
            <p className="text-sm text-gray-600">
              Invoice: {selectedInvoice.invoice_number} | Balance: {formatInvoiceMoney(selectedInvoice.balance_amount, selectedInvoice.currency)}
            </p>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-emerald-800">Patient</span>
                <span className="font-medium text-emerald-950">{selectedInvoice.patient_name}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-emerald-800">Outstanding</span>
                <span className="font-medium text-emerald-950">
                  {formatInvoiceMoney(selectedInvoice.balance_amount, selectedInvoice.currency)}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Amount</label>
              <input
                data-testid="payment-amount-input"
                type="number"
                min={0.01}
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Remaining after this payment:{" "}
                {formatInvoiceMoney(
                  Math.max(selectedInvoice.balance_amount - Number(paymentForm.amount || 0), 0),
                  selectedInvoice.currency
                )}
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Method</label>
              <select
                data-testid="payment-method-select"
                value={paymentForm.method}
                onChange={(e) => setPaymentForm((p) => ({ ...p, method: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="insurance">Insurance</option>
                <option value="upi">UPI</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Reference</label>
              <input
                data-testid="payment-reference-input"
                type="text"
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                data-testid="payment-cancel-button"
                type="button"
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedInvoice(null);
                  setPaymentForm(initialPaymentForm);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button data-testid="payment-submit-button" type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-lg">
                {isSubmitting ? "Saving..." : "Record Payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

