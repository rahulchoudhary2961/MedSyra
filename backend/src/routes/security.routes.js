const express = require("express");
const controller = require("../controllers/security.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { securitySchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/overview",
  authorizeRoles("full_access"),
  validateRequest({ query: securitySchemas.overviewQuery }),
  controller.getOverview
);

router.get(
  "/audit-logs",
  authorizeRoles("full_access"),
  validateRequest({ query: securitySchemas.logsQuery }),
  controller.listAuditLogs
);

module.exports = router;
