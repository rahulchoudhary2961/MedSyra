const asyncHandler = require("../utils/async-handler");
const { getRequestMeta } = require("../utils/logger");
const doctorToolsService = require("../services/doctor-tools.service");

const getPrescriptionWorkspace = asyncHandler(async (req, res) => {
  const data = await doctorToolsService.getPrescriptionWorkspace(
    req.user.organizationId,
    req.query,
    req.user,
    req.branchContext
  );

  res.json({ success: true, data });
});

const createPrescriptionTemplate = asyncHandler(async (req, res) => {
  const data = await doctorToolsService.createPrescriptionTemplate(
    req.user.organizationId,
    req.body,
    req.user,
    req.branchContext,
    getRequestMeta(req)
  );

  res.status(201).json({ success: true, message: "Prescription template created", data });
});

const deletePrescriptionTemplate = asyncHandler(async (req, res) => {
  await doctorToolsService.deletePrescriptionTemplate(
    req.user.organizationId,
    req.params.id,
    req.user,
    getRequestMeta(req)
  );

  res.json({ success: true, message: "Prescription template deleted" });
});

const createFavoriteMedicine = asyncHandler(async (req, res) => {
  const data = await doctorToolsService.createFavoriteMedicine(
    req.user.organizationId,
    req.body,
    req.user,
    req.branchContext,
    getRequestMeta(req)
  );

  res.status(201).json({ success: true, message: "Favorite medicine saved", data });
});

const deleteFavoriteMedicine = asyncHandler(async (req, res) => {
  await doctorToolsService.deleteFavoriteMedicine(
    req.user.organizationId,
    req.params.id,
    req.user,
    getRequestMeta(req)
  );

  res.json({ success: true, message: "Favorite medicine removed" });
});

module.exports = {
  getPrescriptionWorkspace,
  createPrescriptionTemplate,
  deletePrescriptionTemplate,
  createFavoriteMedicine,
  deleteFavoriteMedicine
};
