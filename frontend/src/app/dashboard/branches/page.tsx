"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, MapPin, PencilLine, Plus, RefreshCcw } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessBranches } from "@/lib/roles";
import { Branch } from "@/types/api";

type MeResponse = {
  success: boolean;
  data: {
    role: string;
  };
};

type BranchesResponse = {
  success: boolean;
  data: {
    items: Branch[];
    summary: {
      total: number;
      active: number;
      inactive: number;
    };
  };
};

type BranchMutationResponse = {
  success: boolean;
  message: string;
  data: Branch;
};

type BranchForm = {
  branchCode: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  isActive: boolean;
  isDefault: boolean;
};

const DEFAULT_FORM: BranchForm = {
  branchCode: "",
  name: "",
  phone: "",
  email: "",
  address: "",
  timezone: "Asia/Kolkata",
  isActive: true,
  isDefault: false
};

export default function BranchesPage() {
  const [role, setRole] = useState<string>("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchForm>(DEFAULT_FORM);

  const loadBranches = async () => {
    setError("");
    setIsLoading(true);

    try {
      const [meResponse, branchesResponse] = await Promise.all([
        apiRequest<MeResponse>("/auth/me", { authenticated: true }),
        apiRequest<BranchesResponse>("/branches", { authenticated: true })
      ]);

      setRole(meResponse.data.role || "");
      setBranches(branchesResponse.data.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load branches");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const summary = useMemo(
    () => ({
      total: branches.length,
      active: branches.filter((branch) => branch.is_active).length,
      defaultBranch: branches.find((branch) => branch.is_default)?.name || "Not set"
    }),
    [branches]
  );

  const resetForm = () => {
    setEditingBranchId(null);
    setForm(DEFAULT_FORM);
  };

  const startEditing = (branch: Branch) => {
    setEditingBranchId(branch.id);
    setForm({
      branchCode: branch.branch_code || "",
      name: branch.name,
      phone: branch.phone || "",
      email: branch.email || "",
      address: branch.address || "",
      timezone: branch.timezone || "Asia/Kolkata",
      isActive: branch.is_active,
      isDefault: branch.is_default
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    const payload = {
      branchCode: form.branchCode.trim() || undefined,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      timezone: form.timezone.trim(),
      isActive: form.isActive,
      isDefault: form.isDefault
    };

    try {
      const response = editingBranchId
        ? await apiRequest<BranchMutationResponse>(`/branches/${editingBranchId}`, {
            method: "PATCH",
            authenticated: true,
            body: payload
          })
        : await apiRequest<BranchMutationResponse>("/branches", {
            method: "POST",
            authenticated: true,
            body: payload
          });

      setBranches((current) =>
        [response.data, ...current.filter((branch) => branch.id !== response.data.id)].sort((a, b) =>
          Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)
        )
      );
      setSuccess(editingBranchId ? "Branch updated" : "Branch created");
      resetForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save branch");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isLoading && role && !canAccessBranches(role)) {
    return <p className="text-red-600">You do not have access to branches.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-700">Network</p>
          <h1 className="text-gray-900 mt-2">Branch Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Configure clinic locations, set the default branch, and keep central reporting branch-aware.
          </p>
        </div>
        <button
          type="button"
          onClick={loadBranches}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {success && (
        <div className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-white p-5">
          <p className="text-sm text-gray-500">Total branches</p>
          <p className="mt-3 text-3xl text-gray-900">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-white p-5">
          <p className="text-sm text-gray-500">Active branches</p>
          <p className="mt-3 text-3xl text-gray-900">{summary.active}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-white p-5">
          <p className="text-sm text-gray-500">Default branch</p>
          <p className="mt-3 text-xl text-gray-900">{summary.defaultBranch}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-gray-900">Locations</h2>
              <p className="mt-1 text-sm text-gray-500">Branches available to your organization.</p>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-500">Loading branches...</p>
          ) : branches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500">
              No branches configured yet.
            </div>
          ) : (
            <div className="space-y-4">
              {branches.map((branch) => (
                <div key={branch.id} className="rounded-2xl border border-gray-200 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-gray-900">{branch.name}</h3>
                        {branch.is_default && (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs uppercase tracking-[0.16em] text-emerald-700">
                            Default
                          </span>
                        )}
                        <span
                          className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.16em] ${
                            branch.is_active ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {branch.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                        <p className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-emerald-600" />
                          {branch.branch_code || "Auto code"}
                        </p>
                        <p className="inline-flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-emerald-600" />
                          {branch.address || "Address not added"}
                        </p>
                        <p>{branch.phone || "Phone not added"}</p>
                        <p>{branch.email || "Email not added"}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-gray-50 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Staff</p>
                          <p className="mt-2 text-lg text-gray-900">{branch.staff_count || 0}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Today</p>
                          <p className="mt-2 text-lg text-gray-900">{branch.today_appointments || 0}</p>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">30d Revenue</p>
                          <p className="mt-2 text-lg text-gray-900">₹{Number(branch.recent_revenue || 0).toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => startEditing(branch)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <PencilLine className="h-4 w-4" />
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-gray-900">{editingBranchId ? "Edit Branch" : "Add Branch"}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {editingBranchId ? "Update location details and reporting defaults." : "Add a new location to your organization."}
              </p>
            </div>
            {editingBranchId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-emerald-700 hover:text-emerald-800"
              >
                Cancel
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-gray-700">Branch Code</label>
                <input
                  type="text"
                  value={form.branchCode}
                  onChange={(e) => setForm((current) => ({ ...current, branchCode: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="BR-002"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-700">Branch Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="Andheri Branch"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-700">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="9876543210"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-700">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="branch@clinic.com"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-700">Address</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))}
                className="min-h-[92px] w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="Full branch address"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-700">Timezone</label>
              <input
                type="text"
                value={form.timezone}
                onChange={(e) => setForm((current) => ({ ...current, timezone: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="Asia/Kolkata"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((current) => ({ ...current, isActive: e.target.checked }))}
                  className="mt-1"
                />
                <span>Keep this branch active for appointments, billing, and reporting.</span>
              </label>
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((current) => ({ ...current, isDefault: e.target.checked }))}
                  className="mt-1"
                />
                <span>Set as default branch for new staff and fallback write operations.</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {editingBranchId ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isSaving ? "Saving..." : editingBranchId ? "Update Branch" : "Create Branch"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
