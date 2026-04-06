const asyncHandler = require("../utils/async-handler");
const inventoryService = require("../services/inventory.service");

const listInventoryItems = asyncHandler(async (req, res) => {
  const data = await inventoryService.listInventoryItems(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createInventoryItem = asyncHandler(async (req, res) => {
  const data = await inventoryService.createInventoryItem(req.user.organizationId, req.body);
  res.status(201).json({ success: true, message: "Inventory item created", data });
});

const updateInventoryItem = asyncHandler(async (req, res) => {
  const data = await inventoryService.updateInventoryItem(req.user.organizationId, req.params.id, req.body);
  res.json({ success: true, message: "Inventory item updated", data });
});

const listInventoryMovements = asyncHandler(async (req, res) => {
  const data = await inventoryService.listInventoryMovements(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createInventoryMovement = asyncHandler(async (req, res) => {
  const data = await inventoryService.createInventoryMovement(req.user.organizationId, req.body, req.user);
  res.status(201).json({ success: true, message: "Inventory movement recorded", data });
});

module.exports = {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  listInventoryMovements,
  createInventoryMovement
};
