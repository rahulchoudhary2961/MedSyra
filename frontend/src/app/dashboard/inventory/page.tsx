"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Pencil, Plus, RefreshCcw, Search, Trash2, TriangleAlert } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessInventory, canManageInventory } from "@/lib/roles";
import { AuthUser, InventoryItem, InventoryMovement } from "@/types/api";
import ModalCloseButton from "@/app/components/ModalCloseButton";

type MeResponse = { success: boolean; data: AuthUser };
type ItemsResponse = { success: boolean; data: { items: InventoryItem[] } };
type MovementsResponse = {
  success: boolean;
  data: {
    items: InventoryMovement[];
    stats: {
      totalInQuantity: number;
      totalOutQuantity: number;
      wastageQuantity: number;
      wastageValue: number;
    };
  };
};
type SingleResponse<T> = { success: boolean; data: T };

type ItemForm = {
  code: string;
  name: string;
  category: string;
  unit: string;
  reorderLevel: string;
};

type MovementForm = {
  itemId: string;
  movementType: InventoryMovement["movement_type"];
  quantity: string;
  unitCost: string;
  movementDate: string;
  notes: string;
};

const todayDateKey = () => new Date().toISOString().slice(0, 10);
const LIST_PREVIEW_LIMIT = 6;

const movementLabels: Record<InventoryMovement["movement_type"], string> = {
  stock_in: "Stock In",
  usage: "Usage",
  wastage: "Wastage",
  adjustment_in: "Adjustment In",
  adjustment_out: "Adjustment Out"
};

const movementTone = (movementType: InventoryMovement["movement_type"]) => {
  if (movementType === "wastage") return "bg-red-50 text-red-700 ring-red-200";
  if (movementType === "usage" || movementType === "adjustment_out") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

const formatQuantity = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatCurrency = (value: number | null | undefined) =>
  `Rs. ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const normalizeText = (value: string | null | undefined) =>
  (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const initialItemForm = (): ItemForm => ({
  code: "",
  name: "",
  category: "",
  unit: "pcs",
  reorderLevel: "0"
});

const initialMovementForm = (): MovementForm => ({
  itemId: "",
  movementType: "stock_in",
  quantity: "",
  unitCost: "",
  movementDate: todayDateKey(),
  notes: ""
});

export default function InventoryPage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementStats, setMovementStats] = useState({
    totalInQuantity: 0,
    totalOutQuantity: 0,
    wastageQuantity: 0,
    wastageValue: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showItemForm, setShowItemForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showAllLowStock, setShowAllLowStock] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const [showAllMovements, setShowAllMovements] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({ q: "", movementType: "" });
  const [itemForm, setItemForm] = useState<ItemForm>(initialItemForm());
  const [movementForm, setMovementForm] = useState<MovementForm>(initialMovementForm());
  const itemFormRef = useRef<HTMLElement | null>(null);
  const movementFormRef = useRef<HTMLElement | null>(null);

  const searchValue = normalizeText(searchTerm);
  const matchesSearch = useCallback(
    (...values: Array<string | number | null | undefined>) => {
      if (!searchValue) {
        return true;
      }

      return values.some((value) => normalizeText(String(value ?? "")).includes(searchValue));
    },
    [searchValue]
  );

  const loadItems = useCallback(async () => {
    const response = await apiRequest<ItemsResponse>("/inventory/items?limit=200", { authenticated: true });
    setItems(response.data.items || []);
  }, []);

  const loadMovements = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.movementType) params.set("movementType", filters.movementType);
    const response = await apiRequest<MovementsResponse>(`/inventory/movements?${params.toString()}`, { authenticated: true });
    setMovements(response.data.items || []);
    setMovementStats(response.data.stats || { totalInQuantity: 0, totalOutQuantity: 0, wastageQuantity: 0, wastageValue: 0 });
  }, [filters.q, filters.movementType]);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, itemsRes] = await Promise.all([
        apiRequest<MeResponse>("/auth/me", { authenticated: true }),
        apiRequest<ItemsResponse>("/inventory/items?limit=200", { authenticated: true })
      ]);
      setCurrentUser(me.data);
      setItems(itemsRes.data.items || []);
      await loadMovements();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load inventory workspace");
    } finally {
      setLoading(false);
    }
  }, [loadMovements]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const lowStockItems = useMemo(
    () => items.filter((item) => item.is_active && Number(item.current_stock || 0) <= Number(item.reorder_level || 0)),
    [items]
  );
  const filteredLowStockItems = useMemo(
    () => lowStockItems.filter((item) => matchesSearch(item.name, item.category, item.code, item.unit)),
    [lowStockItems, matchesSearch]
  );
  const filteredItems = useMemo(
    () => items.filter((item) => matchesSearch(item.name, item.category, item.code, item.unit)),
    [items, matchesSearch]
  );
  const filteredMovements = useMemo(
    () =>
      movements.filter((movement) =>
        matchesSearch(movement.item_name, movement.item_code, movement.item_category, movement.notes, movement.performed_by_name)
      ),
    [movements, matchesSearch]
  );
  const visibleLowStockItems = searchValue || showAllLowStock ? filteredLowStockItems : filteredLowStockItems.slice(0, LIST_PREVIEW_LIMIT);
  const visibleItems = searchValue || showAllItems ? filteredItems : filteredItems.slice(0, LIST_PREVIEW_LIMIT);
  const visibleMovements = searchValue || showAllMovements ? filteredMovements : filteredMovements.slice(0, LIST_PREVIEW_LIMIT);

  const openItemForm = (item?: InventoryItem) => {
    if (item) {
      setEditingItemId(item.id);
      setItemForm({
        code: item.code || "",
        name: item.name || "",
        category: item.category || "",
        unit: item.unit || "unit",
        reorderLevel: String(item.reorder_level ?? 0)
      });
    } else {
      setEditingItemId(null);
      setItemForm(initialItemForm());
    }

    setShowItemForm(true);
    requestAnimationFrame(() => {
      itemFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openMovementForm = () => {
    setShowMovementForm(true);
    requestAnimationFrame(() => {
      movementFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const deleteItem = async (item: InventoryItem) => {
    const confirmed = window.confirm(`Deactivate ${item.name}?`);
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<SingleResponse<InventoryItem>>(`/inventory/items/${item.id}`, {
        method: "DELETE",
        authenticated: true
      });
      setItems((current) => current.map((entry) => (entry.id === item.id ? response.data : entry)));
      if (editingItemId === item.id) {
        setEditingItemId(null);
        setItemForm(initialItemForm());
        setShowItemForm(false);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to deactivate consumable");
    } finally {
      setSaving(false);
    }
  };

  const submitItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isEditing = Boolean(editingItemId);
      const response = await apiRequest<SingleResponse<InventoryItem>>(
        isEditing ? `/inventory/items/${editingItemId}` : "/inventory/items",
        {
        method: isEditing ? "PATCH" : "POST",
        authenticated: true,
        body: {
          code: itemForm.code.trim() || undefined,
          name: itemForm.name.trim(),
          category: itemForm.category.trim() || undefined,
          unit: itemForm.unit.trim() || undefined,
          reorderLevel: itemForm.reorderLevel ? Number(itemForm.reorderLevel) : undefined
        }
      }
      );
      setItems((current) => {
        if (isEditing) {
          return current.map((entry) => (entry.id === response.data.id ? response.data : entry));
        }
        return [response.data, ...current];
      });
      setItemForm(initialItemForm());
      setEditingItemId(null);
      setShowItemForm(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save consumable");
    } finally {
      setSaving(false);
    }
  };

  const submitMovement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest<SingleResponse<InventoryMovement>>("/inventory/movements", {
        method: "POST",
        authenticated: true,
        body: {
          itemId: movementForm.itemId,
          movementType: movementForm.movementType,
          quantity: Number(movementForm.quantity),
          unitCost: movementForm.unitCost ? Number(movementForm.unitCost) : undefined,
          movementDate: movementForm.movementDate,
          notes: movementForm.notes.trim() || undefined
        }
      });
      setMovements((current) => [response.data, ...current.filter((movement) => movement.id !== response.data.id)]);
      setMovementForm(initialMovementForm());
      setShowMovementForm(false);
      void Promise.all([loadItems(), loadMovements()]).catch(() => undefined);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to record stock movement");
    } finally {
      setSaving(false);
    }
  };

  if (currentUser && !canAccessInventory(currentUser.role)) {
    return <p className="text-red-600">You do not have access to Inventory.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-600">Operations</p>
          <h1 className="mt-2 text-2xl text-gray-900">Inventory Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Track consumables, monitor stock alerts, record every movement, and quantify wastage without mixing it into the pharmacy workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void loadPage()} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          {canManageInventory(currentUser?.role) && (
            <button data-testid="inventory-add-item-button" type="button" onClick={() => openItemForm()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50">
              <Boxes className="h-4 w-4" />
              Add Consumable
            </button>
          )}
          <button data-testid="inventory-record-movement-button" type="button" onClick={openMovementForm} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" />
            Record Movement
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
        <label className="block text-sm text-gray-700">
          Search
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-gray-300 px-4 py-3 focus-within:border-emerald-500">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search consumables, low stock, or movements"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Consumables</p><p className="mt-3 text-2xl text-gray-900">{items.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Low Stock Alerts</p><p className="mt-3 text-2xl text-gray-900">{lowStockItems.length}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Stock In</p><p className="mt-3 text-2xl text-gray-900">{formatQuantity(movementStats.totalInQuantity)}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Stock Out</p><p className="mt-3 text-2xl text-gray-900">{formatQuantity(movementStats.totalOutQuantity)}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.14em] text-gray-500">Wastage Value</p><p className="mt-3 text-2xl text-gray-900">{formatCurrency(movementStats.wastageValue)}</p></div>
      </section>

      {showItemForm && canManageInventory(currentUser?.role) && (
        <section ref={itemFormRef} data-testid="inventory-item-form" className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Catalog</p>
              <h2 className="mt-2 text-xl text-gray-900">{editingItemId ? "Update Consumable" : "Create Consumable"}</h2>
            </div>
            <ModalCloseButton
              onClick={() => {
                setShowItemForm(false);
                setEditingItemId(null);
                setItemForm(initialItemForm());
              }}
            />
          </div>
          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitItem}>
            <input data-testid="inventory-item-code-input" value={itemForm.code} onChange={(event) => setItemForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="inventory-item-name-input" value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} placeholder="Consumable name" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input data-testid="inventory-item-category-input" value={itemForm.category} onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="inventory-item-unit-input" value={itemForm.unit} onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unit" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="inventory-item-reorder-level-input" type="number" min="0" step="0.01" value={itemForm.reorderLevel} onChange={(event) => setItemForm((current) => ({ ...current, reorderLevel: event.target.value }))} placeholder="Reorder level" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div className="lg:col-span-2 flex items-center gap-3">
              <button data-testid="inventory-item-submit-button" type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? "Saving..." : editingItemId ? "Update Consumable" : "Create Consumable"}
              </button>
              {editingItemId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingItemId(null);
                    setItemForm(initialItemForm());
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {showMovementForm && (
        <section ref={movementFormRef} data-testid="inventory-movement-form" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-700">Ledger</p>
              <h2 className="mt-2 text-xl text-gray-900">Record Stock Movement</h2>
            </div>
            <ModalCloseButton onClick={() => setShowMovementForm(false)} />
          </div>
          <form className="mt-6 grid gap-4 lg:grid-cols-2" onSubmit={submitMovement}>
            <select data-testid="inventory-movement-item-select" value={movementForm.itemId} onChange={(event) => setMovementForm((current) => ({ ...current, itemId: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
              <option value="">Select consumable</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.name} | {item.current_stock} {item.unit}</option>)}
            </select>
            <select data-testid="inventory-movement-type-select" value={movementForm.movementType} onChange={(event) => setMovementForm((current) => ({ ...current, movementType: event.target.value as InventoryMovement["movement_type"] }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input data-testid="inventory-movement-quantity-input" type="number" min="0.01" step="0.01" value={movementForm.quantity} onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="Quantity" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input data-testid="inventory-movement-unit-cost-input" type="number" min="0" step="0.01" value={movementForm.unitCost} onChange={(event) => setMovementForm((current) => ({ ...current, unitCost: event.target.value }))} placeholder="Unit cost" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input data-testid="inventory-movement-date-input" type="date" value={movementForm.movementDate} onChange={(event) => setMovementForm((current) => ({ ...current, movementDate: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            <input data-testid="inventory-movement-notes-input" value={movementForm.notes} onChange={(event) => setMovementForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes or reason" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <div className="lg:col-span-2"><button data-testid="inventory-movement-submit-button" type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60">{saving ? "Saving..." : "Record Movement"}</button></div>
          </form>
        </section>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Alerts</p>
            <h2 className="mt-2 text-xl text-gray-900">Low Stock Alerts</h2>
          </div>
          <p className="text-sm text-gray-500">Consumables at or below their reorder thresholds.</p>
        </div>
        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">Loading alerts...</div>
        ) : filteredLowStockItems.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            {searchValue ? "No low-stock consumables matched your search." : "No low-stock consumables right now."}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleLowStockItems.map((item) => (
                <article key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg text-amber-950">{item.name}</p>
                      <p className="mt-1 text-sm text-amber-800">{item.category || "General"}{item.code ? ` | ${item.code}` : ""}</p>
                    </div>
                    <TriangleAlert className="h-5 w-5 text-amber-700" />
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-amber-900">
                    <p><span className="font-medium">Current stock:</span> {formatQuantity(item.current_stock)} {item.unit}</p>
                    <p><span className="font-medium">Reorder level:</span> {formatQuantity(item.reorder_level)} {item.unit}</p>
                    <p><span className="font-medium">Last movement:</span> {formatDate(item.last_movement_date)}</p>
                  </div>
                </article>
              ))}
            </div>
            {lowStockItems.length > LIST_PREVIEW_LIMIT && (
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
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-emerald-600">Catalog</p>
            <h2 className="mt-2 text-xl text-gray-900">Consumables</h2>
          </div>
          <p className="text-sm text-gray-500">Current stock, latest cost, and wastage by item.</p>
        </div>
        {loading ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">Loading consumables...</div>
        ) : filteredItems.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            {searchValue ? "No consumables matched your search." : "No consumables added yet."}
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => (
                <article key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg text-gray-900">{item.name}</p>
                      <p className="mt-1 text-sm text-gray-600">{item.category || "General"}{item.code ? ` | ${item.code}` : ""}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{item.is_active ? "Active" : "Inactive"}</span>
                      {canManageInventory(currentUser?.role) && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openItemForm(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteItem(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-gray-600">
                    <p><span className="font-medium text-gray-900">Stock:</span> {formatQuantity(item.current_stock)} {item.unit}</p>
                    <p><span className="font-medium text-gray-900">Reorder level:</span> {formatQuantity(item.reorder_level)} {item.unit}</p>
                    <p><span className="font-medium text-gray-900">Latest unit cost:</span> {formatCurrency(item.latest_unit_cost)}</p>
                    <p><span className="font-medium text-gray-900">Wastage:</span> {formatQuantity(item.wastage_quantity)} {item.unit} ({formatCurrency(item.wastage_value)})</p>
                  </div>
                </article>
              ))}
            </div>
            {filteredItems.length > LIST_PREVIEW_LIMIT && !searchValue && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowAllItems((current) => !current)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white"
                >
                  {showAllItems ? "Show less" : "Show more"}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search consumable, category, code, or notes" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <select value={filters.movementType} onChange={(event) => setFilters((current) => ({ ...current, movementType: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All movement types</option>
            {Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </section>

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">Loading stock movements...</div>
        ) : filteredMovements.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            {searchValue || filters.q.trim() || filters.movementType
              ? "No inventory movements matched the current filters."
              : "No inventory movements recorded yet."}
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {visibleMovements.map((movement) => (
                <article key={movement.id} data-testid="inventory-movement-card" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ${movementTone(movement.movement_type)}`}>{movementLabels[movement.movement_type]}</span>
                        {movement.item_code && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">{movement.item_code}</span>}
                      </div>
                      <div>
                        <h2 className="text-xl text-gray-900">{movement.item_name}</h2>
                        <p className="mt-1 text-sm text-gray-600">
                          {movement.item_category || "General"} | {formatDate(movement.movement_date)}
                          {movement.performed_by_name ? ` | ${movement.performed_by_name}` : ""}
                        </p>
                      </div>
                      <div className="grid gap-2 text-sm text-gray-600 md:grid-cols-3">
                        <p><span className="font-medium text-gray-900">Quantity:</span> {formatQuantity(movement.quantity)} {movement.item_unit}</p>
                        <p><span className="font-medium text-gray-900">Unit Cost:</span> {formatCurrency(movement.unit_cost)}</p>
                        <p><span className="font-medium text-gray-900">Total Cost:</span> {formatCurrency(movement.total_cost)}</p>
                      </div>
                      {movement.notes && <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">{movement.notes}</p>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {filteredMovements.length > LIST_PREVIEW_LIMIT && !searchValue && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowAllMovements((current) => !current)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {showAllMovements ? "Show less" : "Show more"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
