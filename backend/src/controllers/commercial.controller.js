const asyncHandler = require("../utils/async-handler");
const commercialService = require("../services/commercial.service");

const getOverview = asyncHandler(async (req, res) => {
  const data = await commercialService.getCommercialOverview(req.user.organizationId);
  res.json({ success: true, data });
});

const updatePricing = asyncHandler(async (req, res) => {
  const data = await commercialService.updatePricingConfig(req.user.organizationId, req.body, req.user);
  res.json({ success: true, message: "Commercial pricing updated", data });
});

const createTopUp = asyncHandler(async (req, res) => {
  const data = await commercialService.createTopUp(req.user.organizationId, req.body, req.user);
  res.status(201).json({ success: true, message: "Credits added successfully", data });
});

const updatePlatformInfra = asyncHandler(async (req, res) => {
  const data = await commercialService.updatePlatformInfra(req.body, req.user);
  res.json({ success: true, message: "Platform infra updated", data });
});

module.exports = {
  getOverview,
  updatePricing,
  createTopUp,
  updatePlatformInfra
};
