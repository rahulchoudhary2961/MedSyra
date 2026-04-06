const ApiError = require("../utils/api-error");
const cache = require("../utils/cache");
const inventoryModel = require("../models/inventory.model");

const inventoryMovementTypes = new Set(["stock_in", "usage", "wastage", "adjustment_in", "adjustment_out"]);

const invalidateInventoryRelatedCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(`dashboard:summary:${organizationId}`),
    cache.invalidateByPrefix(`dashboard:reports:${organizationId}`)
  ]);
};

const listInventoryItems = async (organizationId, query) => inventoryModel.listInventoryItems(organizationId, query);

const createInventoryItem = async (organizationId, payload) => {
  const created = await inventoryModel.createInventoryItem(organizationId, payload);
  await invalidateInventoryRelatedCaches(organizationId);
  return created;
};

const updateInventoryItem = async (organizationId, id, payload) => {
  const current = await inventoryModel.getInventoryItemById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Inventory item not found");
  }

  const updated = await inventoryModel.updateInventoryItem(organizationId, id, payload);
  await invalidateInventoryRelatedCaches(organizationId);
  return updated;
};

const listInventoryMovements = async (organizationId, query) => inventoryModel.listInventoryMovements(organizationId, query);

const createInventoryMovement = async (organizationId, payload, actor = null) => {
  if (!inventoryMovementTypes.has(payload.movementType)) {
    throw new ApiError(400, "Invalid inventory movement type");
  }

  const item = await inventoryModel.getInventoryItemById(organizationId, payload.itemId);
  if (!item) {
    throw new ApiError(404, "Inventory item not found");
  }

  const created = await inventoryModel.createInventoryMovement(organizationId, payload, actor);
  await invalidateInventoryRelatedCaches(organizationId);
  return created;
};

module.exports = {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  listInventoryMovements,
  createInventoryMovement
};
