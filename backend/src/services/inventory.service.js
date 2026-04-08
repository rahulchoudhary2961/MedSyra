const ApiError = require("../utils/api-error");
const cache = require("../utils/cache");
const inventoryModel = require("../models/inventory.model");
const { logAuditEventSafe } = require("./audit.service");

const inventoryMovementTypes = new Set(["stock_in", "usage", "wastage", "adjustment_in", "adjustment_out"]);
const resolveBranchScopeId = (branchContext = null, fallback = null) =>
  branchContext?.readBranchId || branchContext?.writeBranchId || fallback || null;

const invalidateInventoryRelatedCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);
};

const listInventoryItems = async (organizationId, query) => inventoryModel.listInventoryItems(organizationId, query);

const createInventoryItem = async (organizationId, payload, actor = null, requestMeta = null) => {
  const created = await inventoryModel.createInventoryItem(organizationId, payload);
  await invalidateInventoryRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "inventory",
    action: "inventory_item_created",
    summary: `Inventory item created: ${created.name}`,
    entityType: "inventory_item",
    entityId: created.id,
    entityLabel: created.name,
    metadata: {
      code: created.code || null,
      category: created.category || null
    },
    afterState: created
  });

  return created;
};

const updateInventoryItem = async (organizationId, id, payload, actor = null, requestMeta = null) => {
  const current = await inventoryModel.getInventoryItemById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Inventory item not found");
  }

  const updated = await inventoryModel.updateInventoryItem(organizationId, id, payload);
  await invalidateInventoryRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "inventory",
    action: "inventory_item_updated",
    summary: `Inventory item updated: ${updated.name}`,
    entityType: "inventory_item",
    entityId: updated.id,
    entityLabel: updated.name,
    metadata: {
      code: updated.code || null,
      category: updated.category || null
    },
    beforeState: current,
    afterState: updated
  });

  return updated;
};

const listInventoryMovements = async (organizationId, query) => inventoryModel.listInventoryMovements(organizationId, query);

const createInventoryMovement = async (organizationId, payload, actor = null, requestMeta = null, branchContext = null) => {
  if (!inventoryMovementTypes.has(payload.movementType)) {
    throw new ApiError(400, "Invalid inventory movement type");
  }

  const item = await inventoryModel.getInventoryItemById(organizationId, payload.itemId);
  if (!item) {
    throw new ApiError(404, "Inventory item not found");
  }

  const normalizedPayload = {
    ...payload,
    branchId: payload.branchId || resolveBranchScopeId(branchContext, actor?.branchId)
  };

  if (!normalizedPayload.branchId) {
    throw new ApiError(400, "A branch must be selected before recording inventory movement");
  }

  const created = await inventoryModel.createInventoryMovement(organizationId, normalizedPayload, actor);
  await invalidateInventoryRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "inventory",
    action: "inventory_movement_recorded",
    summary: `Inventory movement recorded: ${normalizedPayload.movementType} for ${item.name}`,
    entityType: "inventory_movement",
    entityId: created.id,
    entityLabel: item.name,
    severity: normalizedPayload.movementType === "wastage" ? "warning" : "info",
    isDestructive: ["usage", "wastage", "adjustment_out"].includes(normalizedPayload.movementType),
    metadata: {
      itemId: item.id,
      movementType: normalizedPayload.movementType,
      quantity: normalizedPayload.quantity,
      branchId: normalizedPayload.branchId
    },
    afterState: created
  });

  return created;
};

module.exports = {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  listInventoryMovements,
  createInventoryMovement
};
