const express = require("express");
const controller = require("../controllers/appointments.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { appointmentsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ query: appointmentsSchemas.listQuery }),
  controller.listAppointments
);
router.post(
  "/",
  authorizeRoles("full_access", "reception_access"),
  validateRequest({ body: appointmentsSchemas.createBody }),
  controller.createAppointment
);
router.post(
  "/bulk-cancel",
  authorizeRoles("full_access", "reception_access"),
  validateRequest({ body: appointmentsSchemas.bulkCancelBody }),
  controller.bulkCancelAppointments
);
router.post(
  "/:id/complete-consultation",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ params: appointmentsSchemas.idParams, body: appointmentsSchemas.completeConsultationBody }),
  controller.completeConsultation
);
router.patch(
  "/:id",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ params: appointmentsSchemas.idParams, body: appointmentsSchemas.updateBody }),
  controller.updateAppointment
);
router.delete(
  "/:id",
  authorizeRoles("full_access", "reception_access"),
  validateRequest({ params: appointmentsSchemas.idParams }),
  controller.deleteAppointment
);

module.exports = router;
