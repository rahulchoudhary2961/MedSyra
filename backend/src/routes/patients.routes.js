const express = require("express");
const controller = require("../controllers/patients.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { patientsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", authorizeRoles("full_access", "reception_access", "doctor"), validateRequest({ query: patientsSchemas.listQuery }), controller.listPatients);
router.post("/", authorizeRoles("full_access", "reception_access"), validateRequest({ body: patientsSchemas.createBody }), controller.createPatient);
router.get("/:id/profile", authorizeRoles("full_access", "reception_access", "doctor"), validateRequest({ params: patientsSchemas.idParams }), controller.getPatientProfile);
router.get("/:id", authorizeRoles("full_access", "reception_access", "doctor"), validateRequest({ params: patientsSchemas.idParams }), controller.getPatient);
router.patch(
  "/:id",
  authorizeRoles("full_access", "reception_access"),
  validateRequest({ params: patientsSchemas.idParams, body: patientsSchemas.updateBody }),
  controller.updatePatient
);
router.delete("/:id", authorizeRoles("full_access"), validateRequest({ params: patientsSchemas.idParams }), controller.deletePatient);

module.exports = router;
