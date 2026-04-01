"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, Download, IndianRupee, Plus, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { canAccessBilling } from "@/lib/roles";
import { Doctor, Invoice, Patient } from "@/types/api";

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
type MeResponse = { success: boolean; data: { role: string } };
type CreateInvoiceResponse = { success: boolean; data: Invoice };

const formatRupee = (value: number) => `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const formatInvoiceMoney = (amount: number, currency?: string | null) =>
  currency && currency !== "INR" ? `${currency} ${Number(amount || 0).toFixed(2)}` : `Rs. ${Number(amount || 0).toFixed(2)}`;

const initialInvoiceForm = {
  patientId: "",
  doctorId: "",
  description: "",
  amount: "",
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

  const loadInvoices = useCallback(() => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set("limit", "100");
    if (appliedSearch.trim()) params.set("q", appliedSearch.trim());
    if (appliedStatusFilter) params.set("status", appliedStatusFilter);
    if (patientFilterId) params.set("patientId", patientFilterId);

    apiRequest<BillingsResponse>(`/billings?${params.toString()}`, { authenticated: true })
      .then((billingRes) => {
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
      })
      .catch((err: Error) => setError(err.message || "Failed to load billing data"))
      .finally(() => setLoading(false));
  }, [appliedSearch, appliedStatusFilter, patientFilterId]);

  const loadMetadata = useCallback(() => {
    Promise.all([
      apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true }),
      apiRequest<DoctorsResponse>("/doctors?limit=100", { authenticated: true })
    ])
      .then(([patientsRes, doctorsRes]) => {
        setPatients(patientsRes.data.items || []);
        setDoctors(doctorsRes.data.items || []);
      })
      .catch((err: Error) => setError(err.message || "Failed to load billing form data"));
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

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

  if (currentRole && !canAccessBilling(currentRole)) {
    return <p className="text-red-600">You do not have access to billing.</p>;
  }

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const response = await apiRequest<CreateInvoiceResponse>("/billings", {
        method: "POST",
        authenticated: true,
        body: {
          patientId: invoiceForm.patientId,
          doctorId: invoiceForm.doctorId || null,
          description: invoiceForm.description.trim(),
          amount: invoiceForm.amount ? Number(invoiceForm.amount) : undefined,
          dueDate: invoiceForm.dueDate || null,
          notes: invoiceForm.notes.trim() || null
        }
      });

      const createdInvoice = response.data;
      setInvoices((previous) => [createdInvoice, ...previous.filter((invoice) => invoice.id !== createdInvoice.id)]);

      setShowCreate(false);
      setInvoiceForm(initialInvoiceForm);
      loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIssue = async (invoice: Invoice) => {
    setIssuingId(invoice.id);
    setError("");
    try {
      await apiRequest(`/billings/${invoice.id}/issue`, {
        method: "POST",
        authenticated: true,
        body: { dueDate: invoice.due_date || null }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-gray-900">Billing & Payments</h1>
          <p className="text-gray-600 mt-1">Manage invoices and payment records</p>
        </div>
        <button
          onClick={() => {
            setInvoiceForm({
              ...initialInvoiceForm,
              patientId: patientFilterId
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  <td className="px-6 py-4 text-emerald-700">{invoice.invoice_number}</td>
                  <td className="px-6 py-4 text-gray-800">{invoice.patient_name}</td>
                  <td className="px-6 py-4 text-gray-800">
                    {formatInvoiceMoney(invoice.total_amount, invoice.currency)}
                  </td>
                  <td className="px-6 py-4 text-gray-800">
                    {formatInvoiceMoney(invoice.paid_amount, invoice.currency)}
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
          <form onSubmit={handleCreateInvoice} className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg text-gray-900">Create Invoice</h2>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Patient</label>
              <select
                value={invoiceForm.patientId}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, patientId: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">Select patient</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Doctor (optional)</label>
              <select
                value={invoiceForm.doctorId}
                onChange={(e) => {
                  const nextDoctorId = e.target.value;
                  const doctor = doctors.find((item) => item.id === nextDoctorId) || null;
                  setInvoiceForm((p) => ({
                    ...p,
                    doctorId: nextDoctorId,
                    amount:
                      p.amount ||
                      (doctor && doctor.consultation_fee !== null && doctor.consultation_fee !== undefined
                        ? String(Number(doctor.consultation_fee).toFixed(2))
                        : "")
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={invoiceForm.description}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm((p) => ({ ...p, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={invoiceForm.dueDate}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Notes</label>
              <textarea
                rows={3}
                value={invoiceForm.notes}
                onChange={(e) => setInvoiceForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setInvoiceForm(initialInvoiceForm);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-emerald-600 text-white rounded-lg">
                {isSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto p-4">
          <form onSubmit={handleRecordPayment} className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg text-gray-900">Record Payment</h2>
            <p className="text-sm text-gray-600">
              Invoice: {selectedInvoice.invoice_number} | Balance: {formatInvoiceMoney(selectedInvoice.balance_amount, selectedInvoice.currency)}
            </p>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Method</label>
              <select
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
                type="text"
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
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
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-lg">
                {isSubmitting ? "Saving..." : "Record Payment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

