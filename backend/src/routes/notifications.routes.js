const express = require("express");
const controller = require("../controllers/notifications.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { notificationsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/preferences",
  authorizeRoles("full_access"),
  controller.getPreferences
);

router.patch(
  "/preferences",
  authorizeRoles("full_access"),
  validateRequest({ body: notificationsSchemas.updatePreferencesBody }),
  controller.updatePreferences
);

router.get(
  "/logs",
  authorizeRoles("full_access"),
  validateRequest({ query: notificationsSchemas.logsQuery }),
  controller.listLogs
);

module.exports = router;
