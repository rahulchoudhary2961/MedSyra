"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
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
  recordType: string;
  status: string;
  recordDate: string;
  notes: string | null;
  fileUrl: string | null;
};

const initialForm = {
  patientId: "",
  doctorId: "",
  recordType: "",
  status: "completed",
  recordDate: "",
  notes: "",
  fileUrl: ""
};

export default function MedicalRecordsPage() {
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
  const [form, setForm] = useState(initialForm);

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
    notes: form.notes.trim() || null,
    fileUrl: form.fileUrl.trim() || null
  });

  const resetForm = () => {
    setForm(initialForm);
    setEditingRecordId(null);
  };

  const loadRecords = () => {
    setLoading(true);
    apiRequest<MedicalRecordsResponse>("/medical-records?limit=100", { authenticated: true })
      .then((recordsRes) => {
        setRecords(recordsRes.data.items || []);
      })
      .catch((err: Error) => setError(err.message || "Failed to load medical records"))
      .finally(() => setLoading(false));
  };

  const loadMetadata = () => {
    Promise.all([
      apiRequest<DoctorsResponse>("/doctors?limit=200", { authenticated: true }),
      apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true })
    ])
      .then(([doctorsRes, patientsRes]) => {
        setDoctors(doctorsRes.data.items || []);
        setPatients(patientsRes.data.items || []);
      })
      .catch((err: Error) => setError(err.message || "Failed to load form options"));
  };

  useEffect(() => {
    loadMetadata();
    loadRecords();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const payload = buildPayload();
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
      recordType: record.record_type || "",
      status: record.status || "completed",
      recordDate: record.record_date || "",
      notes: record.notes || "",
      fileUrl: record.file_url || ""
    });
    setShowFormModal(true);
  };

  const handleDelete = async (record: MedicalRecord) => {
    const confirmed = window.confirm(`Delete record "${record.record_type}" for ${record.patient_name}?`);
    if (!confirmed) return;

    setDeletingId(record.id);
    setError("");
    try {
      await apiRequest(`/medical-records/${record.id}`, {
        method: "DELETE",
        authenticated: true
      });
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
      window.open(record.file_url, "_blank", "noopener,noreferrer");
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
        <button
          onClick={() => {
            resetForm();
            setShowFormModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
        >
          <Plus className="w-4 h-4" />
          Add Record
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                      <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white">
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
                      <button
                        onClick={() => handleEdit(record)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(record)}
                        disabled={deletingId === record.id}
                        className="p-1.5 rounded hover:bg-red-50 text-red-600 disabled:opacity-60"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
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
              <label className="block text-sm text-gray-700 mb-2">File URL (optional)</label>
              <input
                type="url"
                value={form.fileUrl}
                onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="https://example.com/record.pdf"
              />
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
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg disabled:opacity-60"
              >
                {isSubmitting ? "Saving..." : editingRecordId ? "Update Record" : "Save Record"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showViewModal && selectedRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl text-gray-900">Medical Record Details</h2>
              <p className="text-sm text-gray-600 mt-1">{selectedRecord.record_type}</p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <p><span className="text-gray-500">Patient:</span> {patientsMap.get(selectedRecord.patient_id) || selectedRecord.patient_name}</p>
              <p><span className="text-gray-500">Doctor:</span> {doctorsMap.get(selectedRecord.doctor_id) || selectedRecord.doctor_name}</p>
              <p><span className="text-gray-500">Status:</span> {selectedRecord.status}</p>
              <p><span className="text-gray-500">Date:</span> {selectedRecord.record_date}</p>
              <p className="sm:col-span-2"><span className="text-gray-500">Notes:</span> {selectedRecord.notes || "-"}</p>
              <p className="sm:col-span-2">
                <span className="text-gray-500">File URL:</span>{" "}
                {selectedRecord.file_url ? (
                  <a
                    href={selectedRecord.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-700 hover:underline"
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
    </div>
  );
}
