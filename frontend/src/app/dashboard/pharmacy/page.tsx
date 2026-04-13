"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package, Pencil, Pill, Plus, Receipt, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessPharmacy, canManagePharmacyCatalog } from "@/lib/roles";
import { AuthUser, Doctor, MedicalRecord, Medicine, MedicineBatch, Patient, PharmacyDispense } from "@/types/api";
import ModalCloseButton from "@/app/components/ModalCloseButton";

type ListResponse<T> = { success: boolean; data: { items: T[] } };
type SingleResponse<T> = { success: boolean; data: T };
type MeResponse = { success: boolean; data: AuthUser };
type PatientResponse = { success: boolean; data: Patient };
type PharmacyInsightItem = Medicine & {
  severity: "critical" | "high" | "medium";
};
type PharmacyInsightsResponse = {
  success: boolean;
  data: {
    generated_at: string;
    low_stock_count: number;
    out_of_stock_count: number;
    total_suggested_reorder_quantity: number;
    low_stock_items: PharmacyInsightItem[];
  };
};

type MedicineForm = {
  code: string;
  name: string;
  genericName: string;
  dosageForm: string;
  strength: string;
  unit: string;
  reorderLevel: string;
};

type BatchForm = {
  medicineId: string;
  batchNumber: string;
  manufacturer: string;
  expiryDate: string;
  receivedQuantity: string;
  purchasePrice: string;
  salePrice: string;
  receivedDate: string;
};

type DispenseItemForm = {
  medicineBatchId: string;
  quantity: string;
  unitPrice: string;
  directions: string;
};

type DispenseForm = {
  patientId: string;
  doctorId: string;
  medicalRecordId: string;
  dispensedDate: string;
  prescriptionSnapshot: string;
  notes: string;
  createInvoice: boolean;
  items: DispenseItemForm[];
};

const todayDateKey = () => new Date().toISOString().slice(0, 10);
const LIST_PREVIEW_LIMIT = 6;
const money = (value: number | null | undefined) => `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const quantity = (value: number | null | undefined) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

const normalizeText = (value: string | null | undefined) =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const splitPrescriptionLines = (value: string) =>
  value
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

const scoreMedicineMatch = (line: string, medicine: Medicine) => {
  const normalizedLine = normalizeText(line);
  if (!normalizedLine) {
    return 0;
  }

  let score = 0;
  const primaryName = normalizeText(medicine.name);
  const genericName = normalizeText(medicine.generic_name);
  const strength = normalizeText(medicine.strength);
  const dosageForm = normalizeText(medicine.dosage_form);

  if (primaryName && normalizedLine.includes(primaryName)) {
    score += 100;
  } else if (primaryName && primaryName.split(" ").some((token) => token.length > 3 && normalizedLine.includes(token))) {
    score += 40;
  }

  if (genericName && normalizedLine.includes(genericName)) {
    score += 80;
  } else if (genericName && genericName.split(" ").some((token) => token.length > 3 && normalizedLine.includes(token))) {
    score += 30;
  }

  if (strength && normalizedLine.includes(strength)) {
    score += 20;
  }

  if (dosageForm && normalizedLine.includes(dosageForm)) {
    score += 10;
  }

  return score;
};

const buildPrescriptionDispenseDraft = (prescriptionSnapshot: string, medicines: Medicine[], batches: MedicineBatch[]) => {
  const lines = splitPrescriptionLines(prescriptionSnapshot);
  const usedMedicineIds = new Set<string>();
  const items: DispenseItemForm[] = [];
  const unmatchedLines: string[] = [];

  for (const line of lines) {
    const rankedMatch = medicines
      .filter((medicine) => medicine.is_active)
      .map((medicine) => ({ medicine, score: scoreMedicineMatch(line, medicine) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    if (!rankedMatch || usedMedicineIds.has(rankedMatch.medicine.id)) {
      unmatchedLines.push(line);
      continue;
    }

    const batch = batches
      .filter((entry) => entry.medicine_id === rankedMatch.medicine.id && entry.available_quantity > 0)
      .sort((a, b) => {
        const aDate = new Date(`${a.expiry_date}T00:00:00`).getTime();
        const bDate = new Date(`${b.expiry_date}T00:00:00`).getTime();
        if (aDate !== bDate) {
          return aDate - bDate;
        }
        return Number(b.available_quantity || 0) - Number(a.available_quantity || 0);
      })[0];

    if (!batch) {
      unmatchedLines.push(line);
      continue;
    }

    usedMedicineIds.add(rankedMatch.medicine.id);
    items.push({
      medicineBatchId: batch.id,
      quantity: "1",
      unitPrice: String(batch.sale_price || ""),
      directions: line
    });
  }

  return { items, unmatchedLines };
};

const initialMedicineForm = (): MedicineForm => ({
  code: "",
  name: "",
  genericName: "",
  dosageForm: "",
  strength: "",
  unit: "tablet",
  reorderLevel: "0"
});

const initialBatchForm = (): BatchForm => ({
  medicineId: "",
  batchNumber: "",
  manufacturer: "",
  expiryDate: "",
  receivedQuantity: "",
  purchasePrice: "",
  salePrice: "",
  receivedDate: todayDateKey()
});

const emptyDispenseItem = (): DispenseItemForm => ({
  medicineBatchId: "",
  quantity: "1",
  unitPrice: "",
  directions: ""
});

const initialDispenseForm = (patientId = ""): DispenseForm => ({
  patientId,
  doctorId: "",
  medicalRecordId: "",
  dispensedDate: todayDateKey(),
  prescriptionSnapshot: "",
  notes: "",
  createInvoice: true,
  items: [emptyDispenseItem()]
});

export default function PharmacyPage() {
  const searchParams = useSearchParams();
  const patientFilterId = searchParams.get("patientId") || "";
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<MedicineBatch[]>([]);
  const [dispenses, setDispenses] = useState<PharmacyDispense[]>([]);
  const [patientRecords, setPatientRecords] = useState<MedicalRecord[]>([]);
  const [insights, setInsights] = useState<PharmacyInsightsResponse["data"]>({
    generated_at: "",
    low_stock_count: 0,
    out_of_stock_count: 0,
    total_suggested_reorder_quantity: 0,
    low_stock_items: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assistMessage, setAssistMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMedicineForm, setShowMedicineForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [showDispenseForm, setShowDispenseForm] = useState(false);
  const [editingMedicineId, setEditingMedicineId] = useState<string | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [showAllLowStock, setShowAllLowStock] = useState(false);
  const [showAllMedicines, setShowAllMedicines] = useState(false);
  const [showAllDispenses, setShowAllDispenses] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [medicineForm, setMedicineForm] = useState<MedicineForm>(initialMedicineForm());
  const [batchForm, setBatchForm] = useState<BatchForm>(initialBatchForm());
  const [dispenseForm, setDispenseForm] = useState<DispenseForm>(initialDispenseForm(patientFilterId));
  const medicineFormRef = useRef<HTMLElement | null>(null);
  const batchFormRef = useRef<HTMLElement | null>(null);

  const loadDispenses = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (patientFilterId) params.set("patientId", patientFilterId);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status) params.set("status", filters.status);
    const response = await apiRequest<ListResponse<PharmacyDispense>>(`/pharmacy/dispenses?${params.toString()}`, { authenticated: true });
    setDispenses(response.data.items || []);
  }, [filters.q, filters.status, patientFilterId]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, patientsRes, doctorsRes, medicinesRes, batchesRes, insightsRes] = await Promise.all([
        apiRequest<MeResponse>("/auth/me", { authenticated: true }),
        apiRequest<ListResponse<Patient>>("/patients?limit=100", { authenticated: true }),
        apiRequest<ListResponse<Doctor>>("/doctors?limit=100", { authenticated: true }),
        apiRequest<ListResponse<Medicine>>("/pharmacy/medicines?limit=200", { authenticated: true }),
        apiRequest<ListResponse<MedicineBatch>>("/pharmacy/batches?limit=200", { authenticated: true }),
        apiRequest<PharmacyInsightsResponse>("/pharmacy/insights?limit=8", { authenticated: true })
      ]);
      setCurrentUser(me.data);
      setPatients(patientsRes.data.items || []);
      setDoctors(doctorsRes.data.items || []);
      setMedicines(medicinesRes.data.items || []);
      setBatches(batchesRes.data.items || []);
      setInsights(insightsRes.data);
      await loadDispenses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load pharmacy workspace");
    } finally {
      setLoading(false);
    }
  }, [loadDispenses]);

  useEffect(() => {
    if (!showMedicineForm) {
      return;
    }

    medicineFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showMedicineForm]);

  useEffect(() => {
    if (!showBatchForm) {
      return;
    }

    batchFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showBatchForm]);

  const loadPatientRecords = useCallback(async (patientId: string) => {
    if (!patientId) {
      setPatientRecords([]);
      return;
    }
    try {
      const response = await apiRequest<ListResponse<MedicalRecord>>(`/medical-records?limit=20&patientId=${encodeURIComponent(patientId)}`, { authenticated: true });
      setPatientRecords(response.data.items || []);
    } catch {
      setPatientRecords([]);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setDispenseForm(initialDispenseForm(patientFilterId));
    setAssistMessage("");
    void loadPatientRecords(patientFilterId);
  }, [patientFilterId, loadPatientRecords]);

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
      .catch(() => undefined);
  }, [patientFilterId, patients]);

  useEffect(() => {
    void loadDispenses();
  }, [loadDispenses]);

  useEffect(() => {
    void loadPatientRecords(dispenseForm.patientId);
  }, [dispenseForm.patientId, loadPatientRecords]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === dispenseForm.patientId) || null,
    [patients, dispenseForm.patientId]
  );
  const activeBatches = useMemo(() => batches.filter((batch) => batch.available_quantity > 0), [batches]);
  const lowStockMedicines = useMemo(
    () => medicines.filter((medicine) => medicine.is_active && Number(medicine.current_stock || 0) <= Number(medicine.reorder_level || 0)),
    [medicines]
  );
  const lowStock = useMemo(() => insights.low_stock_items, [insights.low_stock_items]);
  const normalizedSearchTerm = normalizeText(searchTerm);
  const matchesSearch = useCallback(
    (...values: Array<string | number | null | undefined>) => {
      if (!normalizedSearchTerm) {
        return true;
      }

      return values
        .map((value) => normalizeText(String(value ?? "")))
        .some((value) => value.includes(normalizedSearchTerm));
    },
    [normalizedSearchTerm]
  );
  const filteredLowStock = useMemo(
    () =>
      lowStock.filter((item) =>
        matchesSearch(item.name, item.generic_name, item.code, item.strength, item.dosage_form)
      ),
    [lowStock, matchesSearch]
  );
  const filteredMedicines = useMemo(
    () =>
      medicines.filter((medicine) =>
        matchesSearch(
          medicine.name,
          medicine.generic_name,
          medicine.code,
          medicine.strength,
          medicine.dosage_form,
          medicine.unit
        )
      ),
    [medicines, matchesSearch]
  );
  const filteredBatches = useMemo(
    () =>
      batches.filter((batch) =>
        matchesSearch(batch.medicine_name, batch.medicine_code, batch.batch_number, batch.manufacturer, batch.unit)
      ),
    [batches, matchesSearch]
  );
  const filteredDispenses = useMemo(
    () =>
      dispenses.filter((dispense) =>
        matchesSearch(
          dispense.dispense_number,
          dispense.patient_name,
          dispense.patient_code,
          dispense.doctor_name,
          dispense.invoice_number,
          dispense.medical_record_type,
          dispense.items.map((item) => item.medicine_name).join(" ")
        )
      ),
    [dispenses, matchesSearch]
  );
  const visibleLowStockItems = showAllLowStock ? filteredLowStock : filteredLowStock.slice(0, LIST_PREVIEW_LIMIT);
  const visibleMedicines = showAllMedicines ? filteredMedicines : filteredMedicines.slice(0, LIST_PREVIEW_LIMIT);
  const visibleBatches = filteredBatches.slice(0, 18);
  const visibleDispenses = showAllDispenses ? filteredDispenses : filteredDispenses.slice(0, LIST_PREVIEW_LIMIT);
  const prescriptionDraft = useMemo(
    () => buildPrescriptionDispenseDraft(dispenseForm.prescriptionSnapshot, medicines, batches),
    [batches, dispenseForm.prescriptionSnapshot, medicines]
  );
  const expiring = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const threshold = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    return batches.filter((batch) => {
      const expiry = new Date(`${batch.expiry_date}T00:00:00`);
      return !Number.isNaN(expiry.getTime()) && expiry >= today && expiry <= threshold && batch.available_quantity > 0;
    });
  }, [batches]);

  const applyBatch = (index: number, batchId: string) => {
    const batch = batches.find((entry) => entry.id === batchId);
    setDispenseForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, medicineBatchId: batchId, unitPrice: batch ? String(batch.sale_price || "") : "" }
          : item
      )
    }));
  };

  const openMedicineForm = (medicine?: Medicine) => {
    if (medicine) {
      setEditingMedicineId(medicine.id);
      setMedicineForm({
        code: medicine.code || "",
        name: medicine.name || "",
        genericName: medicine.generic_name || "",
        dosageForm: medicine.dosage_form || "",
        strength: medicine.strength || "",
        unit: medicine.unit || "tablet",
        reorderLevel: String(medicine.reorder_level ?? 0)
      });
    } else {
      setEditingMedicineId(null);
      setMedicineForm(initialMedicineForm());
    }

    setShowMedicineForm(true);
  };

  const openBatchForm = (batch?: MedicineBatch) => {
    if (batch) {
      setEditingBatchId(batch.id);
      setBatchForm({
        medicineId: batch.medicine_id || "",
        batchNumber: batch.batch_number || "",
        manufacturer: batch.manufacturer || "",
        expiryDate: batch.expiry_date || "",
        receivedQuantity: String(batch.received_quantity ?? ""),
        purchasePrice: String(batch.purchase_price ?? ""),
        salePrice: String(batch.sale_price ?? ""),
        receivedDate: batch.received_date || todayDateKey()
      });
    } else {
      setEditingBatchId(null);
      setBatchForm(initialBatchForm());
    }

    setShowBatchForm(true);
  };

  const applyPrescriptionDraft = () => {
    if (prescriptionDraft.items.length === 0) {
      setAssistMessage("No in-stock medicines matched the prescription text.");
      return;
    }

    setDispenseForm((current) => ({
      ...current,
      items: prescriptionDraft.items
    }));

    if (prescriptionDraft.unmatchedLines.length > 0) {
      setAssistMessage(`${prescriptionDraft.items.length} medicine line(s) matched. ${prescriptionDraft.unmatchedLines.length} line(s) still need manual review.`);
    } else {
      setAssistMessage(`Loaded ${prescriptionDraft.items.length} prescribed medicine line(s). Stock will deduct when you save the dispense.`);
    }
  };

  const refreshInventory = async () => {
    const [medicinesRes, batchesRes, insightsRes] = await Promise.all([
      apiRequest<ListResponse<Medicine>>("/pharmacy/medicines?limit=200", { authenticated: true }),
      apiRequest<ListResponse<MedicineBatch>>("/pharmacy/batches?limit=200", { authenticated: true }),
      apiRequest<PharmacyInsightsResponse>("/pharmacy/insights?limit=8", { authenticated: true })
    ]);
    setMedicines(medicinesRes.data.items || []);
    setBatches(batchesRes.data.items || []);
    setInsights(insightsRes.data);
  };

  const submitMedicine = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        code: medicineForm.code.trim() || undefined,
        name: medicineForm.name.trim(),
        genericName: medicineForm.genericName.trim() || undefined,
        dosageForm: medicineForm.dosageForm.trim() || undefined,
        strength: medicineForm.strength.trim() || undefined,
        unit: medicineForm.unit.trim() || undefined,
        reorderLevel: medicineForm.reorderLevel ? Number(medicineForm.reorderLevel) : undefined
      };

      const response = editingMedicineId
        ? await apiRequest<SingleResponse<Medicine>>(`/pharmacy/medicines/${editingMedicineId}`, {
            method: "PATCH",
            authenticated: true,
            body: payload
          })
        : await apiRequest<SingleResponse<Medicine>>("/pharmacy/medicines", {
            method: "POST",
            authenticated: true,
            body: payload
          });

      setMedicines((current) =>
        editingMedicineId
          ? current.map((medicine) => (medicine.id === response.data.id ? response.data : medicine))
          : [response.data, ...current]
      );
      setMedicineForm(initialMedicineForm());
      setEditingMedicineId(null);
      setShowMedicineForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Failed to ${editingMedicineId ? "update" : "save"} medicine`);
    } finally {
      setSaving(false);
    }
  };

  const submitBatch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        medicineId: batchForm.medicineId,
        batchNumber: batchForm.batchNumber.trim(),
        manufacturer: batchForm.manufacturer.trim() || undefined,
        expiryDate: batchForm.expiryDate,
        receivedQuantity: Number(batchForm.receivedQuantity),
        purchasePrice: batchForm.purchasePrice ? Number(batchForm.purchasePrice) : undefined,
        salePrice: batchForm.salePrice ? Number(batchForm.salePrice) : undefined,
        receivedDate: batchForm.receivedDate || undefined
      };

      const response = editingBatchId
        ? await apiRequest<SingleResponse<MedicineBatch>>(`/pharmacy/batches/${editingBatchId}`, {
            method: "PATCH",
            authenticated: true,
            body: payload
          })
        : await apiRequest<SingleResponse<MedicineBatch>>("/pharmacy/batches", {
            method: "POST",
            authenticated: true,
            body: payload
          });

      setBatches((current) =>
        editingBatchId
          ? current.map((batch) => (batch.id === response.data.id ? response.data : batch))
          : [response.data, ...current]
      );
      await refreshInventory();
      setBatchForm(initialBatchForm());
      setEditingBatchId(null);
      setShowBatchForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Failed to ${editingBatchId ? "update" : "save"} batch`);
    } finally {
      setSaving(false);
    }
  };

  const submitDispense = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<SingleResponse<PharmacyDispense>>("/pharmacy/dispenses", {
        method: "POST",
        authenticated: true,
        body: {
          patientId: dispenseForm.patientId,
          doctorId: dispenseForm.doctorId || undefined,
          medicalRecordId: dispenseForm.medicalRecordId || undefined,
          dispensedDate: dispenseForm.dispensedDate,
          prescriptionSnapshot: dispenseForm.prescriptionSnapshot.trim() || undefined,
          notes: dispenseForm.notes.trim() || undefined,
          createInvoice: dispenseForm.createInvoice,
          items: dispenseForm.items.map((item) => ({
            medicineBatchId: item.medicineBatchId,
            quantity: Number(item.quantity),
            unitPrice: item.unitPrice ? Number(item.unitPrice) : undefined,
            directions: item.directions.trim() || undefined
          }))
        }
      });
      setDispenses((current) => [response.data, ...current]);
      await refreshInventory();
      setDispenseForm(initialDispenseForm(patientFilterId));
      setAssistMessage("");
      setShowDispenseForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to dispense medicines");
    } finally {
      setSaving(false);
    }
  };

  const deleteMedicine = async (medicine: Medicine) => {
    if (!window.confirm(`Delete medicine "${medicine.name}"?`)) {
      return;
    }

    setError("");
    try {
      await apiRequest(`/pharmacy/medicines/${medicine.id}`, {
        method: "DELETE",
        authenticated: true
      });
      setMedicines((current) => current.filter((item) => item.id !== medicine.id));
      await refreshInventory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete medicine");
    }
  };

  const deleteBatch = async (batch: MedicineBatch) => {
    if (!window.confirm(`Delete batch "${batch.batch_number}" for ${batch.medicine_name}?`)) {
      return;
    }

    setError("");
    try {
      await apiRequest(`/pharmacy/batches/${batch.id}`, {
        method: "DELETE",
        authenticated: true
      });
      setBatches((current) => current.filter((item) => item.id !== batch.id));
      await refreshInventory();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete batch");
    }
  };

  if (currentUser && !canAccessPharmacy(currentUser.role)) {
    return <p className="text-red-600">You do not have access to Pharmacy.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-600">Dispensing</p>
          <h1 className="mt-2 text-2xl text-gray-900">Pharmacy Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">Manage medicine inventory, track batches and expiry, and bill dispensed medicines from patient prescriptions.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void loadPage()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          {canManagePharmacyCatalog(currentUser?.role) && (
            <>
              <button data-testid="pharmacy-add-medicine-button" type="button" onClick={() => openMedicineForm()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
                <Pill className="h-4 w-4" />
                Add Medicine
              </button>
              <button data-testid="pharmacy-add-batch-button" type="button" onClick={() => openBatchForm()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
                <Package className="h-4 w-4" />
                Add Batch
              </button>
            </>
          )}
          <button data-testid="pharmacy-dispense-button" type="button" onClick={() => setShowDispenseForm((current) => !current)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" />
            Dispense
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {assistMessage && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{assistMessage}</div>}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="space-y-2">
          <span className="text-sm text-gray-700">Search</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search medicines, batches, or dispenses"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring"
          />
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Medicines</p><p className="mt-3 text-2xl text-gray-900">{medicines.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Active Batches</p><p className="mt-3 text-2xl text-gray-900">{activeBatches.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Low Stock</p><p className="mt-3 text-2xl text-gray-900">{lowStockMedicines.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Expiring Soon</p><p className="mt-3 text-2xl text-gray-900">{expiring.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Dispenses</p><p className="mt-3 text-2xl text-gray-900">{dispenses.length}</p></div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-amber-700">Daily Stock Alert</p>
            <h2 className="mt-2 text-xl text-gray-900">Low stock summary</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Auto-generated low stock summary with suggested reorder quantities based on reorder level and the last 30 days of dispense volume.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Low Stock</p>
              <p className="mt-2 text-2xl text-gray-900">{insights.low_stock_count}</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Out of Stock</p>
              <p className="mt-2 text-2xl text-gray-900">{insights.out_of_stock_count}</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Suggested Reorder</p>
              <p className="mt-2 text-2xl text-gray-900">{quantity(insights.total_suggested_reorder_quantity)}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {insights.low_stock_items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-white px-6 py-10 text-sm text-gray-500 xl:col-span-2">
              No low stock medicines in today&apos;s summary.
            </div>
          ) : (
            <>
              {visibleLowStockItems.map((item) => (
              <article key={item.id} className="rounded-2xl border border-amber-100 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base text-gray-900">{item.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">{[item.strength, item.dosage_form, item.code].filter(Boolean).join(" | ") || item.generic_name || "General medicine"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                    item.severity === "critical" ? "bg-red-50 text-red-700" : item.severity === "high" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                  }`}>
                    {item.severity}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                  <p><span className="font-medium text-gray-900">Current Stock:</span> {quantity(item.current_stock)} {item.unit}</p>
                  <p><span className="font-medium text-gray-900">Reorder Level:</span> {quantity(item.reorder_level)} {item.unit}</p>
                  <p><span className="font-medium text-gray-900">30 Day Usage:</span> {quantity(item.dispensed_last_30_days)} {item.unit}</p>
                  <p><span className="font-medium text-gray-900">Suggested Reorder:</span> {quantity(item.suggested_reorder_quantity)} {item.unit}</p>
                </div>
              </article>
            ))}
            {insights.low_stock_items.length > LIST_PREVIEW_LIMIT && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowAllLowStock((current) => !current)}
                  className="rounded-lg border border-amber-200 px-4 py-2 text-sm text-amber-800 hover:bg-white"
                >
                  {showAllLowStock ? "Show less" : "Show more"}
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </section>

      {showMedicineForm && canManagePharmacyCatalog(currentUser?.role) && (
        <section ref={medicineFormRef} data-testid="pharmacy-medicine-form" className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Catalog</p>
              <h2 className="mt-2 text-xl text-gray-900">{editingMedicineId ? "Edit Medicine" : "Create Medicine"}</h2>
            </div>
            <ModalCloseButton
              onClick={() => {
                setShowMedicineForm(false);
                setEditingMedicineId(null);
                setMedicineForm(initialMedicineForm());
              }}
            />
          </div>
          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitMedicine}>
            <input data-testid="pharmacy-medicine-code-input" value={medicineForm.code} onChange={(event) => setMedicineForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="pharmacy-medicine-name-input" value={medicineForm.name} onChange={(event) => setMedicineForm((current) => ({ ...current, name: event.target.value }))} placeholder="Medicine name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input data-testid="pharmacy-medicine-generic-name-input" value={medicineForm.genericName} onChange={(event) => setMedicineForm((current) => ({ ...current, genericName: event.target.value }))} placeholder="Generic name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="pharmacy-medicine-dosage-form-input" value={medicineForm.dosageForm} onChange={(event) => setMedicineForm((current) => ({ ...current, dosageForm: event.target.value }))} placeholder="Dosage form" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="pharmacy-medicine-strength-input" value={medicineForm.strength} onChange={(event) => setMedicineForm((current) => ({ ...current, strength: event.target.value }))} placeholder="Strength" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="pharmacy-medicine-unit-input" value={medicineForm.unit} onChange={(event) => setMedicineForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unit" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="pharmacy-medicine-reorder-level-input" type="number" min="0" step="0.01" value={medicineForm.reorderLevel} onChange={(event) => setMedicineForm((current) => ({ ...current, reorderLevel: event.target.value }))} placeholder="Reorder level" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div className="lg:col-span-2 flex items-center justify-between gap-3">
              {editingMedicineId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMedicineId(null);
                    setMedicineForm(initialMedicineForm());
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel Edit
                </button>
              )}
              <div className="flex-1" />
              <button data-testid="pharmacy-medicine-submit-button" type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? "Saving..." : editingMedicineId ? "Update Medicine" : "Create Medicine"}
              </button>
            </div>
          </form>
        </section>
      )}

      {showBatchForm && canManagePharmacyCatalog(currentUser?.role) && (
        <section ref={batchFormRef} data-testid="pharmacy-batch-form" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Inventory</p>
              <h2 className="mt-2 text-xl text-gray-900">{editingBatchId ? "Edit Batch" : "Add Batch"}</h2>
            </div>
            <ModalCloseButton
              onClick={() => {
                setShowBatchForm(false);
                setEditingBatchId(null);
                setBatchForm(initialBatchForm());
              }}
            />
          </div>
          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitBatch}>
            <select data-testid="pharmacy-batch-medicine-select" value={batchForm.medicineId} onChange={(event) => setBatchForm((current) => ({ ...current, medicineId: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
              <option value="">Select medicine</option>
              {medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} {medicine.code ? `| ${medicine.code}` : ""}</option>)}
            </select>
            <input data-testid="pharmacy-batch-number-input" value={batchForm.batchNumber} onChange={(event) => setBatchForm((current) => ({ ...current, batchNumber: event.target.value }))} placeholder="Batch number" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input data-testid="pharmacy-batch-manufacturer-input" value={batchForm.manufacturer} onChange={(event) => setBatchForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Manufacturer" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="pharmacy-batch-expiry-date-input" type="date" value={batchForm.expiryDate} onChange={(event) => setBatchForm((current) => ({ ...current, expiryDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input data-testid="pharmacy-batch-received-quantity-input" type="number" min="0.01" step="0.01" value={batchForm.receivedQuantity} onChange={(event) => setBatchForm((current) => ({ ...current, receivedQuantity: event.target.value }))} placeholder="Received quantity" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input data-testid="pharmacy-batch-purchase-price-input" type="number" min="0" step="0.01" value={batchForm.purchasePrice} onChange={(event) => setBatchForm((current) => ({ ...current, purchasePrice: event.target.value }))} placeholder="Purchase price" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="pharmacy-batch-sale-price-input" type="number" min="0" step="0.01" value={batchForm.salePrice} onChange={(event) => setBatchForm((current) => ({ ...current, salePrice: event.target.value }))} placeholder="Sale price" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="pharmacy-batch-received-date-input" type="date" value={batchForm.receivedDate} onChange={(event) => setBatchForm((current) => ({ ...current, receivedDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div className="lg:col-span-2 flex items-center justify-between gap-3">
              {editingBatchId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBatchId(null);
                    setBatchForm(initialBatchForm());
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel Edit
                </button>
              )}
              <div className="flex-1" />
              <button data-testid="pharmacy-batch-submit-button" type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? "Saving..." : editingBatchId ? "Update Batch" : "Create Batch"}
              </button>
            </div>
          </form>
        </section>
      )}

      {showDispenseForm && (
        <section data-testid="pharmacy-dispense-form" className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Dispense</p>
              <h2 className="mt-2 text-xl text-gray-900">Dispense Medicines</h2>
            </div>
            <ModalCloseButton onClick={() => setShowDispenseForm(false)} />
          </div>
          <form className="mt-6 grid gap-4" onSubmit={submitDispense}>
            <div className="grid gap-4 lg:grid-cols-2">
              <select data-testid="pharmacy-dispense-patient-select" value={dispenseForm.patientId} onChange={(event) => {
                setAssistMessage("");
                setDispenseForm((current) => ({ ...current, patientId: event.target.value, medicalRecordId: "", prescriptionSnapshot: "", items: [emptyDispenseItem()] }));
              }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
                <option value="">Select patient</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} | {patient.patient_code || patient.phone}</option>)}
              </select>
              <select data-testid="pharmacy-dispense-doctor-select" value={dispenseForm.doctorId} onChange={(event) => setDispenseForm((current) => ({ ...current, doctorId: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Unassigned doctor</option>
                {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name} | {doctor.specialty}</option>)}
              </select>
              <select
                data-testid="pharmacy-dispense-medical-record-select"
                value={dispenseForm.medicalRecordId}
                onChange={(event) => {
                  const record = patientRecords.find((entry) => entry.id === event.target.value);
                  setAssistMessage("");
                  setDispenseForm((current) => ({
                    ...current,
                    medicalRecordId: event.target.value,
                    doctorId: record?.doctor_id || current.doctorId,
                    prescriptionSnapshot: record?.prescription || current.prescriptionSnapshot
                  }));
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">No linked medical record</option>
                {patientRecords.map((record) => <option key={record.id} value={record.id}>{formatDate(record.record_date)} | {record.record_type}</option>)}
              </select>
              <input data-testid="pharmacy-dispense-date-input" type="date" value={dispenseForm.dispensedDate} onChange={(event) => setDispenseForm((current) => ({ ...current, dispensedDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            </div>

            {selectedPatient && (
              <div className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-4">
                <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">Patient:</span> {selectedPatient.full_name}</p>
                <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">Patient ID:</span> {selectedPatient.patient_code || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">Phone:</span> {selectedPatient.phone || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">Last Visit:</span> {formatDate(selectedPatient.last_visit_at)}</p>
              </div>
            )}

            <div className="space-y-3">
              <textarea data-testid="pharmacy-dispense-prescription-input" value={dispenseForm.prescriptionSnapshot} onChange={(event) => {
                setAssistMessage("");
                setDispenseForm((current) => ({ ...current, prescriptionSnapshot: event.target.value }));
              }} placeholder="Prescription snapshot" rows={3} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={applyPrescriptionDraft}
                  disabled={prescriptionDraft.items.length === 0}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Dispense All Prescribed Meds
                </button>
                <p className="text-sm text-gray-600">
                  {prescriptionDraft.items.length > 0
                    ? `${prescriptionDraft.items.length} matched medicine line(s) ready${prescriptionDraft.unmatchedLines.length > 0 ? `, ${prescriptionDraft.unmatchedLines.length} unmatched` : ""}.`
                    : "No matched in-stock medicines found yet."}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-900">Dispense lines</p>
                <button type="button" onClick={() => setDispenseForm((current) => ({ ...current, items: [...current.items, emptyDispenseItem()] }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Add line</button>
              </div>
              {dispenseForm.items.map((item, index) => (
                <div key={`item-${index}`} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[1.4fr_0.5fr_0.6fr_1fr_auto]">
                  <select data-testid={index === 0 ? "pharmacy-dispense-batch-select" : undefined} value={item.medicineBatchId} onChange={(event) => applyBatch(index, event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
                    <option value="">Select batch</option>
                    {activeBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.medicine_name} | {batch.batch_number} | Stock {batch.available_quantity} | Exp {formatDate(batch.expiry_date)}</option>)}
                  </select>
                  <input data-testid={index === 0 ? "pharmacy-dispense-quantity-input" : undefined} type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => setDispenseForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry) }))} placeholder="Qty" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                  <input data-testid={index === 0 ? "pharmacy-dispense-unit-price-input" : undefined} type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setDispenseForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, unitPrice: event.target.value } : entry) }))} placeholder="Price" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <input data-testid={index === 0 ? "pharmacy-dispense-directions-input" : undefined} value={item.directions} onChange={(event) => setDispenseForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, directions: event.target.value } : entry) }))} placeholder="Directions" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => setDispenseForm((current) => ({ ...current, items: current.items.length === 1 ? [emptyDispenseItem()] : current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white">Remove</button>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <input data-testid="pharmacy-dispense-create-invoice-checkbox" type="checkbox" checked={dispenseForm.createInvoice} onChange={(event) => setDispenseForm((current) => ({ ...current, createInvoice: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
              Create linked invoice in billing
            </label>

            <textarea data-testid="pharmacy-dispense-notes-input" value={dispenseForm.notes} onChange={(event) => setDispenseForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Dispense notes" rows={3} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div><button data-testid="pharmacy-dispense-submit-button" type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Saving..." : "Dispense Medicines"}</button></div>
          </form>
        </section>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Inventory</p>
            <h2 className="mt-2 text-xl text-gray-900">Medicine Inventory</h2>
          </div>
          <p className="text-sm text-gray-500">Active stock, reorder risk, and nearest expiry.</p>
        </div>
        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">Loading inventory...</div>
        ) : filteredMedicines.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">No medicines added yet.</div>
        ) : (
          <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleMedicines.map((medicine) => {
              const isLowStock = Number(medicine.current_stock || 0) <= Number(medicine.reorder_level || 0);
              return (
                <article key={medicine.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg text-gray-900">{medicine.name}</p>
                      <p className="mt-1 text-sm text-gray-600">{[medicine.strength, medicine.dosage_form, medicine.code].filter(Boolean).join(" | ") || medicine.generic_name || "General medicine"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${medicine.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{medicine.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                    <p><span className="font-medium text-gray-900">Stock:</span> {medicine.current_stock || 0} {medicine.unit}</p>
                    <p><span className="font-medium text-gray-900">Batches:</span> {medicine.active_batch_count || 0}</p>
                    <p><span className="font-medium text-gray-900">Reorder at:</span> {medicine.reorder_level || 0}</p>
                    <p><span className="font-medium text-gray-900">Nearest expiry:</span> {formatDate(medicine.nearest_expiry_date)}</p>
                    <p><span className="font-medium text-gray-900">30 day usage:</span> {quantity(medicine.dispensed_last_30_days)} {medicine.unit}</p>
                    <p><span className="font-medium text-gray-900">Suggested reorder:</span> {quantity(medicine.suggested_reorder_quantity)} {medicine.unit}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {isLowStock && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700"><TriangleAlert className="h-3.5 w-3.5" />Low stock</span>}
                    {Number(medicine.expiring_batch_count || 0) > 0 && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-red-700">{medicine.expiring_batch_count} expiring</span>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openMedicineForm(medicine)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteMedicine(medicine)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {filteredMedicines.length > LIST_PREVIEW_LIMIT && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllMedicines((current) => !current)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {showAllMedicines ? "Show less" : "Show more"}
              </button>
            </div>
          )}
          </>
        )}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Batches</p>
            <h2 className="mt-2 text-xl text-gray-900">Batch & Expiry Tracking</h2>
          </div>
          <p className="text-sm text-gray-500">Sellable stock with batch-level pricing.</p>
        </div>
        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">Loading batches...</div>
        ) : filteredBatches.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">No batches added yet.</div>
        ) : (
          <div className="mt-6 space-y-3">
            {visibleBatches.map((batch) => (
              <article key={batch.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-base text-gray-900">{batch.medicine_name}</p>
                    <p className="mt-1 text-sm text-gray-600">Batch {batch.batch_number}{batch.manufacturer ? ` | ${batch.manufacturer}` : ""}{batch.medicine_code ? ` | ${batch.medicine_code}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600 ring-1 ring-gray-200">Stock {batch.available_quantity}/{batch.received_quantity}</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Exp {formatDate(batch.expiry_date)}</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-4">
                  <p><span className="font-medium text-gray-900">Sale:</span> {money(batch.sale_price)}</p>
                  <p><span className="font-medium text-gray-900">Purchase:</span> {money(batch.purchase_price)}</p>
                  <p><span className="font-medium text-gray-900">Received:</span> {formatDate(batch.received_date)}</p>
                  <p><span className="font-medium text-gray-900">Unit:</span> {batch.unit}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openBatchForm(batch)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteBatch(batch)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search dispense number, patient, or medicine" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All dispense statuses</option>
            <option value="dispensed">Dispensed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </section>

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">Loading dispenses...</div>
        ) : filteredDispenses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">No pharmacy dispenses matched the current filters.</div>
        ) : (
          <>
          {visibleDispenses.map((dispense) => (
            <article key={dispense.id} data-testid="pharmacy-dispense-card" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${dispense.status === "cancelled" ? "bg-slate-100 text-slate-600 ring-slate-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>{dispense.status}</span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">{dispense.dispense_number}</span>
                    {dispense.invoice_number && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Invoice {dispense.invoice_number}</span>}
                  </div>
                  <div>
                    <h2 className="text-xl text-gray-900">{dispense.patient_name}</h2>
                    <p className="mt-1 text-sm text-gray-600">{dispense.patient_code ? `${dispense.patient_code} | ` : ""}Dispensed {formatDate(dispense.dispensed_date)}{dispense.doctor_name ? ` | ${dispense.doctor_name}` : ""}</p>
                  </div>
                  <div className="grid gap-2 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                    <p><span className="font-medium text-gray-900">Dispensed by:</span> {dispense.dispensed_by_name || "-"}</p>
                    <p><span className="font-medium text-gray-900">Items:</span> {dispense.items.length}</p>
                    <p><span className="font-medium text-gray-900">Invoice:</span> {dispense.invoice_status || "Not created"}</p>
                    <p><span className="font-medium text-gray-900">Record:</span> {dispense.medical_record_type || "-"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dispense.items.map((item) => <span key={item.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">{item.medicine_name} | {item.batch_number} | {item.quantity}</span>)}
                  </div>
                  {dispense.prescription_snapshot && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">{dispense.prescription_snapshot}</p>}
                  {dispense.notes && <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">{dispense.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link href={`/dashboard/patients/${dispense.patient_id}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Open Patient</Link>
                  <Link href={`/dashboard/medical-records?patientId=${encodeURIComponent(dispense.patient_id)}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Open Records</Link>
                  <Link href={`/dashboard/billings?patientId=${encodeURIComponent(dispense.patient_id)}`} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"><Receipt className="h-4 w-4" />Open Billing</Link>
                </div>
              </div>
            </article>
          ))}
          {filteredDispenses.length > LIST_PREVIEW_LIMIT && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAllDispenses((current) => !current)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {showAllDispenses ? "Show less" : "Show more"}
              </button>
            </div>
          )}
          </>
        )}
      </section>
    </div>
  );
}
