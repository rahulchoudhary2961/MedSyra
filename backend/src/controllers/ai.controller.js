const asyncHandler = require("../utils/async-handler");
const aiAssistantService = require("../services/ai-assistant.service");
const aiPrescriptionService = require("../services/ai-prescription.service");
const { getRequestMeta } = require("../utils/logger");

const askAssistant = asyncHandler(async (req, res) => {
  const data = await aiAssistantService.askAssistant(
    req.user.organizationId,
    req.body,
    req.user,
    req.branchContext
  );
  res.json({ success: true, message: "Assistant response generated", data });
});

const listPrescriptionSuggestions = asyncHandler(async (req, res) => {
  const data = await aiPrescriptionService.listSuggestions(
    req.user.organizationId,
    {
      ...req.query,
      branchId: req.branchContext?.readBranchId || null
    },
    req.user,
    req.branchContext
  );
  res.json({ success: true, data });
});

const generatePrescriptionSuggestion = asyncHandler(async (req, res) => {
  const data = await aiPrescriptionService.generateSuggestion(
    req.user.organizationId,
    {
      ...req.body,
      branchId: req.body.branchId || req.branchContext?.writeBranchId || null
    },
    req.user,
    getRequestMeta(req),
    req.branchContext
  );
  res.status(201).json({ success: true, message: "AI prescription suggestion generated", data });
});

const reviewPrescriptionSuggestion = asyncHandler(async (req, res) => {
  const data = await aiPrescriptionService.reviewSuggestion(
    req.user.organizationId,
    req.params.id,
    {
      ...req.body,
      branchId: req.body.branchId || req.branchContext?.writeBranchId || null
    },
    req.user,
    getRequestMeta(req),
    req.branchContext
  );
  res.json({ success: true, message: "AI prescription suggestion reviewed", data });
});

module.exports = {
  askAssistant,
  listPrescriptionSuggestions,
  generatePrescriptionSuggestion,
  reviewPrescriptionSuggestion
};
