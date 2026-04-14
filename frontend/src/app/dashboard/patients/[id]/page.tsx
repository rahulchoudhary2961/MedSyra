"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, CreditCard, Download, Eye, FileText, Pencil, Pill, Search, Stethoscope, Trash2, Upload, Users } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiRequest } from "@/lib/api";
import DocumentPreviewCard from "@/app/components/DocumentPreviewCard";
import { isUuid } from "@/lib/uuid";
import { CrmTask, LabOrder, MedicalRecord, Patient, PharmacyDispense, SmartSummaryItem } from "@/types/api";

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
    labOrders: LabOrder[];
    pharmacyDispenses: PharmacyDispense[];
    smartSummary: SmartSummaryItem[];
    summary: {
      totalVisits: number;
      totalSpent: number;
      lastVisitDate: string | null;
      pendingAmount: number;
    };
  };
};

type CrmTasksResponse = {
  success: boolean;
  data: {
    items: CrmTask[];
    summary: {
      totalTasks: number;
      openTasks: number;
      contactedTasks: number;
      scheduledTasks: number;
      closedTasks: number;
      overdueTasks: number;
      dueTodayTasks: number;
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

type PatientInvoiceHistoryItem = {
  id: string;
  invoice_number: string;
  total_amount: number;
  balance_amount: number;
  status: string;
  issue_date: string;
};

type PatientTimelineItem = {
  id: string;
  type: "visit" | "prescription" | "report" | "invoice" | "pharmacy";
  date: string;
  secondaryDate?: string | null;
  title: string;
  subtitle: string;
  tags: string[];
  detailLines: string[];
  sectionId: string;
  ctaLabel: string;
  toneClass: string;
  searchText: string;
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
const MAX_INLINE_ATTACHMENT_PRELOAD = 8;

const triggerDownload = (url: string, fileName: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

const normalizeHistorySearch = (value: string) => value.trim().toLowerCase();

const buildTimelineSearchText = (...parts: Array<string | null | undefined>) =>
  parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const getTimelineTone = (type: PatientTimelineItem["type"]) => {
  if (type === "invoice") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (type === "report") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (type === "pharmacy") return "bg-violet-50 text-violet-700 ring-violet-200";
  if (type === "prescription") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
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
  const [invoices, setInvoices] = useState<PatientInvoiceHistoryItem[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [pharmacyDispenses, setPharmacyDispenses] = useState<PharmacyDispense[]>([]);
  const [crmTasks, setCrmTasks] = useState<CrmTask[]>([]);
  const [smartSummary, setSmartSummary] = useState<SmartSummaryItem[]>([]);
  const [summary, setSummary] = useState<{
    totalVisits: number;
    totalSpent: number;
    lastVisitDate: string | null;
    pendingAmount: number;
  } | null>(null);
  const [previews, setPreviews] = useState<Record<string, AttachmentPreview>>({});
  const [historySearch, setHistorySearch] = useState("");
  const [uploadingRecordId, setUploadingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const previewsRef = useRef<Record<string, AttachmentPreview>>({});
  const attachmentObjectUrlsRef = useRef<string[]>([]);
  const attachmentUploadInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentUploadTargetRef = useRef<MedicalRecord | null>(null);

  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const fileToBase64 = useCallback(
    (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== "string") {
            reject(new Error("Failed to read file"));
            return;
          }

          resolve(result.split(",", 2)[1] || "");
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      }),
    []
  );

  const refreshPatientProfile = useCallback(async () => {
    if (!patientId || hasInvalidPatientId) {
      return;
    }

    const response = await apiRequest<PatientProfileResponse>(`/patients/${patientId}/profile`, { authenticated: true });
    setPatient(response.data.patient);
    setVisits(response.data.visits || []);
    setRecords(response.data.medicalRecords || []);
    setInvoices(response.data.invoices || []);
    setLabOrders(response.data.labOrders || []);
    setPharmacyDispenses(response.data.pharmacyDispenses || []);
    setSmartSummary(response.data.smartSummary || []);
    setSummary(response.data.summary || null);
  }, [hasInvalidPatientId, patientId]);

  const handleAttachmentUploadClick = useCallback((record: MedicalRecord) => {
    attachmentUploadTargetRef.current = record;
    attachmentUploadInputRef.current?.click();
  }, []);

  const handleAttachmentUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const targetRecord = attachmentUploadTargetRef.current;
      event.target.value = "";

      if (!file || !targetRecord) {
        return;
      }

      setUploadingRecordId(targetRecord.id);
      setError("");

      try {
        const dataBase64 = await fileToBase64(file);
        const uploadResponse = await apiRequest<{ success: boolean; data: { fileUrl: string } }>("/medical-records/upload", {
          method: "POST",
          authenticated: true,
          body: {
            fileName: file.name,
            contentType: file.type,
            dataBase64
          }
        });

        await apiRequest(`/medical-records/${targetRecord.id}`, {
          method: "PATCH",
          authenticated: true,
          body: {
            fileUrl: uploadResponse.data.fileUrl
          }
        });

        await refreshPatientProfile();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to upload attachment";
        setError(message);
      } finally {
        setUploadingRecordId(null);
        attachmentUploadTargetRef.current = null;
      }
    },
    [fileToBase64, refreshPatientProfile]
  );

  const handleDeleteRecord = useCallback(
    async (record: MedicalRecord) => {
      if (!window.confirm(`Delete ${record.record_type} for ${record.patient_name}?`)) {
        return;
      }

      setDeletingRecordId(record.id);
      setError("");

      try {
        await apiRequest(`/medical-records/${record.id}`, {
          method: "DELETE",
          authenticated: true
        });
        await refreshPatientProfile();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete medical record";
        setError(message);
      } finally {
        setDeletingRecordId(null);
      }
    },
    [refreshPatientProfile]
  );

  useEffect(() => {
    if (!patientId || hasInvalidPatientId) return;

    setLoading(true);
    refreshPatientProfile()
      .catch((err: Error) => setError(err.message || "Failed to load patient profile"))
      .finally(() => setLoading(false));
  }, [patientId, hasInvalidPatientId, refreshPatientProfile]);

  useEffect(() => {
    if (!patient || hasInvalidPatientId) {
      return;
    }

      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) {
        return;
      }

    window.requestAnimationFrame(() => scrollToSection(hash));
  }, [patient, hasInvalidPatientId, scrollToSection]);

  useEffect(() => {
    if (!patientId || hasInvalidPatientId) {
      return;
    }

    apiRequest<{ success: boolean; data: { items: CrmTask[] } }>(`/crm/tasks?patientId=${encodeURIComponent(patientId)}&limit=50`, {
      authenticated: true
    })
      .then((response) => setCrmTasks(response.data.items || []))
      .catch(() => setCrmTasks([]));
  }, [patientId, hasInvalidPatientId]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  const revokeAttachmentObjectUrls = useCallback(() => {
    attachmentObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    attachmentObjectUrlsRef.current = [];
  }, []);

  const ensureAttachmentPreview = useCallback(async (record: MedicalRecord) => {
    const existingPreview = previewsRef.current[record.id];
    if (existingPreview) {
      return existingPreview;
    }

    const fileUrl = record.file_url || "";
    const fallbackFileName = getAttachmentFileName(record.id, fileUrl);
    const fallbackContentType = inferContentType(fileUrl);

    if (/^https?:\/\//i.test(fileUrl)) {
      const preview: AttachmentPreview = {
        recordId: record.id,
        url: isImageContentType(fallbackContentType) ? fileUrl : null,
        fileName: fallbackFileName,
        contentType: fallbackContentType,
        externalUrl: fileUrl
      };

      previewsRef.current = { ...previewsRef.current, [record.id]: preview };
      setPreviews((current) => (current[record.id] ? current : { ...current, [record.id]: preview }));
      return preview;
    }

    const response = await apiFetch(`/medical-records/${record.id}/attachment`, {
      method: "GET",
      authenticated: true,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Failed to load attachment preview");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    attachmentObjectUrlsRef.current.push(objectUrl);

    const preview: AttachmentPreview = {
      recordId: record.id,
      url: objectUrl,
      fileName: fallbackFileName,
      contentType: blob.type || fallbackContentType,
      externalUrl: null
    };

    previewsRef.current = { ...previewsRef.current, [record.id]: preview };
    setPreviews((current) => (current[record.id] ? current : { ...current, [record.id]: preview }));
    return preview;
  }, []);

  useEffect(() => {
    const attachmentRecords = records.filter((record) => record.file_url);
    revokeAttachmentObjectUrls();
    previewsRef.current = {};

    if (attachmentRecords.length === 0) {
      setPreviews({});
      return;
    }

    let cancelled = false;

    const loadPreviews = async () => {
      const eagerRecords = attachmentRecords.slice(0, MAX_INLINE_ATTACHMENT_PRELOAD);

      const items = await Promise.all(
        eagerRecords.map(async (record) => {
          try {
            const preview = await ensureAttachmentPreview(record);
            return [record.id, preview] as const;
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
        return;
      }

      setPreviews((current) => ({ ...current, ...nextPreviews }));
    };

    void loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [records, ensureAttachmentPreview, revokeAttachmentObjectUrls]);

  useEffect(() => () => revokeAttachmentObjectUrls(), [revokeAttachmentObjectUrls]);

  const handleOpenAttachment = useCallback(
    async (record: MedicalRecord) => {
      try {
        const preview = await ensureAttachmentPreview(record);
        const openUrl =
          preview.externalUrl || preview.url || (/^https?:\/\//i.test(record.file_url || "") ? record.file_url || "" : "");

        if (openUrl) {
          window.open(openUrl, "_blank", "noopener,noreferrer");
        }
      } catch {
        // Keep the rest of the profile usable if a single attachment fails.
      }
    },
    [ensureAttachmentPreview]
  );

  const handleDownloadAttachment = useCallback(
    async (record: MedicalRecord) => {
      try {
        const preview = await ensureAttachmentPreview(record);
        const downloadUrl =
          preview.url || preview.externalUrl || (/^https?:\/\//i.test(record.file_url || "") ? record.file_url || "" : "");

        if (downloadUrl) {
          triggerDownload(downloadUrl, preview.fileName || getAttachmentFileName(record.id, record.file_url));
        }
      } catch {
        // Keep the rest of the profile usable if a single attachment fails.
      }
    },
    [ensureAttachmentPreview]
  );

  const renderAttachmentPreview = (record: MedicalRecord) => {
    if (!record.file_url) {
      return null;
    }

    const preview = previews[record.id];
    const previewUrl = preview?.url || "";
    const contentType = preview?.contentType || inferContentType(record.file_url);
    return (
      <DocumentPreviewCard
        title={record.record_type || "Attachment"}
        fileName={preview?.fileName || getAttachmentFileName(record.id, record.file_url)}
        fileUrl={record.file_url}
        previewUrl={previewUrl}
        contentType={contentType}
        onClick={() => void handleOpenAttachment(record)}
      />
    );
  };

  const attachmentRecords = useMemo(
    () => records.filter((record) => record.file_url).sort((left, right) => right.record_date.localeCompare(left.record_date)),
    [records]
  );

  const historyTimeline = useMemo<PatientTimelineItem[]>(() => {
    if (!patient) {
      return [];
    }

    const visitItems: PatientTimelineItem[] = visits.map((visit) => ({
      id: `visit-${visit.id}`,
      type: "visit",
      date: visit.appointment_date,
      secondaryDate: visit.appointment_time,
      title: `${visit.category || "Consultation"} visit`,
      subtitle: visit.doctor_name ? `${visit.doctor_name} | ${formatTime(visit.appointment_time)}` : formatTime(visit.appointment_time),
      tags: ["Visit"],
      detailLines: [visit.planned_procedures || visit.notes || "Visit recorded in appointments", `Status: ${visit.status}`],
      ctaLabel: "Open Appointments",
      toneClass: getTimelineTone("visit"),
      searchText: buildTimelineSearchText(
        visit.category,
        visit.status,
        visit.doctor_name,
        visit.planned_procedures,
        visit.notes,
        visit.appointment_date,
        visit.appointment_time
      ),
      sectionId: "appointments"
    }));

    const recordItems: PatientTimelineItem[] = records.map((record) => {
      const tags = ["Clinical Note"];
      let type: PatientTimelineItem["type"] = "visit";

      if (record.prescription) {
        tags.unshift("Prescription");
        type = "prescription";
      }
      if (record.file_url) {
        tags.push("Report");
        type = "report";
      }

      return {
        id: `record-${record.id}`,
        type,
        date: record.record_date,
        title: record.record_type,
        subtitle: record.doctor_name ? `${record.doctor_name} | ${record.status}` : record.status,
        tags,
        detailLines: [
          record.diagnosis ? `Diagnosis: ${record.diagnosis}` : "",
          record.prescription ? `Prescription: ${record.prescription}` : "",
          record.notes || "",
          record.follow_up_date ? `Follow-up ${formatDate(record.follow_up_date)}` : ""
        ].filter(Boolean),
        sectionId: "medical-records",
        ctaLabel: "Open Medical Records",
        toneClass: getTimelineTone(type),
        searchText: buildTimelineSearchText(
          record.record_type,
          record.status,
          record.doctor_name,
          record.diagnosis,
          record.prescription,
          record.notes,
          record.follow_up_date
        )
      };
    });

    const labItems: PatientTimelineItem[] = labOrders.map((order) => ({
      id: `lab-${order.id}`,
      type: "report",
      date: order.ordered_date,
      title: order.order_number,
      subtitle: `${order.status.replace(/_/g, " ")}${order.doctor_name ? ` | ${order.doctor_name}` : ""}`,
      tags: [order.report_file_url ? "Lab Report" : "Lab Order", "Report"],
      detailLines: [
        order.items.map((item) => item.test_name).join(", "),
        order.notes || "",
        order.due_date ? `Due ${formatDate(order.due_date)}` : ""
      ].filter(Boolean),
      sectionId: "lab",
      ctaLabel: "Open Lab",
      toneClass: getTimelineTone("report"),
      searchText: buildTimelineSearchText(
        order.order_number,
        order.status,
        order.doctor_name,
        order.notes,
        order.due_date,
        ...order.items.map((item) => item.test_name)
      )
    }));

    const invoiceItems: PatientTimelineItem[] = invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: "invoice",
      date: invoice.issue_date,
      title: invoice.invoice_number,
      subtitle: `${formatCurrency(invoice.total_amount)} | ${invoice.status}`,
      tags: ["Invoice"],
      detailLines: [
        invoice.balance_amount > 0 ? `Pending ${formatCurrency(invoice.balance_amount)}` : "Paid in full"
      ],
      sectionId: "billing",
      ctaLabel: "Open Billing",
      toneClass: getTimelineTone("invoice"),
      searchText: buildTimelineSearchText(
        invoice.invoice_number,
        invoice.status,
        String(invoice.total_amount),
        String(invoice.balance_amount),
        invoice.issue_date
      )
    }));

    const pharmacyItems: PatientTimelineItem[] = pharmacyDispenses.map((dispense) => ({
      id: `pharmacy-${dispense.id}`,
      type: "pharmacy",
      date: dispense.dispensed_date,
      title: dispense.dispense_number,
      subtitle: `${dispense.status}${dispense.invoice_number ? ` | ${dispense.invoice_number}` : ""}`,
      tags: ["Pharmacy", "Prescription"],
      detailLines: [
        dispense.items.map((item) => `${item.medicine_name} x ${item.quantity}`).join(", "),
        dispense.prescription_snapshot || "",
        dispense.notes || ""
      ].filter(Boolean),
      sectionId: "pharmacy",
      ctaLabel: "Open Pharmacy",
      toneClass: getTimelineTone("pharmacy"),
      searchText: buildTimelineSearchText(
        dispense.dispense_number,
        dispense.status,
        dispense.invoice_number,
        dispense.prescription_snapshot,
        dispense.notes,
        ...dispense.items.map((item) => `${item.medicine_name} ${item.batch_number}`)
      )
    }));

    return [...visitItems, ...recordItems, ...labItems, ...invoiceItems, ...pharmacyItems].sort((left, right) => {
      const leftKey = `${left.date}T${left.secondaryDate || "00:00:00"}`;
      const rightKey = `${right.date}T${right.secondaryDate || "00:00:00"}`;
      return rightKey.localeCompare(leftKey);
    });
  }, [patient, visits, records, labOrders, invoices, pharmacyDispenses]);

  const filteredHistoryTimeline = useMemo(() => {
    const query = normalizeHistorySearch(historySearch);
    if (!query) {
      return historyTimeline;
    }

    return historyTimeline.filter((item) => item.searchText.includes(query));
  }, [historySearch, historyTimeline]);

  const timelineSummary = useMemo(() => {
    const counts = {
      visits: historyTimeline.filter((item) => item.type === "visit").length,
      prescriptions: historyTimeline.filter((item) => item.tags.includes("Prescription")).length,
      reports: historyTimeline.filter((item) => item.tags.includes("Report") || item.tags.includes("Lab Report")).length,
      invoices: historyTimeline.filter((item) => item.type === "invoice").length
    };

    return counts;
  }, [historyTimeline]);

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
        sectionId: "appointments",
        label: "Appointments",
        description: "Open this patient's visits and book the next appointment.",
        icon: CalendarDays,
        tone: "border-gray-200 bg-white text-gray-900 hover:border-emerald-200 hover:bg-emerald-50",
        descriptionTone: "text-gray-600"
      },
      {
        sectionId: "medical-records",
        label: "Medical Records",
        description: "View diagnosis, prescription, and follow-up history.",
        icon: FileText,
        tone: "border-gray-200 bg-white text-gray-900 hover:border-emerald-200 hover:bg-emerald-50",
        descriptionTone: "text-gray-600"
      },
      {
        sectionId: "crm",
        label: "CRM",
        description: "Track follow-up ownership, recall status, and outreach notes.",
        icon: Users,
        tone: "border-gray-200 bg-white text-gray-900 hover:border-emerald-200 hover:bg-emerald-50",
        descriptionTone: "text-gray-600"
      },
      {
        sectionId: "pharmacy",
        label: "Pharmacy",
        description: "Review dispensed medicines, batch history, and linked pharmacy bills.",
        icon: Pill,
        tone: "border-gray-200 bg-white text-gray-900 hover:border-emerald-200 hover:bg-emerald-50",
        descriptionTone: "text-gray-600"
      },
      {
        sectionId: "lab",
        label: "Lab & Diagnostics",
        description: "View diagnostic orders, report status, and completed lab work.",
        icon: Stethoscope,
        tone: "border-gray-200 bg-white text-gray-900 hover:border-emerald-200 hover:bg-emerald-50",
        descriptionTone: "text-gray-600"
      },
      {
        sectionId: "billing",
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
              if ("sectionId" in action) {
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => scrollToSection(action.sectionId ?? "overview")}
                    className={`text-left rounded-2xl border p-5 transition ${action.tone}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-black/5 p-2">
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="text-lg font-medium">{action.label}</p>
                    </div>
                    <p className={`mt-3 text-sm leading-6 ${action.descriptionTone}`}>{action.description}</p>
                  </button>
                );
              }

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

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "overview", label: "Overview" },
            { id: "crm", label: "CRM" },
            { id: "appointments", label: "Appointments" },
            { id: "medical-records", label: "Medical Records" },
            { id: "lab", label: "Lab" },
            { id: "pharmacy", label: "Pharmacy" },
            { id: "billing", label: "Billing" },
            { id: "attachments", label: "Attachments" }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section id="overview" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 scroll-mt-24">
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
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8 scroll-mt-24">
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

      <section id="crm" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8 scroll-mt-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">CRM</p>
            <h2 className="mt-2 text-xl text-gray-900">Follow-up Tasks</h2>
            <p className="mt-2 text-sm text-gray-600">
              Follow-up, recall, and retention work tied to this patient.
            </p>
          </div>
        </div>

        {crmTasks.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            No CRM tasks found for this patient yet.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {crmTasks.slice(0, 6).map((task) => (
              <article key={task.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {task.task_type.replace(/_/g, " ")} | {task.status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">
                    {task.priority}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>Due {formatDate(task.due_date)}</span>
                  <span>{task.assigned_user_name || "Unassigned"}</span>
                </div>
                {task.outcome_notes && <p className="mt-3 text-sm leading-6 text-gray-700">{task.outcome_notes}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Consultation View</p>
            <h2 className="mt-2 text-xl text-gray-900">Patient Timeline</h2>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Visits, prescriptions, reports, pharmacy dispenses, and invoices in one searchable stream so doctors can find context fast.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Visits</p>
              <p className="mt-2 text-lg text-gray-900">{timelineSummary.visits}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Prescriptions</p>
              <p className="mt-2 text-lg text-gray-900">{timelineSummary.prescriptions}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Reports</p>
              <p className="mt-2 text-lg text-gray-900">{timelineSummary.reports}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">Invoices</p>
              <p className="mt-2 text-lg text-gray-900">{timelineSummary.invoices}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex flex-1 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Search diagnosis, medicine, report, invoice, or notes"
              className="w-full border-none bg-transparent text-sm text-gray-700 outline-none"
            />
          </label>
          <p className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-900">{filteredHistoryTimeline.length}</span> of{" "}
            <span className="font-medium text-gray-900">{historyTimeline.length}</span> history items
          </p>
        </div>

        {filteredHistoryTimeline.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            No patient history matched the current search.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filteredHistoryTimeline.slice(0, 16).map((item) => (
              <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.tags.map((tag) => (
                        <span
                          key={`${item.id}-${tag}`}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1 ${item.toneClass}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3">
                      <p className="text-base font-medium text-gray-900">{item.title}</p>
                      <p className="mt-1 text-sm text-gray-600">
                        {formatDate(item.date)}
                        {item.secondaryDate ? ` | ${formatTime(item.secondaryDate)}` : ""}
                        {item.subtitle ? ` | ${item.subtitle}` : ""}
                      </p>
                    </div>
                  {item.detailLines.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {item.detailLines.slice(0, 3).map((line) => (
                        <p key={`${item.id}-${line}`} className="text-sm leading-6 text-gray-700">
                          {line}
                          </p>
                      ))}
                    </div>
                  )}
                </div>
                  <button
                    type="button"
                    onClick={() => scrollToSection(item.sectionId)}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {item.ctaLabel}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="pharmacy" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8 scroll-mt-24">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Dispensing</p>
            <h2 className="mt-2 text-xl text-gray-900">Pharmacy History</h2>
          </div>
        </div>

        {pharmacyDispenses.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            No pharmacy dispenses recorded for this patient yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {pharmacyDispenses.slice(0, 6).map((dispense) => (
              <article key={dispense.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{dispense.dispense_number}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Dispensed {formatDate(dispense.dispensed_date)}{dispense.doctor_name ? ` | ${dispense.doctor_name}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">
                    {dispense.invoice_number ? `Invoice ${dispense.invoice_number}` : "No invoice"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dispense.items.map((item) => (
                    <span key={item.id} className="rounded-full bg-white px-3 py-1 text-xs text-gray-700 ring-1 ring-gray-200">
                      {item.medicine_name} | {item.batch_number} | {item.quantity}
                    </span>
                  ))}
                </div>
                {dispense.prescription_snapshot && <p className="mt-3 text-sm leading-6 text-gray-700">{dispense.prescription_snapshot}</p>}
                {dispense.notes && <p className="mt-2 text-sm leading-6 text-gray-700">{dispense.notes}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="appointments" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8 scroll-mt-24">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">History</p>
            <h2 className="mt-2 text-xl text-gray-900">Visit History</h2>
          </div>
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

      <section id="medical-records" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8 scroll-mt-24">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">EHR-Lite</p>
            <h2 className="mt-2 text-xl text-gray-900">Clinical Notes</h2>
          </div>
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
                      {formatDate(record.record_date)}{record.doctor_name ? ` | ${record.doctor_name}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">
                    {record.status}
                  </span>
                </div>
                {record.diagnosis && <p className="mt-3 text-sm text-gray-800"><span className="font-medium">Diagnosis:</span> {record.diagnosis}</p>}
                {record.prescription && <p className="mt-2 text-sm text-gray-800"><span className="font-medium">Prescription:</span> {record.prescription}</p>}
                {record.notes && <p className="mt-2 text-sm leading-6 text-gray-700">{record.notes}</p>}
                {renderAttachmentPreview(record)}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAttachmentUploadClick(record)}
                    disabled={uploadingRecordId === record.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {record.file_url ? "Replace Attachment" : "Upload Attachment"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadAttachment(record)}
                    disabled={!record.file_url}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteRecord(record)}
                    disabled={deletingRecordId === record.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingRecordId === record.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
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
      <input
        ref={attachmentUploadInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(event) => void handleAttachmentUploadChange(event)}
      />

      <section id="lab" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8 scroll-mt-24">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Diagnostics</p>
            <h2 className="mt-2 text-xl text-gray-900">Lab Orders</h2>
          </div>
        </div>

        {labOrders.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            No diagnostic orders recorded for this patient yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {labOrders.slice(0, 6).map((order) => (
              <article key={order.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{order.order_number}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Ordered {formatDate(order.ordered_date)}{order.doctor_name ? ` | ${order.doctor_name}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">
                    {order.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {order.items.map((item) => (
                    <span key={item.id} className="rounded-full bg-white px-3 py-1 text-xs text-gray-700 ring-1 ring-gray-200">
                      {item.test_name}
                    </span>
                  ))}
                </div>
                {order.notes && <p className="mt-3 text-sm leading-6 text-gray-700">{order.notes}</p>}
                <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
                  <span>Due {formatDate(order.due_date)}</span>
                  <span>{order.report_file_url ? "Report attached" : "Report pending"}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="billing" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8 scroll-mt-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Billing</p>
            <h2 className="mt-2 text-xl text-gray-900">Invoice History</h2>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            No billing records found for this patient yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {invoices.slice(0, 6).map((invoice) => (
              <article key={invoice.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{invoice.invoice_number}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Issued {formatDate(invoice.issue_date)} | {invoice.status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">
                    {formatCurrency(invoice.balance_amount)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>Total {formatCurrency(invoice.total_amount)}</span>
                  <span>Balance {formatCurrency(invoice.balance_amount)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="attachments" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8 scroll-mt-24">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Reports & Notes</p>
            <h2 className="mt-2 text-xl text-gray-900">Uploaded Files</h2>
            <p className="mt-2 text-sm text-gray-600">
              Photos and documents attached to this patient&apos;s medical records.
            </p>
          </div>
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
              const contentType = preview?.contentType || inferContentType(record.file_url);
              const isImage = isImageContentType(contentType);
              const isPdf = contentType.includes("pdf");

              return (
                <article key={record.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="relative aspect-[4/3] bg-gray-100">
                    {previewUrl && isImage ? (
                      <img
                        src={previewUrl}
                        alt={record.record_type || "Medical record attachment"}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : previewUrl && isPdf ? (
                      <iframe
                        src={previewUrl}
                        title={record.record_type || "Medical record attachment"}
                        className="h-full w-full border-0 bg-white"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-stone-50 via-white to-emerald-50 px-4 text-center">
                        <div className="rounded-2xl bg-white p-3 text-emerald-600 shadow-sm ring-1 ring-gray-200">
                          <FileText className="h-8 w-8" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{record.record_type || "Document"}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-500">
                            {isPdf ? "PDF file" : "Attachment"}
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
                      <button
                        type="button"
                        onClick={() => void handleOpenAttachment(record)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        title="Open attachment"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadAttachment(record)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        title="Download attachment"
                      >
                        <Download className="h-4 w-4" />
                      </button>
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
