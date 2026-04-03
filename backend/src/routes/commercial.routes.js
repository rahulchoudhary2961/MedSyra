const express = require("express");
const controller = require("../controllers/commercial.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { commercialSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/overview",
  authorizeRoles("full_access"),
  controller.getOverview
);
router.patch(
  "/pricing",
  authorizeRoles("full_access"),
  validateRequest({ body: commercialSchemas.updatePricingBody }),
  controller.updatePricing
);
router.post(
  "/top-ups",
  authorizeRoles("full_access"),
  validateRequest({ body: commercialSchemas.createTopUpBody }),
  controller.createTopUp
);
router.patch(
  "/platform-infra",
  authorizeRoles("full_access"),
  validateRequest({ body: commercialSchemas.updatePlatformInfraBody }),
  controller.updatePlatformInfra
);

module.exports = router;
