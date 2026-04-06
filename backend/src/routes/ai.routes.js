const express = require("express");
const controller = require("../controllers/ai.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { aiSchemas } = require("../validators/schemas");

const router = express.Router();

router.post(
  "/assistant",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ body: aiSchemas.askAssistantBody }),
  controller.askAssistant
);

router.get(
  "/prescription-suggestions",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ query: aiSchemas.listPrescriptionSuggestionsQuery }),
  controller.listPrescriptionSuggestions
);

router.post(
  "/prescription-suggestions/generate",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ body: aiSchemas.generatePrescriptionSuggestionBody }),
  controller.generatePrescriptionSuggestion
);

router.patch(
  "/prescription-suggestions/:id/review",
  authorizeRoles("full_access", "doctor"),
  validateRequest({
    params: aiSchemas.idParams,
    body: aiSchemas.reviewPrescriptionSuggestionBody
  }),
  controller.reviewPrescriptionSuggestion
);

module.exports = router;
