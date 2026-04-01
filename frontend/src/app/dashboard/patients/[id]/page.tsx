"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, CreditCard, FileText, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { isUuid } from "@/lib/uuid";
import { Patient } from "@/types/api";

type PatientResponse = {
  success: boolean;
  data: Patient;
};

const formatDate = (value: string | null) => {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
};

const formatGender = (value: string | null) => {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const getInitials = (value: string) =>
  value
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function PatientProfilePage() {
  const params = useParams<{ id: string }>();
  const patientId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const hasInvalidPatientId = Boolean(patientId) && !isUuid(patientId);
  const [loading, setLoading] = useState(Boolean(patientId) && !hasInvalidPatientId);
  const [error, setError] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);

  useEffect(() => {
    if (!patientId || hasInvalidPatientId) return;

    apiRequest<PatientResponse>(`/patients/${patientId}`, { authenticated: true })
      .then((response) => setPatient(response.data))
      .catch((err: Error) => setError(err.message || "Failed to load patient profile"))
      .finally(() => setLoading(false));
  }, [patientId, hasInvalidPatientId]);

  const profileFields = useMemo(() => {
    if (!patient) return [];

    return [
      { label: "Phone", value: patient.phone || "-" },
      { label: "Email", value: patient.email || "-" },
      { label: "Age", value: patient.age ?? "-" },
      { label: "Gender", value: formatGender(patient.gender) },
      { label: "Blood Type", value: patient.blood_type || "-" },
      { label: "Emergency Contact", value: patient.emergency_contact || "-" },
      { label: "Address", value: patient.address || "-" },
      { label: "Last Visit", value: formatDate(patient.last_visit_at) }
    ];
  }, [patient]);

  const actionCards = useMemo(() => {
    if (!patient) return [];

    return [
      {
        href: `/dashboard/patients?edit=${encodeURIComponent(patient.id)}`,
        label: "Edit Patient",
        description: "Update patient contact details and profile information.",
        icon: Pencil,
        tone: "border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700",
        descriptionTone: "text-emerald-50"
      },
      {
        href: `/dashboard/appointments?patientId=${encodeURIComponent(patient.id)}`,
        label: "Appointments",
        description: "Open this patient's visits and book the next appointment.",
        icon: CalendarDays,
        tone: "border-gray-200 bg-white text-gray-900 hover:border-emerald-200 hover:bg-emerald-50",
        descriptionTone: "text-gray-600"
      },
      {
        href: `/dashboard/medical-records?patientId=${encodeURIComponent(patient.id)}`,
        label: "Medical Records",
        description: "View diagnosis, prescription, and follow-up history.",
        icon: FileText,
        tone: "border-gray-200 bg-white text-gray-900 hover:border-emerald-200 hover:bg-emerald-50",
        descriptionTone: "text-gray-600"
      },
      {
        href: `/dashboard/billings?patientId=${encodeURIComponent(patient.id)}`,
        label: "Billing",
        description: "Check invoices, pending balance, and payment history.",
        icon: CreditCard,
        tone: "border-gray-200 bg-white text-gray-900 hover:border-emerald-200 hover:bg-emerald-50",
        descriptionTone: "text-gray-600"
      }
    ];
  }, [patient]);

  if (hasInvalidPatientId) {
    return <p className="text-red-600">Invalid patient id in URL.</p>;
  }

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

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="h-5 w-24 animate-pulse rounded bg-gray-100" />
                  <div className="mt-3 h-4 w-48 animate-pulse rounded bg-gray-200" />
                  <div className="mt-5 h-10 w-24 animate-pulse rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
              <div className="mt-3 h-5 w-36 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </section>
      </div>
    );
  }

  if (error || !patient) return <p className="text-red-600">{error || "Patient not found"}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-600">Patient</p>
          <h1 className="mt-2 text-2xl text-gray-900">Patient Profile</h1>
          <p className="mt-2 text-sm text-gray-600">Basic patient details and the next action for staff.</p>
        </div>
        <Link href="/dashboard/patients" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Back to Patients
        </Link>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-semibold text-white">
              {getInitials(patient.full_name)}
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl text-gray-900">{patient.full_name}</h2>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  {patient.status || "Active"}
                </span>
              </div>
              <p className="text-base text-gray-700">{patient.phone || "No phone number saved"}</p>
              <p className="max-w-xl text-sm leading-6 text-gray-600">
                Keep this page clean: patient details live here, while appointments, records, and billing stay in their own screens.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {actionCards.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  className={`rounded-2xl border p-5 transition ${action.tone}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-black/5 p-2">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="text-lg font-medium">{action.label}</p>
                  </div>
                  <p className={`mt-3 text-sm leading-6 ${action.descriptionTone}`}>{action.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {profileFields.map((field) => (
          <div key={field.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{field.label}</p>
            <p className="mt-3 text-base leading-7 text-gray-900">{field.value}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
