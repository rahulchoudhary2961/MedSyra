const asyncHandler = require("../utils/async-handler");
const aiAssistantService = require("../services/ai-assistant.service");

const askAssistant = asyncHandler(async (req, res) => {
  const data = await aiAssistantService.askAssistant(req.user.organizationId, req.body, req.user);
  res.json({ success: true, message: "Assistant response generated", data });
});

module.exports = {
  askAssistant
};
