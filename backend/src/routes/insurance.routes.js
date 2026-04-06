const express = require("express");
const controller = require("../controllers/insurance.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { insuranceSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/reference-data",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ query: insuranceSchemas.referenceDataQuery }),
  controller.getInsuranceReferenceData
);

router.get(
  "/providers",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ query: insuranceSchemas.providersListQuery }),
  controller.listInsuranceProviders
);
router.post(
  "/providers",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ body: insuranceSchemas.providerCreateBody }),
  controller.createInsuranceProvider
);
router.patch(
  "/providers/:id",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: insuranceSchemas.idParams, body: insuranceSchemas.providerUpdateBody }),
  controller.updateInsuranceProvider
);

router.get(
  "/claims",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ query: insuranceSchemas.claimsListQuery }),
  controller.listInsuranceClaims
);
router.post(
  "/claims",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ body: insuranceSchemas.claimCreateBody }),
  controller.createInsuranceClaim
);
router.get(
  "/claims/:id",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: insuranceSchemas.idParams }),
  controller.getInsuranceClaim
);
router.patch(
  "/claims/:id",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: insuranceSchemas.idParams, body: insuranceSchemas.claimUpdateBody }),
  controller.updateInsuranceClaim
);
router.post(
  "/claims/:id/events",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: insuranceSchemas.idParams, body: insuranceSchemas.claimEventBody }),
  controller.addInsuranceClaimEvent
);

module.exports = router;
