"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileUp, FlaskConical, Plus, RefreshCcw } from "lucide-react";
import { apiFetch, apiRequest } from "@/lib/api";
import { canAccessLab, canManageLabCatalog } from "@/lib/roles";
import { AuthUser, Doctor, LabOrder, LabTest, Patient } from "@/types/api";
import ModalCloseButton from "@/app/components/ModalCloseButton";

type LabTestsResponse = {
  success: boolean;
  data: {
    items: LabTest[];
  };
};

type LabOrdersResponse = {
  success: boolean;
  data: {
    items: LabOrder[];
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

type DoctorsResponse = {
  success: boolean;
  data: {
    items: Doctor[];
  };
};

type MeResponse = {
  success: boolean;
  data: AuthUser;
};

type LabOrderMutationResponse = {
  success: boolean;
  data: LabOrder;
};

type LabTestMutationResponse = {
  success: boolean;
  data: LabTest;
};

type UploadReportResponse = {
  success: boolean;
  data: {
    order: LabOrder;
  };
};

type TestForm = {
  code: string;
  name: string;
  department: string;
  price: string;
  turnaroundHours: string;
  instructions: string;
};

type OrderItemForm = {
  labTestId: string;
  testName: string;
  price: string;
  resultSummary: string;
};

type OrderForm = {
  patientId: string;
  doctorId: string;
  orderedDate: string;
  dueDate: string;
  status: LabOrder["status"];
  notes: string;
  items: OrderItemForm[];
};

const labStatuses: LabOrder["status"][] = ["ordered", "sample_collected", "processing", "report_ready", "completed", "cancelled"];

const todayDateKey = () => new Date().toISOString().slice(0, 10);

const buildInitialTestForm = (): TestForm => ({
  code: "",
  name: "",
  department: "",
  price: "",
  turnaroundHours: "",
  instructions: ""
});

const buildEmptyOrderItem = (): OrderItemForm => ({
  labTestId: "",
  testName: "",
  price: "",
  resultSummary: ""
});

const buildInitialOrderForm = (patientId = ""): OrderForm => ({
  patientId,
  doctorId: "",
  orderedDate: todayDateKey(),
  dueDate: "",
  status: "ordered",
  notes: "",
  items: [buildEmptyOrderItem()]
});

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

const formatStatus = (value: string) => value.replace(/_/g, " ");

const getStatusTone = (status: LabOrder["status"]) => {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "report_ready") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "cancelled") return "bg-gray-100 text-gray-600 ring-gray-200";
  if (status === "processing" || status === "sample_collected") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
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

const extractFileNameFromDisposition = (headerValue: string | null, fallbackFileName: string) => {
  if (!headerValue) {
    return fallbackFileName;
  }

  const match = headerValue.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallbackFileName;
};

export default function LabPage() {
  const searchParams = useSearchParams();
  const patientFilterId = searchParams.get("patientId") || "";
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTestForm, setShowTestForm] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [testForm, setTestForm] = useState<TestForm>(buildInitialTestForm());
  const [orderForm, setOrderForm] = useState<OrderForm>(buildInitialOrderForm(patientFilterId));
  const [editOrderForm, setEditOrderForm] = useState<OrderForm>(buildInitialOrderForm(patientFilterId));

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (patientFilterId) params.set("patientId", patientFilterId);
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status) params.set("status", filters.status);

    const response = await apiRequest<LabOrdersResponse>(`/lab/orders?${params.toString()}`, { authenticated: true });
    setOrders(response.data.items || []);
  }, [filters.q, filters.status, patientFilterId]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const meResponse = await apiRequest<MeResponse>("/auth/me", { authenticated: true });
      setCurrentUser(meResponse.data);

      const [patientsResult, doctorsResult, testsResult] = await Promise.allSettled([
        apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true }),
        apiRequest<DoctorsResponse>("/doctors?limit=100", { authenticated: true }),
        apiRequest<LabTestsResponse>("/lab/tests?limit=200", { authenticated: true })
      ]);

      if (patientsResult.status === "fulfilled") {
        setPatients(patientsResult.value.data.items || []);
      }

      if (doctorsResult.status === "fulfilled") {
        setDoctors(doctorsResult.value.data.items || []);
      }

      if (testsResult.status === "fulfilled") {
        setTests(testsResult.value.data.items || []);
      }

      await loadOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load lab workspace");
    } finally {
      setLoading(false);
    }
  }, [loadOrders]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setOrderForm(buildInitialOrderForm(patientFilterId));
  }, [patientFilterId]);

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

  const activeTests = useMemo(() => tests.filter((test) => test.is_active), [tests]);
  const orderSummary = useMemo(() => ({
    total: orders.length,
    inProgress: orders.filter((order) => ["ordered", "sample_collected", "processing"].includes(order.status)).length,
    ready: orders.filter((order) => order.status === "report_ready").length,
    completed: orders.filter((order) => order.status === "completed").length
  }), [orders]);
  const patientOptions = useMemo(
    () => patients.map((patient) => ({ id: patient.id, label: `${patient.full_name} | ${patient.patient_code || patient.phone}` })),
    [patients]
  );

  const applyTestSelection = (items: OrderItemForm[], index: number, labTestId: string) => {
    const selectedTest = tests.find((test) => test.id === labTestId);
    return items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (!selectedTest) return { ...item, labTestId, testName: "", price: "" };
      return { ...item, labTestId, testName: selectedTest.name, price: String(selectedTest.price || "") };
    });
  };

  const buildOrderPayload = (form: OrderForm) => ({
    patientId: form.patientId,
    doctorId: form.doctorId || undefined,
    orderedDate: form.orderedDate,
    dueDate: form.dueDate || undefined,
    status: form.status,
    notes: form.notes.trim() || undefined,
    items: form.items
      .filter((item) => item.labTestId || item.testName.trim())
      .map((item) => ({
        labTestId: item.labTestId || undefined,
        testName: item.labTestId ? undefined : item.testName.trim(),
        price: item.price ? Number(item.price) : undefined,
        resultSummary: item.resultSummary.trim() || undefined
      }))
  });

  const resetEditOrder = (order: LabOrder) => {
    setSelectedOrder(order);
    setReportFile(null);
    setEditOrderForm({
      patientId: order.patient_id,
      doctorId: order.doctor_id || "",
      orderedDate: order.ordered_date,
      dueDate: order.due_date || "",
      status: order.status,
      notes: order.notes || "",
      items: order.items.map((item) => ({
        labTestId: item.lab_test_id || "",
        testName: item.test_name,
        price: String(item.price || ""),
        resultSummary: item.result_summary || ""
      }))
    });
  };

  const submitTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await apiRequest<LabTestMutationResponse>("/lab/tests", {
        method: "POST",
        authenticated: true,
        body: {
          code: testForm.code.trim() || undefined,
          name: testForm.name.trim(),
          department: testForm.department.trim() || undefined,
          price: Number(testForm.price),
          turnaroundHours: testForm.turnaroundHours ? Number(testForm.turnaroundHours) : undefined,
          instructions: testForm.instructions.trim() || undefined
        }
      });

      setTestForm(buildInitialTestForm());
      setShowTestForm(false);
      setTests((current) => [response.data, ...current.filter((test) => test.id !== response.data.id)]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save lab test");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await apiRequest<LabOrderMutationResponse>("/lab/orders", {
        method: "POST",
        authenticated: true,
        body: buildOrderPayload(orderForm)
      });

      setOrders((current) => [response.data, ...current.filter((order) => order.id !== response.data.id)]);
      setOrderForm(buildInitialOrderForm(patientFilterId));
      setShowOrderForm(false);
      void loadOrders().catch(() => undefined);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create lab order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitOrderUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedOrder) return;

    setIsSubmitting(true);
    setError("");

    try {
      await apiRequest<LabOrderMutationResponse>(`/lab/orders/${selectedOrder.id}`, {
        method: "PATCH",
        authenticated: true,
        body: {
          doctorId: editOrderForm.doctorId || undefined,
          orderedDate: editOrderForm.orderedDate,
          dueDate: editOrderForm.dueDate || null,
          status: editOrderForm.status,
          notes: editOrderForm.notes.trim() || null,
          items: buildOrderPayload(editOrderForm).items
        }
      });

      setSelectedOrder(null);
      await loadOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update lab order");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTestActive = async (test: LabTest) => {
    setIsSubmitting(true);
    setError("");

    try {
      await apiRequest<LabTestMutationResponse>(`/lab/tests/${test.id}`, {
        method: "PATCH",
        authenticated: true,
        body: {
          isActive: !test.is_active
        }
      });

      const testsResponse = await apiRequest<LabTestsResponse>("/lab/tests?limit=200", { authenticated: true });
      setTests(testsResponse.data.items || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update test status");
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadReport = async () => {
    if (!selectedOrder || !reportFile) return;

    setIsSubmitting(true);
    setError("");

    try {
      const dataBase64 = await fileToBase64(reportFile);
      await apiRequest<UploadReportResponse>(`/lab/orders/${selectedOrder.id}/report`, {
        method: "POST",
        authenticated: true,
        body: {
          fileName: reportFile.name,
          contentType: reportFile.type || "application/pdf",
          dataBase64
        }
      });

      setReportFile(null);
      await loadOrders();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to upload lab report");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadReport = async (order: LabOrder) => {
    try {
      const response = await apiFetch(`/lab/orders/${order.id}/report`, {
        method: "GET",
        authenticated: true,
        cache: "no-store"
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "Failed to download report");
      }

      const blob = await response.blob();
      const fileName = extractFileNameFromDisposition(
        response.headers.get("content-disposition"),
        `${order.order_number}-report.pdf`
      );

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to download report");
    }
  };

  if (currentUser && !canAccessLab(currentUser.role)) {
    return <p className="text-red-600">You do not have access to Lab.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-600">Diagnostics</p>
          <h1 className="mt-2 text-2xl text-gray-900">Lab Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Manage test catalog entries, book diagnostic orders, track order status, and upload final reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void loadPage()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          {canManageLabCatalog(currentUser?.role) && (
            <button
              data-testid="lab-add-test-button"
              type="button"
              onClick={() => setShowTestForm((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
            >
              <FlaskConical className="h-4 w-4" />
              Add Test
            </button>
          )}
          <button
            data-testid="lab-book-order-button"
            type="button"
            onClick={() => setShowOrderForm((current) => !current)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Book Test
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Catalog Tests</p>
          <p className="mt-3 text-2xl text-gray-900">{tests.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Active Tests</p>
          <p className="mt-3 text-2xl text-gray-900">{activeTests.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Open Orders</p>
          <p className="mt-3 text-2xl text-gray-900">{orderSummary.inProgress}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Reports Ready</p>
          <p className="mt-3 text-2xl text-gray-900">{orderSummary.ready}</p>
        </div>
      </section>

      {showTestForm && canManageLabCatalog(currentUser?.role) && (
        <section data-testid="lab-test-form" className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Catalog</p>
              <h2 className="mt-2 text-xl text-gray-900">Create Lab Test</h2>
            </div>
            <ModalCloseButton onClick={() => setShowTestForm(false)} />
          </div>

          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitTest}>
            <label className="space-y-2">
              <span className="text-sm text-gray-700">Code</span>
              <input data-testid="lab-test-code-input" value={testForm.code} onChange={(event) => setTestForm((current) => ({ ...current, code: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-gray-700">Test Name</span>
              <input data-testid="lab-test-name-input" value={testForm.name} onChange={(event) => setTestForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" required />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-gray-700">Department</span>
              <input data-testid="lab-test-department-input" value={testForm.department} onChange={(event) => setTestForm((current) => ({ ...current, department: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-gray-700">Price</span>
              <input data-testid="lab-test-price-input" type="number" min="0" step="0.01" value={testForm.price} onChange={(event) => setTestForm((current) => ({ ...current, price: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" required />
            </label>
            <label className="space-y-2">
              <span className="text-sm text-gray-700">Turnaround Hours</span>
              <input data-testid="lab-test-turnaround-input" type="number" min="0" step="1" value={testForm.turnaroundHours} onChange={(event) => setTestForm((current) => ({ ...current, turnaroundHours: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm text-gray-700">Instructions</span>
              <textarea data-testid="lab-test-instructions-input" rows={3} value={testForm.instructions} onChange={(event) => setTestForm((current) => ({ ...current, instructions: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
            </label>
            <div className="lg:col-span-2">
              <button data-testid="lab-test-submit-button" type="submit" disabled={isSubmitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Saving..." : "Create Test"}
              </button>
            </div>
          </form>
        </section>
      )}

      {showOrderForm && (
        <section data-testid="lab-order-form" className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Booking</p>
              <h2 className="mt-2 text-xl text-gray-900">Create Lab Order</h2>
            </div>
            <ModalCloseButton onClick={() => setShowOrderForm(false)} />
          </div>

          <form className="mt-6 grid gap-4" onSubmit={submitOrder}>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Patient</span>
                <select data-testid="lab-order-patient-select" value={orderForm.patientId} onChange={(event) => setOrderForm((current) => ({ ...current, patientId: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" required>
                  <option value="">Select patient</option>
                  {patientOptions.map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Doctor</span>
                <select data-testid="lab-order-doctor-select" value={orderForm.doctorId} onChange={(event) => setOrderForm((current) => ({ ...current, doctorId: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring">
                  <option value="">Unassigned</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.full_name} | {doctor.specialty}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Ordered Date</span>
                <input data-testid="lab-order-ordered-date-input" type="date" value={orderForm.orderedDate} onChange={(event) => setOrderForm((current) => ({ ...current, orderedDate: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Due Date</span>
                <input data-testid="lab-order-due-date-input" type="date" value={orderForm.dueDate} onChange={(event) => setOrderForm((current) => ({ ...current, dueDate: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
              </label>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Ordered Tests</p>
                  <p className="text-sm text-gray-600">Pick from the catalog or add a custom diagnostic line.</p>
                </div>
                <button type="button" onClick={() => setOrderForm((current) => ({ ...current, items: [...current.items, buildEmptyOrderItem()] }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Add Line
                </button>
              </div>

              {orderForm.items.map((item, index) => (
                <div key={`new-item-${index}`} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[1.2fr_1fr_0.7fr_auto]">
                  <select data-testid={index === 0 ? "lab-order-item-test-select" : undefined} value={item.labTestId} onChange={(event) => setOrderForm((current) => ({ ...current, items: applyTestSelection(current.items, index, event.target.value) }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring">
                    <option value="">Custom test</option>
                    {activeTests.map((test) => (
                      <option key={test.id} value={test.id}>{test.name} {test.code ? `| ${test.code}` : ""}</option>
                    ))}
                  </select>
                  <input data-testid={index === 0 ? "lab-order-item-name-input" : undefined} value={item.testName} onChange={(event) => setOrderForm((current) => ({ ...current, items: current.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, testName: event.target.value } : entry) }))} placeholder="Test name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
                  <input data-testid={index === 0 ? "lab-order-item-price-input" : undefined} type="number" min="0" step="0.01" value={item.price} onChange={(event) => setOrderForm((current) => ({ ...current, items: current.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, price: event.target.value } : entry) }))} placeholder="Price" className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
                  <button type="button" onClick={() => setOrderForm((current) => ({ ...current, items: current.items.length === 1 ? [buildEmptyOrderItem()] : current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white">
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <label className="space-y-2">
              <span className="text-sm text-gray-700">Notes</span>
              <textarea data-testid="lab-order-notes-input" rows={3} value={orderForm.notes} onChange={(event) => setOrderForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Clinical note or collection instruction" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
            </label>

            <div>
              <button data-testid="lab-order-submit-button" type="submit" disabled={isSubmitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Saving..." : "Create Lab Order"}
              </button>
            </div>
          </form>
        </section>
      )}

      {canManageLabCatalog(currentUser?.role) && (
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Catalog</p>
            <h2 className="mt-2 text-xl text-gray-900">Lab Test Catalog</h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tests.map((test) => (
              <article key={test.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg text-gray-900">{test.name}</p>
                    <p className="mt-1 text-sm text-gray-600">{test.department || "General"} {test.code ? `| ${test.code}` : ""}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${test.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {test.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-700">Rs. {Number(test.price || 0).toLocaleString()}</p>
                <p className="mt-1 text-sm text-gray-600">Turnaround {test.turnaround_hours ? `${test.turnaround_hours} hr` : "not set"}</p>
                {test.instructions && <p className="mt-3 text-sm leading-6 text-gray-600">{test.instructions}</p>}
                <button type="button" onClick={() => void toggleTestActive(test)} className="mt-4 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white">
                  {test.is_active ? "Deactivate" : "Activate"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <label className="space-y-2">
            <span className="text-sm text-gray-700">Search Orders</span>
            <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Order number, patient, or test name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
          </label>
          <label className="space-y-2">
            <span className="text-sm text-gray-700">Status</span>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring">
              <option value="">All statuses</option>
              {labStatuses.map((status) => (
                <option key={status} value={status}>{formatStatus(status)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
            Loading lab workspace...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            No lab orders matched the current filters.
          </div>
        ) : (
          orders.map((order) => (
            <article key={order.id} data-testid="lab-order-card" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${getStatusTone(order.status)}`}>
                      {formatStatus(order.status)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">
                      {order.order_number}
                    </span>
                    {order.report_file_url && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                        Report attached
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl text-gray-900">{order.patient_name}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {order.patient_code ? `${order.patient_code} | ` : ""}
                      Ordered {formatDate(order.ordered_date)}
                      {order.doctor_name ? ` | ${order.doctor_name}` : ""}
                    </p>
                  </div>
                  <div className="grid gap-3 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                    <p><span className="font-medium text-gray-900">Due:</span> {formatDate(order.due_date)}</p>
                    <p><span className="font-medium text-gray-900">Booked By:</span> {order.ordered_by_name || "-"}</p>
                    <p><span className="font-medium text-gray-900">Items:</span> {order.items.length}</p>
                    <p><span className="font-medium text-gray-900">Completed:</span> {formatDate(order.completed_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {order.items.map((item) => (
                      <span key={item.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                        {item.test_name}
                      </span>
                    ))}
                  </div>
                  {order.notes && (
                    <p className="max-w-3xl rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">
                      {order.notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link href={`/dashboard/patients/${order.patient_id}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Open Patient
                  </Link>
                  {order.report_file_url && (
                    <button type="button" onClick={() => void downloadReport(order)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <Download className="h-4 w-4" />
                      Download Report
                    </button>
                  )}
                  <button type="button" onClick={() => resetEditOrder(order)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
                    Manage Order
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {selectedOrder && (
        <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Order Workflow</p>
              <h2 className="mt-2 text-xl text-gray-900">{selectedOrder.order_number}</h2>
            </div>
            <ModalCloseButton onClick={() => setSelectedOrder(null)} />
          </div>

          <form className="mt-6 grid gap-4" onSubmit={submitOrderUpdate}>
            <div className="grid gap-4 lg:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Status</span>
                <select value={editOrderForm.status} onChange={(event) => setEditOrderForm((current) => ({ ...current, status: event.target.value as LabOrder["status"] }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring">
                  {labStatuses.map((status) => (
                    <option key={status} value={status}>{formatStatus(status)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Due Date</span>
                <input type="date" value={editOrderForm.dueDate} onChange={(event) => setEditOrderForm((current) => ({ ...current, dueDate: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
              </label>
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Doctor</span>
                <select value={editOrderForm.doctorId} onChange={(event) => setEditOrderForm((current) => ({ ...current, doctorId: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring">
                  <option value="">Unassigned</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Order Lines</p>
                <p className="text-sm text-gray-600">Update result summaries while processing or completing the order.</p>
              </div>
              {editOrderForm.items.map((item, index) => (
                <div key={`edit-item-${index}`} className="grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[1fr_0.7fr_1.2fr]">
                  <input value={item.testName} onChange={(event) => setEditOrderForm((current) => ({ ...current, items: current.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, testName: event.target.value } : entry) }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
                  <input type="number" min="0" step="0.01" value={item.price} onChange={(event) => setEditOrderForm((current) => ({ ...current, items: current.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, price: event.target.value } : entry) }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
                  <input value={item.resultSummary} onChange={(event) => setEditOrderForm((current) => ({ ...current, items: current.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, resultSummary: event.target.value } : entry) }))} placeholder="Result summary" className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
                </div>
              ))}
            </div>

            <label className="space-y-2">
              <span className="text-sm text-gray-700">Notes</span>
              <textarea rows={3} value={editOrderForm.notes} onChange={(event) => setEditOrderForm((current) => ({ ...current, notes: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-emerald-200 focus:border-emerald-400 focus:ring" />
            </label>

            <div className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:grid-cols-[1fr_auto]">
              <label className="space-y-2">
                <span className="text-sm text-gray-700">Upload Report</span>
                <input type="file" accept="application/pdf,image/*" onChange={(event) => setReportFile(event.target.files?.[0] || null)} className="block w-full text-sm text-gray-700" />
              </label>
              <div className="flex items-end">
                <button type="button" onClick={() => void uploadReport()} disabled={!reportFile || isSubmitting} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60">
                  <FileUp className="h-4 w-4" />
                  Upload Report
                </button>
              </div>
            </div>

            <div>
              <button type="submit" disabled={isSubmitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? "Saving..." : "Update Order"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
