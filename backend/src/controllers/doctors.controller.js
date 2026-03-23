const asyncHandler = require("../utils/async-handler");
const doctorsService = require("../services/doctors.service");

const listDoctors = asyncHandler(async (req, res) => {
  const data = await doctorsService.listDoctors(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createDoctor = asyncHandler(async (req, res) => {
  const data = await doctorsService.createDoctor(req.user.organizationId, req.body);
  res.status(201).json({ success: true, message: "Doctor created", data });
});

module.exports = {
  listDoctors,
  createDoctor
};
