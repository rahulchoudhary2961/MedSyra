"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, CreditCard, Download, Eye, FileText, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";
import { MedicalRecord, Patient, SmartSummaryItem } from "@/types/api";

type PatientVisit = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  category: string | null;
  status: string;
  planned_procedures: string | null;
  notes: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
};

type PatientProfileResponse = {
  success: boolean;
  data: {
    patient: Patient;
    visits: PatientVisit[];
    medicalRecords: MedicalRecord[];
    invoices: Array<{
      id: string;
      invoice_number: string;
      total_amount: number;
      balance_amount: number;
      status: string;
      issue_date: string;
    }>;
    smartSummary: SmartSummaryItem[];
    summary: {
      totalVisits: number;
      totalSpent: number;
      lastVisitDate: string | null;
      pendingAmount: number;
    };
  };
};

type AttachmentPreview = {
  recordId: string;
  url: string | null;
  fileName: string;
  contentType: string;
  externalUrl: string | null;
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

const formatCurrency = (value: number | null | undefined) =>
  `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const formatTime = (value: string | null) => {
  if (!value) return "-";

  const parsed = new Date(`2000-01-01T${value}`);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 5);
  }

  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
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

const getAttachmentEndpoint = (recordId: string) => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1";
  return `${apiBaseUrl.replace(/\/$/, "")}/medical-records/${recordId}/attachment`;
};

const getAttachmentFileName = (recordId: string, fileUrl?: string | null) => {
  const storedFileName = fileUrl?.split("/").pop();
  if (storedFileName) {
    return storedFileName.replace(/^\d{13}-[0-9a-f-]{36}-/i, "");
  }

  return `medical-record-${recordId}`;
};

const inferContentType = (fileUrl?: string | null) => {
  const normalized = fileUrl?.toLowerCase() || "";
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
};

const isImageContentType = (contentType: string) => contentType.startsWith("image/");

const triggerDownload = (url: string, fileName: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

export default function PatientProfilePage() {
  const params = useParams<{ id: string }>();
  const patientId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const hasInvalidPatientId = Boolean(patientId) && !isUuid(patientId);
  const [loading, setLoading] = useState(Boolean(patientId) && !hasInvalidPatientId);
  const [error, setError] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [smartSummary, setSmartSummary] = useState<SmartSummaryItem[]>([]);
  const [summary, setSummary] = useState<{
    totalVisits: number;
    totalSpent: number;
    lastVisitDate: string | null;
    pendingAmount: number;
  } | null>(null);
  const [previews, setPreviews] = useState<Record<string, AttachmentPreview>>({});

  useEffect(() => {
    if (!patientId || hasInvalidPatientId) return;

    apiRequest<PatientProfileResponse>(`/patients/${patientId}/profile`, { authenticated: true })
      .then((response) => {
        setPatient(response.data.patient);
        setVisits(response.data.visits || []);
        setRecords(response.data.medicalRecords || []);
        setSmartSummary(response.data.smartSummary || []);
        setSummary(response.data.summary || null);
      })
      .catch((err: Error) => setError(err.message || "Failed to load patient profile"))
      .finally(() => setLoading(false));
  }, [patientId, hasInvalidPatientId]);

  useEffect(() => {
    const attachmentRecords = records.filter((record) => record.file_url);
    if (attachmentRecords.length === 0) {
      setPreviews({});
      return;
    }

    let revokedUrls: string[] = [];
    let cancelled = false;

    const loadPreviews = async () => {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const items = await Promise.all(
        attachmentRecords.map(async (record) => {
          const fileUrl = record.file_url || "";
          const fallbackFileName = getAttachmentFileName(record.id, fileUrl);
          const fallbackContentType = inferContentType(fileUrl);

          if (/^https?:\/\//i.test(fileUrl)) {
            return [
              record.id,
              {
                recordId: record.id,
                url: fileUrl,
                fileName: fallbackFileName,
                contentType: fallbackContentType,
                externalUrl: fileUrl
              }
            ] as const;
          }

          try {
            const response = await fetch(getAttachmentEndpoint(record.id), {
              method: "GET",
              headers,
              cache: "no-store"
            });

            if (!response.ok) {
              return null;
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            revokedUrls.push(objectUrl);

            return [
              record.id,
              {
                recordId: record.id,
                url: objectUrl,
                fileName: fallbackFileName,
                contentType: blob.type || fallbackContentType,
                externalUrl: null
              }
            ] as const;
          } catch {
            return null;
          }
        })
      );

      const nextPreviews: Record<string, AttachmentPreview> = {};
      items.forEach((item) => {
        if (!item) {
          return;
        }

        const [recordId, preview] = item;
        nextPreviews[recordId] = preview;
      });

      if (cancelled) {
        revokedUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setPreviews(nextPreviews);
    };

    void loadPreviews();

    return () => {
      cancelled = true;
      revokedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [records]);

  const attachmentRecords = useMemo(
    () => records.filter((record) => record.file_url).sort((left, right) => right.record_date.localeCompare(left.record_date)),
    [records]
  );

  const profileFields = useMemo(() => {
    if (!patient) return [];

    return [
      { label: "Patient ID", value: patient.patient_code || "-" },
      { label: "Phone", value: patient.phone || "-" },
      { label: "Email", value: patient.email || "-" },
      { label: "Date of Birth", value: formatDate(patient.date_of_birth) },
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
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-600">
                  {patient.patient_code}
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

      {summary && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Total Visits</p>
            <p className="mt-3 text-base leading-7 text-gray-900">{summary.totalVisits}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Total Spent</p>
            <p className="mt-3 text-base leading-7 text-gray-900">{formatCurrency(summary.totalSpent)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Pending Amount</p>
            <p className="mt-3 text-base leading-7 text-gray-900">{formatCurrency(summary.pendingAmount)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Last Recorded Visit</p>
            <p className="mt-3 text-base leading-7 text-gray-900">{formatDate(summary.lastVisitDate)}</p>
          </div>
        </section>
      )}

      {smartSummary.length > 0 && (
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Snapshot</p>
            <h2 className="mt-2 text-xl text-gray-900">Patient Summary</h2>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {smartSummary.map((item) => (
              <div key={item.label} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{item.label}</p>
                <p className="mt-3 text-base leading-7 text-emerald-950">{item.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">History</p>
            <h2 className="mt-2 text-xl text-gray-900">Visit History</h2>
          </div>
          <Link
            href={`/dashboard/appointments?patientId=${encodeURIComponent(patient.id)}`}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Open Appointments
          </Link>
        </div>

        {visits.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            No visit history recorded yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {visits.slice(0, 6).map((visit) => (
              <article key={visit.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(visit.appointment_date)} at {formatTime(visit.appointment_time)}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {visit.category || "Consultation"}{visit.doctor_name ? ` with ${visit.doctor_name}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">
                    {visit.status}
                  </span>
                </div>
                {(visit.planned_procedures || visit.notes) && (
                  <p className="mt-3 text-sm leading-6 text-gray-700">{visit.planned_procedures || visit.notes}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">EHR-Lite</p>
            <h2 className="mt-2 text-xl text-gray-900">Clinical Notes</h2>
          </div>
          <Link
            href={`/dashboard/medical-records?patientId=${encodeURIComponent(patient.id)}`}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Open Medical Records
          </Link>
        </div>

        {records.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            No medical notes recorded yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {records.slice(0, 6).map((record) => (
              <article key={record.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{record.record_type}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatDate(record.record_date)}{record.doctor_name ? ` • ${record.doctor_name}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">
                    {record.status}
                  </span>
                </div>
                {record.diagnosis && <p className="mt-3 text-sm text-gray-800"><span className="font-medium">Diagnosis:</span> {record.diagnosis}</p>}
                {record.prescription && <p className="mt-2 text-sm text-gray-800"><span className="font-medium">Prescription:</span> {record.prescription}</p>}
                {record.notes && <p className="mt-2 text-sm leading-6 text-gray-700">{record.notes}</p>}
                {record.follow_up_date && (
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
                    Follow-up {formatDate(record.follow_up_date)}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Reports & Notes</p>
            <h2 className="mt-2 text-xl text-gray-900">Uploaded Files</h2>
            <p className="mt-2 text-sm text-gray-600">
              Photos and documents attached to this patient&apos;s medical records.
            </p>
          </div>
          <Link
            href={`/dashboard/medical-records?patientId=${encodeURIComponent(patient.id)}`}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            View All Records
          </Link>
        </div>

        {attachmentRecords.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            No uploaded photos or documents for this patient yet.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {attachmentRecords.map((record) => {
              const preview = previews[record.id];
              const previewUrl = preview?.url || "";
              const openUrl = preview?.externalUrl || preview?.url || (/^https?:\/\//i.test(record.file_url || "") ? record.file_url || "" : "");
              const downloadUrl = preview?.url || preview?.externalUrl || "";
              const fileName = preview?.fileName || getAttachmentFileName(record.id, record.file_url);
              const isImage = isImageContentType(preview?.contentType || inferContentType(record.file_url));

              return (
                <article key={record.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="relative aspect-[4/3] bg-gray-100">
                    {previewUrl && isImage ? (
                      <img
                        src={previewUrl}
                        alt={record.record_type || "Medical record attachment"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-stone-50 via-white to-emerald-50 px-4 text-center">
                        <div className="rounded-2xl bg-white p-3 text-emerald-600 shadow-sm ring-1 ring-gray-200">
                          <FileText className="h-8 w-8" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{record.record_type || "Document"}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-500">
                            {(preview?.contentType || inferContentType(record.file_url)).includes("pdf") ? "PDF file" : "Attachment"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{formatDate(record.record_date)}</p>
                      <p className="truncate text-xs text-gray-500">{preview?.fileName || getAttachmentFileName(record.id, record.file_url)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {openUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => window.open(openUrl, "_blank", "noopener,noreferrer")}
                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            title="Open attachment"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {downloadUrl && (
                            <button
                              type="button"
                              onClick={() => triggerDownload(downloadUrl, fileName)}
                              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                              title="Download attachment"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
