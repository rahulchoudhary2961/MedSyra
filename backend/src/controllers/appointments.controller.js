const asyncHandler = require("../utils/async-handler");
const appointmentsService = require("../services/appointments.service");

const listAppointments = asyncHandler(async (req, res) => {
  const data = await appointmentsService.listAppointments(req.user.organizationId, req.query, req.user);
  res.json({ success: true, data });
});

const createAppointment = asyncHandler(async (req, res) => {
  const data = await appointmentsService.createAppointment(req.user.organizationId, req.body, req.user);
  res.status(201).json({ success: true, message: "Appointment created", data });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const data = await appointmentsService.updateAppointment(req.user.organizationId, req.params.id, req.body, req.user);
  res.json({ success: true, message: "Appointment updated", data });
});

const completeConsultation = asyncHandler(async (req, res) => {
  const data = await appointmentsService.completeConsultation(req.user.organizationId, req.params.id, req.body, req.user);
  res.json({ success: true, message: "Consultation completed", data });
});

const sendAppointmentReminder = asyncHandler(async (req, res) => {
  const data = await appointmentsService.generateAppointmentReminder(
    req.user.organizationId,
    req.params.id,
    req.user
  );
  res.json({ success: true, message: "Appointment reminder generated", data });
});

const deleteAppointment = asyncHandler(async (req, res) => {
  await appointmentsService.deleteAppointment(req.user.organizationId, req.params.id, req.user);
  res.json({ success: true, message: "Appointment deleted" });
});

const bulkCancelAppointments = asyncHandler(async (req, res) => {
  const data = await appointmentsService.bulkCancelAppointments(req.user.organizationId, req.body, req.user);
  res.json({ success: true, message: "Appointments cancelled", data });
});

module.exports = {
  listAppointments,
  createAppointment,
  updateAppointment,
  completeConsultation,
  sendAppointmentReminder,
  deleteAppointment,
  bulkCancelAppointments
};
