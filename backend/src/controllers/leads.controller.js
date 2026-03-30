const asyncHandler = require("../utils/async-handler");
const leadsService = require("../services/leads.service");
const { getRequestMeta, logInfo, logWarn } = require("../utils/logger");

const submitLead = asyncHandler(async (req, res) => {
  try {
    const result = await leadsService.submitLead(req.body);
    logInfo("landing_lead_submitted", {
      ...getRequestMeta(req),
      email: req.body.email,
      clinicName: req.body.clinicName
    });

    res.status(201).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    logWarn("landing_lead_failed", {
      ...getRequestMeta(req),
      email: req.body?.email,
      reason: error.message
    });
    throw error;
  }
});

module.exports = {
  submitLead
};
