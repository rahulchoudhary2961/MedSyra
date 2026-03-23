const asyncHandler = require("../utils/async-handler");
const patientsService = require("../services/patients.service");

const listPatients = asyncHandler(async (req, res) => {
  const data = await patientsService.listPatients(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createPatient = asyncHandler(async (req, res) => {
  const data = await patientsService.createPatient(req.user.organizationId, req.body);
  res.status(201).json({ success: true, message: "Patient created", data });
});

const getPatient = asyncHandler(async (req, res) => {
  const data = await patientsService.getPatientById(req.user.organizationId, req.params.id);
  res.json({ success: true, data });
});

const updatePatient = asyncHandler(async (req, res) => {
  const data = await patientsService.updatePatient(req.user.organizationId, req.params.id, req.body);
  res.json({ success: true, message: "Patient updated", data });
});

const deletePatient = asyncHandler(async (req, res) => {
  await patientsService.deletePatient(req.user.organizationId, req.params.id);
  res.json({ success: true, message: "Patient deleted" });
});

module.exports = {
  listPatients,
  createPatient,
  getPatient,
  updatePatient,
  deletePatient
};
