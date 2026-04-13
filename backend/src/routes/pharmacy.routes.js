const express = require("express");
const controller = require("../controllers/pharmacy.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { pharmacySchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/medicines",
  authorizeRoles("full_access", "billing_access", "reception_access", "doctor"),
  validateRequest({ query: pharmacySchemas.medicinesListQuery }),
  controller.listMedicines
);
router.get(
  "/insights",
  authorizeRoles("full_access", "billing_access", "reception_access", "doctor"),
  validateRequest({ query: pharmacySchemas.insightsQuery }),
  controller.getPharmacyInsights
);
router.post(
  "/medicines",
  authorizeRoles("full_access"),
  validateRequest({ body: pharmacySchemas.medicineCreateBody }),
  controller.createMedicine
);
router.patch(
  "/medicines/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: pharmacySchemas.idParams, body: pharmacySchemas.medicineUpdateBody }),
  controller.updateMedicine
);
router.delete(
  "/medicines/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: pharmacySchemas.idParams }),
  controller.deleteMedicine
);
router.get(
  "/batches",
  authorizeRoles("full_access", "billing_access", "reception_access", "doctor"),
  validateRequest({ query: pharmacySchemas.batchesListQuery }),
  controller.listMedicineBatches
);
router.post(
  "/batches",
  authorizeRoles("full_access"),
  validateRequest({ body: pharmacySchemas.batchCreateBody }),
  controller.createMedicineBatch
);
router.patch(
  "/batches/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: pharmacySchemas.idParams, body: pharmacySchemas.batchUpdateBody }),
  controller.updateMedicineBatch
);
router.delete(
  "/batches/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: pharmacySchemas.idParams }),
  controller.deleteMedicineBatch
);
router.get(
  "/dispenses",
  authorizeRoles("full_access", "billing_access", "reception_access", "doctor"),
  validateRequest({ query: pharmacySchemas.dispensesListQuery }),
  controller.listPharmacyDispenses
);
router.post(
  "/dispenses",
  authorizeRoles("full_access", "billing_access", "reception_access", "doctor"),
  validateRequest({ body: pharmacySchemas.dispenseCreateBody }),
  controller.createPharmacyDispense
);
router.get(
  "/dispenses/:id",
  authorizeRoles("full_access", "billing_access", "reception_access", "doctor"),
  validateRequest({ params: pharmacySchemas.idParams }),
  controller.getPharmacyDispense
);

module.exports = router;
