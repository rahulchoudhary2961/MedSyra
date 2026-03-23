const asyncHandler = require("../utils/async-handler");
const appointmentsService = require("../services/appointments.service");

const listAppointments = asyncHandler(async (req, res) => {
  const data = await appointmentsService.listAppointments(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createAppointment = asyncHandler(async (req, res) => {
  const data = await appointmentsService.createAppointment(req.user.organizationId, req.body);
  res.status(201).json({ success: true, message: "Appointment created", data });
});

const getAppointment = asyncHandler(async (req, res) => {
  const data = await appointmentsService.getAppointmentById(req.user.organizationId, req.params.id);
  res.json({ success: true, data });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const data = await appointmentsService.updateAppointment(req.user.organizationId, req.params.id, req.body);
  res.json({ success: true, message: "Appointment updated", data });
});

const updateStatus = asyncHandler(async (req, res) => {
  const data = await appointmentsService.updateAppointmentStatus(
    req.user.organizationId,
    req.params.id,
    req.body.status
  );
  res.json({ success: true, message: "Appointment status updated", data });
});

const deleteAppointment = asyncHandler(async (req, res) => {
  const data = await appointmentsService.cancelAppointment(req.user.organizationId, req.params.id);
  res.json({ success: true, message: "Appointment cancelled", data });
});

module.exports = {
  listAppointments,
  createAppointment,
  getAppointment,
  updateAppointment,
  updateStatus,
  deleteAppointment
};
