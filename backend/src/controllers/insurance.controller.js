const asyncHandler = require("../utils/async-handler");
const { getRequestMeta } = require("../utils/logger");
const insuranceService = require("../services/insurance.service");

const listInsuranceProviders = asyncHandler(async (req, res) => {
  const data = await insuranceService.listInsuranceProviders(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const createInsuranceProvider = asyncHandler(async (req, res) => {
  const data = await insuranceService.createInsuranceProvider(
    req.user.organizationId,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.status(201).json({ success: true, message: "Insurance provider created", data });
});

const updateInsuranceProvider = asyncHandler(async (req, res) => {
  const data = await insuranceService.updateInsuranceProvider(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.json({ success: true, message: "Insurance provider updated", data });
});

const listInsuranceClaims = asyncHandler(async (req, res) => {
  const data = await insuranceService.listInsuranceClaims(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

const getInsuranceClaim = asyncHandler(async (req, res) => {
  const data = await insuranceService.getInsuranceClaimById(req.user.organizationId, req.params.id);
  res.json({ success: true, data });
});

const createInsuranceClaim = asyncHandler(async (req, res) => {
  const data = await insuranceService.createInsuranceClaim(
    req.user.organizationId,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.status(201).json({ success: true, message: "Insurance claim created", data });
});

const updateInsuranceClaim = asyncHandler(async (req, res) => {
  const data = await insuranceService.updateInsuranceClaim(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.json({ success: true, message: "Insurance claim updated", data });
});

const addInsuranceClaimEvent = asyncHandler(async (req, res) => {
  const data = await insuranceService.addInsuranceClaimEvent(
    req.user.organizationId,
    req.params.id,
    req.body,
    req.user,
    getRequestMeta(req)
  );
  res.status(201).json({ success: true, message: "Insurance claim event recorded", data });
});

const getInsuranceReferenceData = asyncHandler(async (req, res) => {
  const data = await insuranceService.getInsuranceReferenceData(req.user.organizationId, req.query);
  res.json({ success: true, data });
});

module.exports = {
  listInsuranceProviders,
  createInsuranceProvider,
  updateInsuranceProvider,
  listInsuranceClaims,
  getInsuranceClaim,
  createInsuranceClaim,
  updateInsuranceClaim,
  addInsuranceClaimEvent,
  getInsuranceReferenceData
};
