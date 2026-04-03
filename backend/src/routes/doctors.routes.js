const express = require("express");
const controller = require("../controllers/doctors.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { doctorsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", authorizeRoles("full_access", "reception_access", "doctor"), validateRequest({ query: doctorsSchemas.listQuery }), controller.listDoctors);
router.post("/", authorizeRoles("full_access"), validateRequest({ body: doctorsSchemas.createBody }), controller.createDoctor);
router.delete(
  "/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: doctorsSchemas.idParams }),
  controller.deleteDoctor
);

module.exports = router;
