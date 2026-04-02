"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canDeleteMedicalRecords, isFullAccessRole } from "@/lib/roles";
import { Doctor, MedicalRecord, Patient } from "@/types/api";

type MedicalRecordsResponse = {
  success: boolean;
  data: {
    items: MedicalRecord[];
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
  fileUrl: string | null;
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

export default function MedicalRecordsPage() {
  const searchParams = useSearchParams();
  const patientFilterId = searchParams.get("patientId") || "";
  const medicalRecordStatuses = ["completed", "pending review", "in progress"] as const;
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
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MedicalRecord | null>(null);
  const [currentRole, setCurrentRole] = useState("");
  const [form, setForm] = useState(initialForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const patientsMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient.full_name])),
    [patients]
  );
  const doctorsMap = useMemo(
    () => new Map(doctors.map((doctor) => [doctor.id, doctor.full_name])),
    [doctors]
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
    notes: form.notes.trim() || null,
    fileUrl: form.fileUrl.trim() || null
  });

  const resetForm = () => {
    setForm({
      ...initialForm,
      patientId: patientFilterId
    });
    setEditingRecordId(null);
    setSelectedFile(null);
  };

  const resolveAttachmentUrl = (fileUrl: string) => {
    if (/^https?:\/\//i.test(fileUrl)) {
      return fileUrl;
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1";
    return `${apiBaseUrl.replace(/\/api\/v1\/?$/, "")}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;
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

  const loadRecords = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (patientFilterId) {
      params.set("patientId", patientFilterId);
    }

    apiRequest<MedicalRecordsResponse>(`/medical-records?${params.toString()}`, { authenticated: true })
      .then((recordsRes) => {
        setRecords(recordsRes.data.items || []);
      })
      .catch((err: Error) => setError(err.message || "Failed to load medical records"))
      .finally(() => setLoading(false));
  }, [patientFilterId]);

  const loadMetadata = () => {
    Promise.all([
      apiRequest<DoctorsResponse>("/doctors?limit=100", { authenticated: true }),
      apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true }),
      apiRequest<MeResponse>("/auth/me", { authenticated: true })
    ])
      .then(([doctorsRes, patientsRes, meRes]) => {
        setDoctors(doctorsRes.data.items || []);
        setPatients(patientsRes.data.items || []);
        setCurrentRole(meRes.data.role || "");
      })
      .catch((err: Error) => setError(err.message || "Failed to load form options"));
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === patientFilterId) || null,
    [patientFilterId, patients]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
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
        await apiRequest(`/medical-records/${editingRecordId}`, {
          method: "PATCH",
          authenticated: true,
          body: payload
        });
      } else {
        await apiRequest("/medical-records", {
          method: "POST",
          authenticated: true,
          body: payload
        });
      }

      setShowFormModal(false);
      resetForm();
      loadRecords();
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
      loadRecords();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete medical record";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (record: MedicalRecord) => {
    if (record.file_url) {
      window.open(resolveAttachmentUrl(record.file_url), "_blank", "noopener,noreferrer");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-gray-900">Medical records</h1>
          <p className="text-gray-600 mt-1">Access and manage patient medical records</p>
        </div>
        {(isFullAccessRole(currentRole) || currentRole === "doctor") && (
          <button
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div data-tour-id="tour-records-list" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
              {loading && (
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
                        onClick={() => handleDownload(record)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
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
      </div>

      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg text-gray-900">{editingRecordId ? "Edit Medical Record" : "Add Medical Record"}</h2>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Patient</label>
              <select
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
                rows={2}
                value={form.symptoms}
                onChange={(e) => setForm({ ...form, symptoms: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Diagnosis</label>
              <textarea
                rows={2}
                value={form.diagnosis}
                onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Prescription</label>
              <textarea
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
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              {selectedFile ? (
                <p className="mt-2 text-xs text-emerald-700">Selected: {selectedFile.name}</p>
              ) : form.fileUrl ? (
                <a
                  href={resolveAttachmentUrl(form.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs text-emerald-700 hover:underline"
                >
                  Open current attachment
                </a>
              ) : (
                <p className="mt-2 text-xs text-gray-500">Accepted: JPG, PNG, WEBP, GIF, PDF up to 5MB.</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
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
              <p className="sm:col-span-2"><span className="text-gray-500">Symptoms:</span> {selectedRecord.symptoms || "-"}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Diagnosis:</span> {selectedRecord.diagnosis || "-"}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Prescription:</span> {selectedRecord.prescription || "-"}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Notes:</span> {selectedRecord.notes || "-"}</p>
              <p className="sm:col-span-2">
                <span className="text-gray-500">File URL:</span>{" "}
                {selectedRecord.file_url ? (
                  <a
                    href={resolveAttachmentUrl(selectedRecord.file_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 hover:underline"
                  >
                    Open attachment
                  </a>
                ) : (
                  "-"
                )}
              </p>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setSelectedRecord(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
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

