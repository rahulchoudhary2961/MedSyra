const express = require("express");
const controller = require("../controllers/patients.controller");
const validateRequest = require("../middlewares/validate-request");
const { patientsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", validateRequest({ query: patientsSchemas.listQuery }), controller.listPatients);
router.post("/", validateRequest({ body: patientsSchemas.createBody }), controller.createPatient);
router.get("/:id/profile", validateRequest({ params: patientsSchemas.idParams }), controller.getPatientProfile);
router.get("/:id", validateRequest({ params: patientsSchemas.idParams }), controller.getPatient);
router.patch(
  "/:id",
  validateRequest({ params: patientsSchemas.idParams, body: patientsSchemas.updateBody }),
  controller.updatePatient
);
router.delete("/:id", validateRequest({ params: patientsSchemas.idParams }), controller.deletePatient);

module.exports = router;
