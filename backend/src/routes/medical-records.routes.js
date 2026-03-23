const express = require("express");
const controller = require("../controllers/medical-records.controller");
const validateRequest = require("../middlewares/validate-request");
const { medicalRecordsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", validateRequest({ query: medicalRecordsSchemas.listQuery }), controller.listMedicalRecords);
router.post("/", validateRequest({ body: medicalRecordsSchemas.createBody }), controller.createMedicalRecord);
router.get("/:id", validateRequest({ params: medicalRecordsSchemas.idParams }), controller.getMedicalRecord);
router.patch(
  "/:id",
  validateRequest({ params: medicalRecordsSchemas.idParams, body: medicalRecordsSchemas.updateBody }),
  controller.updateMedicalRecord
);
router.delete("/:id", validateRequest({ params: medicalRecordsSchemas.idParams }), controller.deleteMedicalRecord);

module.exports = router;
