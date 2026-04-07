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

router.get(
  "/templates",
  authorizeRoles("full_access"),
  validateRequest({ query: notificationsSchemas.templatesQuery }),
  controller.listTemplates
);

router.post(
  "/templates",
  authorizeRoles("full_access"),
  validateRequest({ body: notificationsSchemas.templateCreateBody }),
  controller.createTemplate
);

router.patch(
  "/templates/:id",
  authorizeRoles("full_access"),
  validateRequest({
    params: notificationsSchemas.idParams,
    body: notificationsSchemas.templateUpdateBody
  }),
  controller.updateTemplate
);

router.get(
  "/campaigns",
  authorizeRoles("full_access"),
  validateRequest({ query: notificationsSchemas.campaignsQuery }),
  controller.listCampaigns
);

router.post(
  "/campaigns",
  authorizeRoles("full_access"),
  validateRequest({ body: notificationsSchemas.campaignCreateBody }),
  controller.createCampaign
);

router.post(
  "/campaigns/:id/send",
  authorizeRoles("full_access"),
  validateRequest({ params: notificationsSchemas.idParams }),
  controller.sendCampaign
);

module.exports = router;
