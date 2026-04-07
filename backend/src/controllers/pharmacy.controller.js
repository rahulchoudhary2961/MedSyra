const asyncHandler = require("../utils/async-handler");
const pharmacyService = require("../services/pharmacy.service");
const { getRequestMeta } = require("../utils/logger");

const listMedicines = asyncHandler(async (req, res) => {
  const data = await pharmacyService.listMedicines(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const getPharmacyInsights = asyncHandler(async (req, res) => {
  const data = await pharmacyService.getPharmacyInsights(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createMedicine = asyncHandler(async (req, res) => {
  const data = await pharmacyService.createMedicine(req.user.organizationId, req.body, req.user, getRequestMeta(req));
  res.status(201).json({ success: true, message: "Medicine created", data });
});

const updateMedicine = asyncHandler(async (req, res) => {
  const data = await pharmacyService.updateMedicine(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.json({ success: true, message: "Medicine updated", data });
});

const listMedicineBatches = asyncHandler(async (req, res) => {
  const data = await pharmacyService.listMedicineBatches(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createMedicineBatch = asyncHandler(async (req, res) => {
  const data = await pharmacyService.createMedicineBatch(
    req.user.organizationId,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.status(201).json({ success: true, message: "Medicine batch created", data });
});

const updateMedicineBatch = asyncHandler(async (req, res) => {
  const data = await pharmacyService.updateMedicineBatch(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.json({ success: true, message: "Medicine batch updated", data });
});

const listPharmacyDispenses = asyncHandler(async (req, res) => {
  const data = await pharmacyService.listPharmacyDispenses(req.user.organizationId, req.query, req.user);
  res.json({ success: true, data });
});

const getPharmacyDispense = asyncHandler(async (req, res) => {
  const data = await pharmacyService.getPharmacyDispenseById(req.user.organizationId, req.params.id, req.user);
  res.json({ success: true, data });
});

const createPharmacyDispense = asyncHandler(async (req, res) => {
  const data = await pharmacyService.createPharmacyDispense(
    req.user.organizationId,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.status(201).json({ success: true, message: "Pharmacy dispense created", data });
});

module.exports = {
  listMedicines,
  getPharmacyInsights,
  createMedicine,
  updateMedicine,
  listMedicineBatches,
  createMedicineBatch,
  updateMedicineBatch,
  listPharmacyDispenses,
  getPharmacyDispense,
  createPharmacyDispense
};
