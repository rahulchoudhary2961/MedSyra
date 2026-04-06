"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Pill, Plus, Receipt, RefreshCcw, TriangleAlert } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessPharmacy, canManagePharmacyCatalog } from "@/lib/roles";
import { AuthUser, Doctor, MedicalRecord, Medicine, MedicineBatch, Patient, PharmacyDispense } from "@/types/api";

type ListResponse<T> = { success: boolean; data: { items: T[] } };
type SingleResponse<T> = { success: boolean; data: T };
type MeResponse = { success: boolean; data: AuthUser };

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
const money = (value: number | null | undefined) => `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMedicineForm, setShowMedicineForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [showDispenseForm, setShowDispenseForm] = useState(false);
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [medicineForm, setMedicineForm] = useState<MedicineForm>(initialMedicineForm());
  const [batchForm, setBatchForm] = useState<BatchForm>(initialBatchForm());
  const [dispenseForm, setDispenseForm] = useState<DispenseForm>(initialDispenseForm(patientFilterId));

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
      const [me, patientsRes, doctorsRes, medicinesRes, batchesRes] = await Promise.all([
        apiRequest<MeResponse>("/auth/me", { authenticated: true }),
        apiRequest<ListResponse<Patient>>("/patients?limit=100", { authenticated: true }),
        apiRequest<ListResponse<Doctor>>("/doctors?limit=100", { authenticated: true }),
        apiRequest<ListResponse<Medicine>>("/pharmacy/medicines?limit=200", { authenticated: true }),
        apiRequest<ListResponse<MedicineBatch>>("/pharmacy/batches?limit=200", { authenticated: true })
      ]);
      setCurrentUser(me.data);
      setPatients(patientsRes.data.items || []);
      setDoctors(doctorsRes.data.items || []);
      setMedicines(medicinesRes.data.items || []);
      setBatches(batchesRes.data.items || []);
      await loadDispenses();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load pharmacy workspace");
    } finally {
      setLoading(false);
    }
  }, [loadDispenses]);

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
    void loadPatientRecords(patientFilterId);
  }, [patientFilterId, loadPatientRecords]);

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
  const lowStock = useMemo(
    () => medicines.filter((medicine) => medicine.is_active && Number(medicine.current_stock || 0) <= Number(medicine.reorder_level || 0)),
    [medicines]
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

  const refreshInventory = async () => {
    const [medicinesRes, batchesRes] = await Promise.all([
      apiRequest<ListResponse<Medicine>>("/pharmacy/medicines?limit=200", { authenticated: true }),
      apiRequest<ListResponse<MedicineBatch>>("/pharmacy/batches?limit=200", { authenticated: true })
    ]);
    setMedicines(medicinesRes.data.items || []);
    setBatches(batchesRes.data.items || []);
  };

  const submitMedicine = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<SingleResponse<Medicine>>("/pharmacy/medicines", {
        method: "POST",
        authenticated: true,
        body: {
          code: medicineForm.code.trim() || undefined,
          name: medicineForm.name.trim(),
          genericName: medicineForm.genericName.trim() || undefined,
          dosageForm: medicineForm.dosageForm.trim() || undefined,
          strength: medicineForm.strength.trim() || undefined,
          unit: medicineForm.unit.trim() || undefined,
          reorderLevel: medicineForm.reorderLevel ? Number(medicineForm.reorderLevel) : undefined
        }
      });
      setMedicines((current) => [response.data, ...current]);
      setMedicineForm(initialMedicineForm());
      setShowMedicineForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save medicine");
    } finally {
      setSaving(false);
    }
  };

  const submitBatch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<SingleResponse<MedicineBatch>>("/pharmacy/batches", {
        method: "POST",
        authenticated: true,
        body: {
          medicineId: batchForm.medicineId,
          batchNumber: batchForm.batchNumber.trim(),
          manufacturer: batchForm.manufacturer.trim() || undefined,
          expiryDate: batchForm.expiryDate,
          receivedQuantity: Number(batchForm.receivedQuantity),
          purchasePrice: batchForm.purchasePrice ? Number(batchForm.purchasePrice) : undefined,
          salePrice: batchForm.salePrice ? Number(batchForm.salePrice) : undefined,
          receivedDate: batchForm.receivedDate || undefined
        }
      });
      setBatches((current) => [response.data, ...current]);
      await refreshInventory();
      setBatchForm(initialBatchForm());
      setShowBatchForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save batch");
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
      setShowDispenseForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to dispense medicines");
    } finally {
      setSaving(false);
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
              <button type="button" onClick={() => setShowMedicineForm((current) => !current)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
                <Pill className="h-4 w-4" />
                Add Medicine
              </button>
              <button type="button" onClick={() => setShowBatchForm((current) => !current)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
                <Package className="h-4 w-4" />
                Add Batch
              </button>
            </>
          )}
          <button type="button" onClick={() => setShowDispenseForm((current) => !current)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" />
            Dispense
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Medicines</p><p className="mt-3 text-2xl text-gray-900">{medicines.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Active Batches</p><p className="mt-3 text-2xl text-gray-900">{activeBatches.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Low Stock</p><p className="mt-3 text-2xl text-gray-900">{lowStock.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Expiring Soon</p><p className="mt-3 text-2xl text-gray-900">{expiring.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Dispenses</p><p className="mt-3 text-2xl text-gray-900">{dispenses.length}</p></div>
      </section>

      {showMedicineForm && canManagePharmacyCatalog(currentUser?.role) && (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Catalog</p>
              <h2 className="mt-2 text-xl text-gray-900">Create Medicine</h2>
            </div>
            <button type="button" onClick={() => setShowMedicineForm(false)} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm text-emerald-800 hover:bg-white">Close</button>
          </div>
          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitMedicine}>
            <input value={medicineForm.code} onChange={(event) => setMedicineForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={medicineForm.name} onChange={(event) => setMedicineForm((current) => ({ ...current, name: event.target.value }))} placeholder="Medicine name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input value={medicineForm.genericName} onChange={(event) => setMedicineForm((current) => ({ ...current, genericName: event.target.value }))} placeholder="Generic name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={medicineForm.dosageForm} onChange={(event) => setMedicineForm((current) => ({ ...current, dosageForm: event.target.value }))} placeholder="Dosage form" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={medicineForm.strength} onChange={(event) => setMedicineForm((current) => ({ ...current, strength: event.target.value }))} placeholder="Strength" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={medicineForm.unit} onChange={(event) => setMedicineForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unit" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input type="number" min="0" step="0.01" value={medicineForm.reorderLevel} onChange={(event) => setMedicineForm((current) => ({ ...current, reorderLevel: event.target.value }))} placeholder="Reorder level" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div className="lg:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Saving..." : "Create Medicine"}</button></div>
          </form>
        </section>
      )}

      {showBatchForm && canManagePharmacyCatalog(currentUser?.role) && (
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Inventory</p>
              <h2 className="mt-2 text-xl text-gray-900">Add Batch</h2>
            </div>
            <button type="button" onClick={() => setShowBatchForm(false)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Close</button>
          </div>
          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitBatch}>
            <select value={batchForm.medicineId} onChange={(event) => setBatchForm((current) => ({ ...current, medicineId: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
              <option value="">Select medicine</option>
              {medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} {medicine.code ? `| ${medicine.code}` : ""}</option>)}
            </select>
            <input value={batchForm.batchNumber} onChange={(event) => setBatchForm((current) => ({ ...current, batchNumber: event.target.value }))} placeholder="Batch number" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input value={batchForm.manufacturer} onChange={(event) => setBatchForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Manufacturer" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input type="date" value={batchForm.expiryDate} onChange={(event) => setBatchForm((current) => ({ ...current, expiryDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input type="number" min="0.01" step="0.01" value={batchForm.receivedQuantity} onChange={(event) => setBatchForm((current) => ({ ...current, receivedQuantity: event.target.value }))} placeholder="Received quantity" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input type="number" min="0" step="0.01" value={batchForm.purchasePrice} onChange={(event) => setBatchForm((current) => ({ ...current, purchasePrice: event.target.value }))} placeholder="Purchase price" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input type="number" min="0" step="0.01" value={batchForm.salePrice} onChange={(event) => setBatchForm((current) => ({ ...current, salePrice: event.target.value }))} placeholder="Sale price" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input type="date" value={batchForm.receivedDate} onChange={(event) => setBatchForm((current) => ({ ...current, receivedDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div className="lg:col-span-2"><button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Saving..." : "Create Batch"}</button></div>
          </form>
        </section>
      )}

      {showDispenseForm && (
        <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Dispense</p>
              <h2 className="mt-2 text-xl text-gray-900">Dispense Medicines</h2>
            </div>
            <button type="button" onClick={() => setShowDispenseForm(false)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Close</button>
          </div>
          <form className="mt-6 grid gap-4" onSubmit={submitDispense}>
            <div className="grid gap-4 lg:grid-cols-2">
              <select value={dispenseForm.patientId} onChange={(event) => setDispenseForm((current) => ({ ...current, patientId: event.target.value, medicalRecordId: "", prescriptionSnapshot: "" }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
                <option value="">Select patient</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name} | {patient.patient_code || patient.phone}</option>)}
              </select>
              <select value={dispenseForm.doctorId} onChange={(event) => setDispenseForm((current) => ({ ...current, doctorId: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Unassigned doctor</option>
                {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name} | {doctor.specialty}</option>)}
              </select>
              <select
                value={dispenseForm.medicalRecordId}
                onChange={(event) => {
                  const record = patientRecords.find((entry) => entry.id === event.target.value);
                  setDispenseForm((current) => ({ ...current, medicalRecordId: event.target.value, prescriptionSnapshot: record?.prescription || current.prescriptionSnapshot }));
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">No linked medical record</option>
                {patientRecords.map((record) => <option key={record.id} value={record.id}>{formatDate(record.record_date)} | {record.record_type}</option>)}
              </select>
              <input type="date" value={dispenseForm.dispensedDate} onChange={(event) => setDispenseForm((current) => ({ ...current, dispensedDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            </div>

            {selectedPatient && (
              <div className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-4">
                <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">Patient:</span> {selectedPatient.full_name}</p>
                <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">Patient ID:</span> {selectedPatient.patient_code || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">Phone:</span> {selectedPatient.phone || "-"}</p>
                <p className="text-sm text-gray-700"><span className="font-medium text-gray-900">Last Visit:</span> {formatDate(selectedPatient.last_visit_at)}</p>
              </div>
            )}

            <textarea value={dispenseForm.prescriptionSnapshot} onChange={(event) => setDispenseForm((current) => ({ ...current, prescriptionSnapshot: event.target.value }))} placeholder="Prescription snapshot" rows={3} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-900">Dispense lines</p>
                <button type="button" onClick={() => setDispenseForm((current) => ({ ...current, items: [...current.items, emptyDispenseItem()] }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Add line</button>
              </div>
              {dispenseForm.items.map((item, index) => (
                <div key={`item-${index}`} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[1.4fr_0.5fr_0.6fr_1fr_auto]">
                  <select value={item.medicineBatchId} onChange={(event) => applyBatch(index, event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
                    <option value="">Select batch</option>
                    {activeBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.medicine_name} | {batch.batch_number} | Stock {batch.available_quantity} | Exp {formatDate(batch.expiry_date)}</option>)}
                  </select>
                  <input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => setDispenseForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: event.target.value } : entry) }))} placeholder="Qty" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                  <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setDispenseForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, unitPrice: event.target.value } : entry) }))} placeholder="Price" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <input value={item.directions} onChange={(event) => setDispenseForm((current) => ({ ...current, items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, directions: event.target.value } : entry) }))} placeholder="Directions" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <button type="button" onClick={() => setDispenseForm((current) => ({ ...current, items: current.items.length === 1 ? [emptyDispenseItem()] : current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white">Remove</button>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <input type="checkbox" checked={dispenseForm.createInvoice} onChange={(event) => setDispenseForm((current) => ({ ...current, createInvoice: event.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
              Create linked invoice in billing
            </label>

            <textarea value={dispenseForm.notes} onChange={(event) => setDispenseForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Dispense notes" rows={3} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div><button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Saving..." : "Dispense Medicines"}</button></div>
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
        ) : medicines.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">No medicines added yet.</div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {medicines.map((medicine) => {
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
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {isLowStock && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-700"><TriangleAlert className="h-3.5 w-3.5" />Low stock</span>}
                    {Number(medicine.expiring_batch_count || 0) > 0 && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-red-700">{medicine.expiring_batch_count} expiring</span>}
                  </div>
                </article>
              );
            })}
          </div>
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
        ) : batches.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">No batches added yet.</div>
        ) : (
          <div className="mt-6 space-y-3">
            {batches.slice(0, 18).map((batch) => (
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
        ) : dispenses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">No pharmacy dispenses matched the current filters.</div>
        ) : (
          dispenses.map((dispense) => (
            <article key={dispense.id} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
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
          ))
        )}
      </section>
    </div>
  );
}
