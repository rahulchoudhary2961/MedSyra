const express = require("express");
const controller = require("../controllers/lab.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { labSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/tests",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ query: labSchemas.testsListQuery }),
  controller.listLabTests
);
router.post(
  "/tests",
  authorizeRoles("full_access"),
  validateRequest({ body: labSchemas.testCreateBody }),
  controller.createLabTest
);
router.patch(
  "/tests/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: labSchemas.idParams, body: labSchemas.testUpdateBody }),
  controller.updateLabTest
);
router.get(
  "/orders",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ query: labSchemas.ordersListQuery }),
  controller.listLabOrders
);
router.post(
  "/orders",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ body: labSchemas.orderCreateBody }),
  controller.createLabOrder
);
router.get(
  "/orders/:id",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ params: labSchemas.idParams }),
  controller.getLabOrder
);
router.patch(
  "/orders/:id",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ params: labSchemas.idParams, body: labSchemas.orderUpdateBody }),
  controller.updateLabOrder
);
router.post(
  "/orders/:id/report",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ params: labSchemas.idParams, body: labSchemas.uploadBody }),
  controller.uploadLabOrderReport
);
router.get(
  "/orders/:id/report",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ params: labSchemas.idParams }),
  controller.downloadLabOrderReport
);

module.exports = router;
