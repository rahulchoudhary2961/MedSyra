"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Patient } from "@/types/api";

type VisitItem = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  notes: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
};

type InvoiceItem = {
  id: string;
  invoice_number: string;
  total_amount: number;
  balance_amount: number;
  status: string;
  issue_date: string;
};

type ProfileResponse = {
  success: boolean;
  data: {
    patient: Patient;
    visits: VisitItem[];
    invoices: InvoiceItem[];
    summary: {
      totalVisits: number;
      totalSpent: number;
      lastVisitDate: string | null;
      pendingAmount: number;
    };
  };
};

const formatRupee = (value: number) => `Rs. ${Number(value || 0).toFixed(2)}`;

export default function PatientProfilePage() {
  const params = useParams<{ id: string }>();
  const patientId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [loading, setLoading] = useState(Boolean(patientId));
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<ProfileResponse["data"] | null>(null);

  useEffect(() => {
    if (!patientId) return;

    apiRequest<ProfileResponse>(`/patients/${patientId}/profile`, { authenticated: true })
      .then((response) => setProfile(response.data))
      .catch((err: Error) => setError(err.message || "Failed to load patient profile"))
      .finally(() => setLoading(false));
  }, [patientId]);

  const summaryCards = useMemo(() => {
    if (!profile) return [];
    return [
      { label: "Total Visits", value: profile.summary.totalVisits },
      { label: "Total Spent", value: formatRupee(profile.summary.totalSpent) },
      { label: "Pending Amount", value: formatRupee(profile.summary.pendingAmount) },
      { label: "Last Visit", value: profile.summary.lastVisitDate || "-" }
    ];
  }, [profile]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded bg-gray-100" />
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index}>
                <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
                <div className="mt-2 h-5 w-36 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
              <div className="mt-3 h-7 w-20 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </section>
      </div>
    );
  }
  if (error || !profile) return <p className="text-red-600">{error || "Patient not found"}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-gray-900">Patient Profile</h1>
          <p className="mt-1 text-gray-600">Connected patient history across visits and billing.</p>
        </div>
        <Link href="/dashboard/patients" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Back to Patients
        </Link>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div><p className="text-sm text-gray-500">Name</p><p className="mt-1 text-gray-900">{profile.patient.full_name}</p></div>
          <div><p className="text-sm text-gray-500">Phone</p><p className="mt-1 text-gray-900">{profile.patient.phone}</p></div>
          <div><p className="text-sm text-gray-500">Age / Gender</p><p className="mt-1 text-gray-900">{profile.patient.age ?? "-"} / {profile.patient.gender || "-"}</p></div>
          <div><p className="text-sm text-gray-500">Email</p><p className="mt-1 text-gray-900">{profile.patient.email || "-"}</p></div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-xl text-gray-900">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4"><h2 className="text-gray-900">Visit History</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-sm text-gray-600">Date</th><th className="px-6 py-3 text-left text-sm text-gray-600">Doctor</th><th className="px-6 py-3 text-left text-sm text-gray-600">Status</th><th className="px-6 py-3 text-left text-sm text-gray-600">Notes</th></tr></thead>
            <tbody>
              {profile.visits.length === 0 && <tr><td colSpan={4} className="px-6 py-4 text-sm text-gray-500">No visits yet.</td></tr>}
              {profile.visits.map((visit) => (
                <tr key={visit.id} className="border-t border-gray-100">
                  <td className="px-6 py-4 text-sm text-gray-800">{visit.appointment_date} {visit.appointment_time.slice(0, 5)}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{visit.doctor_name || "-"}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{visit.status}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{visit.notes || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4"><h2 className="text-gray-900">Billing History</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-sm text-gray-600">Invoice</th><th className="px-6 py-3 text-left text-sm text-gray-600">Amount</th><th className="px-6 py-3 text-left text-sm text-gray-600">Paid / Pending</th><th className="px-6 py-3 text-left text-sm text-gray-600">Date</th></tr></thead>
            <tbody>
              {profile.invoices.length === 0 && <tr><td colSpan={4} className="px-6 py-4 text-sm text-gray-500">No invoices yet.</td></tr>}
              {profile.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-gray-100">
                  <td className="px-6 py-4 text-sm text-gray-800">{invoice.invoice_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{formatRupee(invoice.total_amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{invoice.balance_amount > 0 ? `Pending ${formatRupee(invoice.balance_amount)}` : "Paid"}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{invoice.issue_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
