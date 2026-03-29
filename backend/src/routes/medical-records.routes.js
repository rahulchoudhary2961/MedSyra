const express = require("express");
const controller = require("../controllers/medical-records.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { medicalRecordsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ query: medicalRecordsSchemas.listQuery }),
  controller.listMedicalRecords
);
router.post(
  "/",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ body: medicalRecordsSchemas.createBody }),
  controller.createMedicalRecord
);
router.post(
  "/upload",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ body: medicalRecordsSchemas.uploadBody }),
  controller.uploadMedicalRecordAttachment
);
router.get(
  "/:id",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ params: medicalRecordsSchemas.idParams }),
  controller.getMedicalRecord
);
router.patch(
  "/:id",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ params: medicalRecordsSchemas.idParams, body: medicalRecordsSchemas.updateBody }),
  controller.updateMedicalRecord
);
router.delete(
  "/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: medicalRecordsSchemas.idParams }),
  controller.deleteMedicalRecord
);

module.exports = router;
