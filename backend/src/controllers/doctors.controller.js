const asyncHandler = require("../utils/async-handler");
const doctorsService = require("../services/doctors.service");
const { getRequestMeta } = require("../utils/logger");

const listDoctors = asyncHandler(async (req, res) => {
  const data = await doctorsService.listDoctors(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createDoctor = asyncHandler(async (req, res) => {
  const data = await doctorsService.createDoctor(req.user.organizationId, req.body, req.user, getRequestMeta(req));
  res.status(201).json({ success: true, message: "Doctor created", data });
});

const deleteDoctor = asyncHandler(async (req, res) => {
  await doctorsService.deleteDoctor(req.user.organizationId, req.params.id, req.user, getRequestMeta(req));
  res.json({ success: true, message: "Doctor deleted" });
});

module.exports = {
  listDoctors,
  createDoctor,
  deleteDoctor
};
