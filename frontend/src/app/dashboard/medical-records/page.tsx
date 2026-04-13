"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Pencil, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { apiFetch, apiRequest } from "@/lib/api";
import {
  canAccessMedicalRecords,
  canDeleteMedicalRecords,
  canUseAiPrescription,
  isFullAccessRole
} from "@/lib/roles";
import { AiPrescriptionSuggestion, Doctor, MedicalRecord, Patient } from "@/types/api";
import NumberedPagination from "@/app/components/NumberedPagination";
import ModalCloseButton from "@/app/components/ModalCloseButton";

type MedicalRecordsResponse = {
  success: boolean;
  data: {
    items: MedicalRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type DoctorsResponse = {
  success: boolean;
  data: {
    items: Doctor[];
  };
};

type PatientsResponse = {
  success: boolean;
  data: {
    items: Patient[];
  };
};

type PatientResponse = {
  success: boolean;
  data: Patient;
};

type MedicalRecordPayload = {
  patientId: string;
  doctorId: string;
  appointmentId?: string | null;
  recordType: string;
  status: string;
  recordDate: string;
  symptoms: string | null;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
};

type UploadAttachmentResponse = {
  success: boolean;
  data: {
    fileUrl: string;
    fileName: string;
    contentType: string;
    size: number;
  };
};

type MedicalRecordMutationResponse = {
  success: boolean;
  data: MedicalRecord;
};

type AiPrescriptionSuggestionsResponse = {
  success: boolean;
  data: {
    items: AiPrescriptionSuggestion[];
  };
};

type AiPrescriptionSuggestionMutationResponse = {
  success: boolean;
  data: AiPrescriptionSuggestion;
};

type FollowUpReminderResponse = {
  success: boolean;
  data: {
    record: MedicalRecord;
  };
};

const initialForm = {
  patientId: "",
  doctorId: "",
  appointmentId: "",
  recordType: "",
  status: "completed",
  recordDate: "",
  symptoms: "",
  diagnosis: "",
  prescription: "",
  notes: "",
  fileUrl: ""
};

type MeResponse = {
  success: boolean;
  data: {
    role: string;
  };
};

type MedicalRecordAttachment = {
  blob: Blob | null;
  externalUrl: string | null;
  fileName: string;
};

export default function MedicalRecordsPage() {
  const searchParams = useSearchParams();
  const patientFilterId = searchParams.get("patientId") || "";
  const initialQuery = searchParams.get("q") || "";
  const medicalRecordStatuses = ["completed", "pending review", "in progress"] as const;
  const PAGE_SIZE = 8;
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFormModal, setShowFormModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MedicalRecord | null>(null);
  const [currentRole, setCurrentRole] = useState("");
  const [form, setForm] = useState(initialForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AiPrescriptionSuggestion[]>([]);
  const [aiSuggestionError, setAiSuggestionError] = useState("");
  const [isGeneratingAiSuggestion, setIsGeneratingAiSuggestion] = useState(false);
  const [reviewingAiSuggestionId, setReviewingAiSuggestionId] = useState<string | null>(null);
  const [showAllAiSuggestions, setShowAllAiSuggestions] = useState(false);
  const [search, setSearch] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const patientsMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient.full_name])),
    [patients]
  );
  const doctorsMap = useMemo(
    () => new Map(doctors.map((doctor) => [doctor.id, doctor.full_name])),
    [doctors]
  );
  const visibleAiSuggestions = showAllAiSuggestions ? aiSuggestions : aiSuggestions.slice(0, PAGE_SIZE);
  const isInitialLoading = loading && records.length === 0;
  const isRefreshing = loading && records.length > 0;

  const sortRecords = useCallback(
    (items: MedicalRecord[]) =>
      [...items].sort((left, right) => {
        const dateDiff = (right.record_date || "").localeCompare(left.record_date || "");
        if (dateDiff !== 0) {
          return dateDiff;
        }

        return (right.created_at || "").localeCompare(left.created_at || "");
      }),
    []
  );

  const buildPayload = (): MedicalRecordPayload => ({
    patientId: form.patientId,
    doctorId: form.doctorId,
    recordType: form.recordType.trim(),
    status: form.status,
    recordDate: form.recordDate,
    symptoms: form.symptoms.trim() || null,
    diagnosis: form.diagnosis.trim() || null,
    prescription: form.prescription.trim() || null,
    notes: form.notes.trim() || null
  });

  const resetForm = () => {
    setForm({
      ...initialForm,
      patientId: patientFilterId
    });
    setEditingRecordId(null);
    setSelectedFile(null);
    setAiSuggestions([]);
    setAiSuggestionError("");
  };

  const getAttachmentFallbackFileName = (recordId: string, fileUrl?: string | null) => {
    const storedFileName = fileUrl?.split("/").pop();
    if (storedFileName) {
      return storedFileName.replace(/^\d{13}-[0-9a-f-]{36}-/i, "");
    }

    return `medical-record-${recordId}.pdf`;
  };

  const extractFileNameFromDisposition = (headerValue: string | null, fallbackFileName: string) => {
    if (!headerValue) {
      return fallbackFileName;
    }

    const match = headerValue.match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallbackFileName;
  };

  const fileToBase64 = (file: File) =>
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
    });

  const fetchAttachment = async (recordId: string, fileUrl?: string | null): Promise<MedicalRecordAttachment> => {
    if (fileUrl && /^https?:\/\//i.test(fileUrl)) {
      return {
        blob: null,
        externalUrl: fileUrl,
        fileName: getAttachmentFallbackFileName(recordId, fileUrl)
      };
    }

    const response = await apiFetch(`/medical-records/${recordId}/attachment`, {
      method: "GET",
      authenticated: true,
      cache: "no-store"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || "Failed to load attachment");
    }

    const fallbackFileName = getAttachmentFallbackFileName(recordId, fileUrl);

    return {
      blob: await response.blob(),
      externalUrl: null,
      fileName: extractFileNameFromDisposition(
        response.headers.get("content-disposition"),
        fallbackFileName
      )
    };
  };

  const loadRecords = useCallback((currentPage: number, currentQuery: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", String(PAGE_SIZE));
    if (currentQuery.trim()) {
      params.set("q", currentQuery.trim());
    }
    if (patientFilterId) {
      params.set("patientId", patientFilterId);
    }

    apiRequest<MedicalRecordsResponse>(`/medical-records?${params.toString()}`, { authenticated: true })
      .then((recordsRes) => {
        setRecords(sortRecords(recordsRes.data.items || []));
        setPage(recordsRes.data.pagination?.page || currentPage);
        setTotalPages(recordsRes.data.pagination?.totalPages || 1);
        setTotalRecords(recordsRes.data.pagination?.total || 0);
      })
      .catch((err: Error) => setError(err.message || "Failed to load medical records"))
      .finally(() => setLoading(false));
  }, [PAGE_SIZE, patientFilterId, sortRecords]);

  const loadMetadata = () => {
    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then((meRes) => {
        setCurrentRole(meRes.data.role || "");
      })
      .catch((err: Error) => setError(err.message || "Failed to load form options"));
  };

  const loadFormOptions = useCallback(async () => {
    const [doctorsResult, patientsResult] = await Promise.allSettled([
      apiRequest<DoctorsResponse>("/doctors?limit=100", { authenticated: true }),
      patientFilterId
        ? apiRequest<PatientResponse>(`/patients/${patientFilterId}`, { authenticated: true })
        : apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true })
    ]);

    if (doctorsResult.status === "fulfilled") {
      setDoctors(doctorsResult.value.data.items || []);
    }

    if (patientsResult.status === "fulfilled") {
      if (patientFilterId) {
        const patient = patientsResult.value.data as Patient;
        setPatients((current) => {
          if (current.some((item) => item.id === patient.id)) {
            return current;
          }

          return [patient, ...current];
        });
      } else {
        const patientList = patientsResult.value.data as PatientsResponse["data"];
        setPatients(patientList.items || []);
      }
    }

    if (doctorsResult.status === "rejected" && patientsResult.status === "rejected") {
      const reason = doctorsResult.reason instanceof Error ? doctorsResult.reason : patientsResult.reason;
      setError(reason instanceof Error ? reason.message : "Failed to load form options");
    }
  }, [patientFilterId]);

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    setSearch(initialQuery);
    setQuery(initialQuery);
    loadRecords(1, initialQuery);
  }, [initialQuery, loadRecords]);

  useEffect(() => {
    if (!showFormModal) {
      return;
    }

    void loadFormOptions();
  }, [loadFormOptions, showFormModal]);

  useEffect(() => {
    if (search === query) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
      loadRecords(1, search);
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [search, query, loadRecords]);

  useEffect(() => {
    if (!showFormModal || !canUseAiPrescription(currentRole)) {
      setAiSuggestions([]);
      setAiSuggestionError("");
      return;
    }

    const params = new URLSearchParams();
    params.set("limit", "5");

    if (editingRecordId) {
      params.set("medicalRecordId", editingRecordId);
    } else if (form.patientId) {
      params.set("patientId", form.patientId);
    } else {
      setAiSuggestions([]);
      setAiSuggestionError("");
      return;
    }

    if (form.doctorId) {
      params.set("doctorId", form.doctorId);
    }

    apiRequest<AiPrescriptionSuggestionsResponse>(`/ai/prescription-suggestions?${params.toString()}`, {
      authenticated: true
    })
      .then((response) => {
        setAiSuggestions(response.data.items || []);
        setAiSuggestionError("");
      })
      .catch((err: Error) => {
        setAiSuggestions([]);
        setAiSuggestionError(err.message || "Failed to load AI prescription suggestions");
      });
  }, [currentRole, editingRecordId, form.doctorId, form.patientId, showFormModal]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === patientFilterId) || null,
    [patientFilterId, patients]
  );

  if (currentRole && !canAccessMedicalRecords(currentRole)) {
    return <p className="text-red-600">You do not have access to medical records.</p>;
  }

  const canGenerateAiPrescription = canUseAiPrescription(currentRole);

  const mergePrescriptionText = (current: string, next: string) => {
    const currentValue = current.trim();
    const nextValue = next.trim();

    if (!nextValue) {
      return currentValue;
    }

    if (!currentValue) {
      return nextValue;
    }

    if (currentValue.includes(nextValue)) {
      return currentValue;
    }

    return `${currentValue}\n\n${nextValue}`.trim();
  };

  const syncAcceptedSuggestionsToMedicalRecord = async (medicalRecordId: string) => {
    const acceptedSuggestions = aiSuggestions.filter((item) => item.status === "accepted" && !item.medical_record_id);
    if (acceptedSuggestions.length === 0) {
      return;
    }

    try {
      const responses = await Promise.all(
        acceptedSuggestions.map((item) =>
          apiRequest<AiPrescriptionSuggestionMutationResponse>(`/ai/prescription-suggestions/${item.id}/review`, {
            method: "PATCH",
            authenticated: true,
            body: {
              status: "accepted",
              medicalRecordId,
              appointmentId: form.appointmentId || undefined
            }
          })
        )
      );

      setAiSuggestions((current) =>
        current.map((item) => responses.find((entry) => entry.data.id === item.id)?.data || item)
      );
    } catch {
      // Best-effort linkage only.
    }
  };

  const generateAiPrescriptionSuggestion = async () => {
    setIsGeneratingAiSuggestion(true);
    setAiSuggestionError("");

    try {
      const response = await apiRequest<AiPrescriptionSuggestionMutationResponse>("/ai/prescription-suggestions/generate", {
        method: "POST",
        authenticated: true,
        body: {
          patientId: form.patientId || undefined,
          doctorId: form.doctorId || undefined,
          appointmentId: form.appointmentId || undefined,
          medicalRecordId: editingRecordId || undefined,
          symptoms: form.symptoms.trim() || undefined,
          diagnosis: form.diagnosis.trim() || undefined,
          notes: form.notes.trim() || undefined
        }
      });

      setAiSuggestions((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate AI prescription suggestion";
      setAiSuggestionError(message);
    } finally {
      setIsGeneratingAiSuggestion(false);
    }
  };

  const reviewAiPrescriptionSuggestion = async (
    suggestion: AiPrescriptionSuggestion,
    status: "accepted" | "rejected"
  ) => {
    setReviewingAiSuggestionId(suggestion.id);
    setAiSuggestionError("");

    try {
      const response = await apiRequest<AiPrescriptionSuggestionMutationResponse>(
        `/ai/prescription-suggestions/${suggestion.id}/review`,
        {
          method: "PATCH",
          authenticated: true,
          body: {
            status,
            appointmentId: form.appointmentId || undefined,
            medicalRecordId: editingRecordId || undefined,
            reviewNote:
              status === "accepted"
                ? "Applied in medical-record review"
                : "Rejected during medical-record review"
          }
        }
      );

      setAiSuggestions((current) =>
        current.map((item) => (item.id === suggestion.id ? response.data : item))
      );

      if (status === "accepted" && response.data.prescription_text) {
        setForm((current) => ({
          ...current,
          prescription: mergePrescriptionText(current.prescription, response.data.prescription_text || "")
        }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to review AI prescription suggestion";
      setAiSuggestionError(message);
    } finally {
      setReviewingAiSuggestionId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      let savedRecord: MedicalRecord | null = null;
      let fileUrl = form.fileUrl.trim() || null;
      if (selectedFile) {
        const dataBase64 = await fileToBase64(selectedFile);
        const uploadResponse = await apiRequest<UploadAttachmentResponse>("/medical-records/upload", {
          method: "POST",
          authenticated: true,
          body: {
            fileName: selectedFile.name,
            contentType: selectedFile.type,
            dataBase64
          }
        });
        fileUrl = uploadResponse.data.fileUrl;
      }

      const payload = {
        ...buildPayload(),
        fileUrl
      };
      if (editingRecordId) {
        const response = await apiRequest<MedicalRecordMutationResponse>(`/medical-records/${editingRecordId}`, {
          method: "PATCH",
          authenticated: true,
          body: payload
        });
        savedRecord = response.data;
        setRecords((current) =>
          sortRecords(current.map((record) => (record.id === editingRecordId ? response.data : record)))
        );
        setSelectedRecord((current) => (current?.id === editingRecordId ? response.data : current));
      } else {
        const response = await apiRequest<MedicalRecordMutationResponse>("/medical-records", {
          method: "POST",
          authenticated: true,
          body: payload
        });
        savedRecord = response.data;
        setRecords((current) => sortRecords([response.data, ...current.filter((record) => record.id !== response.data.id)]));
      }

      if (savedRecord?.id) {
        await syncAcceptedSuggestionsToMedicalRecord(savedRecord.id);
      }

      setShowFormModal(false);
      resetForm();
      void loadRecords(page, query);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save medical record";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const escapePdfText = (text: string) =>
    text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const createSimplePdfBlob = (title: string, lines: string[]) => {
    const fontSize = 12;
    const lineHeight = 16;
    const startY = 800;
    const textCommands = [`BT /F1 ${fontSize} Tf 40 ${startY} Td (${escapePdfText(title)}) Tj ET`];

    lines.forEach((line, index) => {
      const y = startY - (index + 2) * lineHeight;
      textCommands.push(`BT /F1 ${fontSize} Tf 40 ${y} Td (${escapePdfText(line)}) Tj ET`);
    });

    const stream = textCommands.join("\n");
    const streamLength = stream.length;
    const objects = [
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
      "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
      `5 0 obj << /Length ${streamLength} >> stream\n${stream}\nendstream endobj`
    ];

    let offset = "%PDF-1.4\n".length;
    const xrefOffsets = ["0000000000 65535 f "];
    const bodyParts = objects.map((obj) => {
      const entry = `${String(offset).padStart(10, "0")} 00000 n `;
      xrefOffsets.push(entry);
      offset += `${obj}\n`.length;
      return `${obj}\n`;
    });

    const xrefStart = offset;
    const xref = `xref\n0 ${xrefOffsets.length}\n${xrefOffsets.join("\n")}\n`;
    const trailer = `trailer << /Size ${xrefOffsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    const pdfContent = `%PDF-1.4\n${bodyParts.join("")}${xref}${trailer}`;

    return new Blob([pdfContent], { type: "application/pdf" });
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const openAttachment = async (recordId: string, fileUrl?: string | null) => {
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      throw new Error("Allow pop-ups to preview this attachment");
    }

    try {
      const attachment = await fetchAttachment(recordId, fileUrl);

      if (attachment.externalUrl) {
        previewWindow.location.href = attachment.externalUrl;
        return;
      }

      if (!attachment.blob) {
        throw new Error("Attachment preview is unavailable");
      }

      const url = URL.createObjectURL(attachment.blob);
      previewWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      previewWindow.close();
      throw error;
    }
  };

  const downloadAttachment = async (recordId: string, fileUrl?: string | null) => {
    const attachment = await fetchAttachment(recordId, fileUrl);

    if (attachment.externalUrl) {
      window.open(attachment.externalUrl, "_blank");
      return;
    }

    if (!attachment.blob) {
      throw new Error("Attachment download is unavailable");
    }

    triggerBlobDownload(attachment.blob, attachment.fileName);
  };

  const handleView = async (record: MedicalRecord) => {
    setError("");
    setSelectedRecord(record);
    setShowViewModal(true);

    try {
      const response = await apiRequest<{ success: boolean; data: MedicalRecord }>(`/medical-records/${record.id}`, {
        authenticated: true
      });
      setSelectedRecord(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load latest record details";
      setError(`${message}. Showing available record data.`);
    }
  };

  const handleEdit = (record: MedicalRecord) => {
    setEditingRecordId(record.id);
    setForm({
      patientId: record.patient_id,
      doctorId: record.doctor_id,
      appointmentId: record.appointment_id || "",
      recordType: record.record_type || "",
      status: record.status || "completed",
      recordDate: record.record_date || "",
      symptoms: record.symptoms || "",
      diagnosis: record.diagnosis || "",
      prescription: record.prescription || "",
      notes: record.notes || "",
      fileUrl: record.file_url || ""
    });
    setSelectedFile(null);
    setShowFormModal(true);
  };

  const handleDelete = async (record: MedicalRecord) => {
    setDeletingId(record.id);
    setError("");
    try {
      await apiRequest(`/medical-records/${record.id}`, {
        method: "DELETE",
        authenticated: true
      });
      setDeleteTarget(null);
      void loadRecords(page, query);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete medical record";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (record: MedicalRecord) => {
    if (record.file_url) {
      try {
        await downloadAttachment(record.id, record.file_url);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to download attachment";
        setError(message);
      }
      return;
    }

    const pdfBlob = createSimplePdfBlob("Medical Record Summary", [
      `Record ID: ${record.id}`,
      `Patient: ${record.patient_name}`,
      `Doctor: ${record.doctor_name}`,
      `Type: ${record.record_type}`,
      `Status: ${record.status}`,
      `Date: ${record.record_date}`,
      `Notes: ${record.notes || "-"}`
    ]);
    triggerBlobDownload(pdfBlob, `medical-record-${record.id}.pdf`);
  };

  const handleStatusChange = async (recordId: string, status: string) => {
    setUpdatingStatusId(recordId);
    setError("");

    try {
      await apiRequest(`/medical-records/${recordId}`, {
        method: "PATCH",
        authenticated: true,
        body: { status }
      });

      setRecords((previous) =>
        previous.map((record) => (record.id === recordId ? { ...record, status } : record))
      );
      setSelectedRecord((current) => (current && current.id === recordId ? { ...current, status } : current));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      setError(message);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSendReminder = async (record: MedicalRecord) => {
    setSendingReminderId(record.id);
    setError("");

    try {
      const response = await apiRequest<FollowUpReminderResponse>(`/medical-records/${record.id}/send-follow-up-reminder`, {
        method: "POST",
        authenticated: true,
        body: {}
      });

      setRecords((current) =>
        sortRecords(current.map((item) => (item.id === record.id ? response.data.record : item)))
      );
      setSelectedRecord((current) => (current?.id === record.id ? response.data.record : current));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send reminder";
      setError(message);
    } finally {
      setSendingReminderId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-gray-900">Medical records</h1>
          <p className="text-gray-600 mt-1">Access and manage patient medical records</p>
        </div>
        {(isFullAccessRole(currentRole) || currentRole === "doctor") && (
          <button
            data-testid="add-medical-record-button"
            onClick={() => {
              resetForm();
              setShowFormModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" />
            Add Record
          </button>
        )}
      </div>

      {patientFilterId && (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Patient Filter</p>
            <p className="mt-1 text-sm text-emerald-900">
              Showing records for {selectedPatient?.full_name || "the selected patient"}.
            </p>
          </div>
          <Link
            href="/dashboard/medical-records"
            className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100"
          >
            Clear Filter
          </Link>
        </div>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="space-y-2">
          <span className="text-sm text-gray-700">Search</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by patient, record type, or doctor"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
          />
        </label>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div data-tour-id="tour-records-list" className="relative bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Patient Name</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Record Type</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Doctor</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Date</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Status</th>
                <th className="text-left text-sm text-gray-600 px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isInitialLoading && (
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-500" colSpan={6}>
                    Loading medical records...
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td className="px-6 py-4 text-sm text-gray-500" colSpan={6}>
                    No records found.
                  </td>
                </tr>
              )}
              {records.map((record) => (
                <tr key={record.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center text-white">
                        {record.patient_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="text-gray-900">{record.patient_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-900">{record.record_type}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{record.doctor_name}</td>
                  <td className="px-6 py-4 text-gray-600">{record.record_date}</td>
                  <td className="px-6 py-4">
                    <select
                      value={record.status}
                      onChange={(e) => handleStatusChange(record.id, e.target.value)}
                      disabled={updatingStatusId === record.id}
                      className="px-2 py-1 text-xs rounded-lg border border-gray-300 bg-white text-gray-700 disabled:opacity-60"
                    >
                      {medicalRecordStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleView(record)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleDownload(record)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {record.follow_up_date && (
                        <button
                          onClick={() => void handleSendReminder(record)}
                          disabled={sendingReminderId === record.id}
                          className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 disabled:opacity-60"
                          title="Send Reminder"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                      {(isFullAccessRole(currentRole) || currentRole === "doctor") && (
                        <button
                          onClick={() => handleEdit(record)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {canDeleteMedicalRecords(currentRole) && (
                        <button
                          onClick={() => setDeleteTarget(record)}
                          disabled={deletingId === record.id}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-60"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isRefreshing && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center border-b border-gray-200 bg-white/70 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
              Loading next page...
            </div>
          </div>
        )}
        <div className="border-t border-gray-200 px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-gray-600">Total records: {totalRecords}</p>
          <NumberedPagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(nextPage) => loadRecords(nextPage, query)}
            className="justify-start lg:justify-end"
            disabled={loading}
          />
        </div>
      </div>

      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto p-4">
          <form data-testid="medical-record-form-modal" onSubmit={handleSubmit} className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg text-gray-900">{editingRecordId ? "Edit Medical Record" : "Add Medical Record"}</h2>
              <ModalCloseButton
                onClick={() => {
                  setShowFormModal(false);
                  resetForm();
                }}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Patient</label>
              <select
                data-testid="medical-record-patient-select"
                value={form.patientId}
                onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
              <label className="block text-sm text-gray-700 mb-2">Doctor</label>
              <select
                data-testid="medical-record-doctor-select"
                value={form.doctorId}
                onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Record Type</label>
              <input
                data-testid="medical-record-type-input"
                type="text"
                value={form.recordType}
                onChange={(e) => setForm({ ...form, recordType: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Symptoms</label>
              <textarea
                data-testid="medical-record-symptoms-input"
                rows={2}
                value={form.symptoms}
                onChange={(e) => setForm({ ...form, symptoms: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Diagnosis</label>
              <textarea
                data-testid="medical-record-diagnosis-input"
                rows={2}
                value={form.diagnosis}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {canGenerateAiPrescription && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm font-medium text-violet-900">
                      <Sparkles className="h-4 w-4" />
                      AI Prescription Suggestions
                    </p>
                    <p className="mt-1 text-sm text-violet-800">
                      Generate a conservative draft from the current symptoms and diagnosis. A doctor must review it before use.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generateAiPrescriptionSuggestion()}
                    disabled={
                      isGeneratingAiSuggestion ||
                      !form.patientId ||
                      !form.doctorId ||
                      (!form.symptoms.trim() && !form.diagnosis.trim())
                    }
                    className="rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGeneratingAiSuggestion ? "Generating..." : "Generate Suggestion"}
                  </button>
                </div>

                {aiSuggestionError && <p className="mt-3 text-sm text-red-600">{aiSuggestionError}</p>}

                {aiSuggestions.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-violet-200 bg-white px-4 py-3 text-sm text-violet-700">
                    No AI prescription drafts yet for this record.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {visibleAiSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className="rounded-xl border border-violet-200 bg-white p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                                suggestion.status === "accepted"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : suggestion.status === "rejected"
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-violet-100 text-violet-800"
                              }`}
                            >
                              {suggestion.status}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-700">
                              {suggestion.confidence} confidence
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {suggestion.created_at ? new Date(suggestion.created_at).toLocaleString() : "Draft"}
                          </p>
                        </div>

                        {suggestion.clinical_summary && (
                          <p className="mt-3 text-sm text-gray-700">{suggestion.clinical_summary}</p>
                        )}

                        {suggestion.prescription_text && (
                          <div className="mt-3 rounded-xl bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950 whitespace-pre-wrap">
                            {suggestion.prescription_text}
                          </div>
                        )}

                        {suggestion.guardrails.length > 0 && (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.14em] text-amber-700">Guardrails</p>
                            <ul className="mt-2 space-y-1 text-sm text-amber-900">
                              {suggestion.guardrails.map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {suggestion.red_flags.length > 0 && (
                          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.14em] text-rose-700">Red Flags</p>
                            <ul className="mt-2 space-y-1 text-sm text-rose-900">
                              {suggestion.red_flags.map((item) => (
                                <li key={item}>- {item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <p className="mt-3 text-xs text-gray-500">{suggestion.disclaimer}</p>

                        {suggestion.status === "generated" ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void reviewAiPrescriptionSuggestion(suggestion, "accepted")}
                              disabled={reviewingAiSuggestionId === suggestion.id}
                              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {reviewingAiSuggestionId === suggestion.id ? "Saving..." : "Apply Suggestion"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void reviewAiPrescriptionSuggestion(suggestion, "rejected")}
                              disabled={reviewingAiSuggestionId === suggestion.id}
                              className="rounded-lg border border-rose-300 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              Reject Draft
                            </button>
                          </div>
                        ) : (
                          <p className="mt-4 text-xs text-gray-500">
                            Reviewed {suggestion.reviewed_at ? new Date(suggestion.reviewed_at).toLocaleString() : "recently"}
                            {suggestion.reviewed_by_name ? ` by ${suggestion.reviewed_by_name}` : ""}.
                          </p>
                        )}
                      </div>
                    ))}
                    {aiSuggestions.length > PAGE_SIZE && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAllAiSuggestions((current) => !current)}
                          className="rounded-lg border border-violet-200 px-4 py-2 text-sm text-violet-700 hover:bg-violet-50"
                        >
                          {showAllAiSuggestions ? "Show less" : "Show more"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-700 mb-2">Prescription</label>
              <textarea
                data-testid="medical-record-prescription-input"
                rows={2}
                value={form.prescription}
                onChange={(e) => setForm({ ...form, prescription: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Status</label>
                <select
                  data-testid="medical-record-status-select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="completed">Completed</option>
                  <option value="pending review">Pending Review</option>
                  <option value="in progress">In Progress</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Record Date</label>
                <input
                  data-testid="medical-record-date-input"
                  type="date"
                  value={form.recordDate}
                  onChange={(e) => setForm({ ...form, recordDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Attachment (photo or PDF)</label>
              <input
                data-testid="medical-record-file-input"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              {selectedFile ? (
                <p className="mt-2 text-xs text-emerald-700">Selected: {selectedFile.name}</p>
              ) : form.fileUrl && editingRecordId ? (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    void openAttachment(editingRecordId, form.fileUrl).catch((err) => {
                      const message = err instanceof Error ? err.message : "Failed to open attachment";
                      setError(message);
                    });
                  }}
                  className="mt-2 inline-block text-xs text-emerald-700 hover:underline"
                >
                  Open current attachment
                </button>
              ) : (
                <p className="mt-2 text-xs text-gray-500">Accepted: JPG, PNG, WEBP, GIF, PDF up to 5MB.</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Notes</label>
              <textarea
                data-testid="medical-record-notes-input"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                data-testid="medical-record-cancel-button"
                type="button"
                onClick={() => {
                  setShowFormModal(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                data-testid="medical-record-submit-button"
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : editingRecordId ? "Update Record" : "Save Record"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showViewModal && selectedRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl text-gray-900">Medical Record Details</h2>
              <p className="text-sm text-gray-600 mt-1">{selectedRecord.record_type}</p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <p><span className="text-gray-500">Patient:</span> {patientsMap.get(selectedRecord.patient_id) || selectedRecord.patient_name}</p>
              <p><span className="text-gray-500">Doctor:</span> {doctorsMap.get(selectedRecord.doctor_id) || selectedRecord.doctor_name}</p>
              <p><span className="text-gray-500">Status:</span> {selectedRecord.status}</p>
              <p><span className="text-gray-500">Date:</span> {selectedRecord.record_date}</p>
              <p><span className="text-gray-500">Follow-up Date:</span> {selectedRecord.follow_up_date || "-"}</p>
              <p><span className="text-gray-500">Reminder Status:</span> {selectedRecord.follow_up_reminder_status || "pending"}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Symptoms:</span> {selectedRecord.symptoms || "-"}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Diagnosis:</span> {selectedRecord.diagnosis || "-"}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Prescription:</span> {selectedRecord.prescription || "-"}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Notes:</span> {selectedRecord.notes || "-"}</p>
              <p className="sm:col-span-2">
                <span className="text-gray-500">Attachment:</span>{" "}
                {selectedRecord.file_url ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      void openAttachment(selectedRecord.id, selectedRecord.file_url).catch((err) => {
                        const message = err instanceof Error ? err.message : "Failed to open attachment";
                        setError(message);
                      });
                    }}
                    className="text-emerald-700 hover:underline"
                  >
                    Open attachment
                  </button>
                ) : (
                  "-"
                )}
              </p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              {selectedRecord.follow_up_date && (
                <button
                  type="button"
                  onClick={() => void handleSendReminder(selectedRecord)}
                  disabled={sendingReminderId === selectedRecord.id}
                  className="px-4 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 disabled:opacity-60"
                >
                  {sendingReminderId === selectedRecord.id ? "Sending..." : "Send Reminder"}
                </button>
              )}
              <ModalCloseButton
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedRecord(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl text-gray-900">Delete Medical Record</h2>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-700">
                Delete record <span className="font-medium text-gray-900">&quot;{deleteTarget.record_type}&quot;</span> for{" "}
                <span className="font-medium text-gray-900">{deleteTarget.patient_name}</span>?
              </p>
              <p className="text-sm text-red-600">This will permanently remove the medical record.</p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(deleteTarget)}
                disabled={deletingId === deleteTarget.id}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {deletingId === deleteTarget.id ? "Deleting..." : "Delete Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

