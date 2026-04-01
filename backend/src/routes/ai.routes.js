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

module.exports = router;
