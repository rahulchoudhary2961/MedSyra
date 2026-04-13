const express = require("express");
const controller = require("../controllers/inventory.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { inventorySchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/items",
  authorizeRoles("full_access", "billing_access", "reception_access"),
  validateRequest({ query: inventorySchemas.itemsListQuery }),
  controller.listInventoryItems
);
router.post(
  "/items",
  authorizeRoles("full_access"),
  validateRequest({ body: inventorySchemas.itemCreateBody }),
  controller.createInventoryItem
);
router.patch(
  "/items/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: inventorySchemas.idParams, body: inventorySchemas.itemUpdateBody }),
  controller.updateInventoryItem
);
router.delete(
  "/items/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: inventorySchemas.idParams }),
  controller.deleteInventoryItem
);
router.get(
  "/movements",
  authorizeRoles("full_access", "billing_access", "reception_access"),
  validateRequest({ query: inventorySchemas.movementsListQuery }),
  controller.listInventoryMovements
);
router.post(
  "/movements",
  authorizeRoles("full_access", "billing_access", "reception_access"),
  validateRequest({ body: inventorySchemas.movementCreateBody }),
  controller.createInventoryMovement
);

module.exports = router;
