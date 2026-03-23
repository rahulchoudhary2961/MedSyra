const express = require("express");
const controller = require("../controllers/appointments.controller");
const validateRequest = require("../middlewares/validate-request");
const { appointmentsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", validateRequest({ query: appointmentsSchemas.listQuery }), controller.listAppointments);
router.post("/", validateRequest({ body: appointmentsSchemas.createBody }), controller.createAppointment);
router.get("/:id", validateRequest({ params: appointmentsSchemas.idParams }), controller.getAppointment);
router.patch(
  "/:id",
  validateRequest({
    params: appointmentsSchemas.idParams,
    body: appointmentsSchemas.updateBody
  }),
  controller.updateAppointment
);
router.patch(
  "/:id/status",
  validateRequest({
    params: appointmentsSchemas.updateStatusParams,
    body: appointmentsSchemas.updateStatusBody
  }),
  controller.updateStatus
);
router.delete("/:id", validateRequest({ params: appointmentsSchemas.idParams }), controller.deleteAppointment);

module.exports = router;
