const express = require("express");
const controller = require("../controllers/leads.controller");
const validateRequest = require("../middlewares/validate-request");
const { leadCaptureLimiter } = require("../middlewares/abuse-protection");
const { publicSchemas } = require("../validators/schemas");

const router = express.Router();

router.post(
  "/",
  leadCaptureLimiter,
  validateRequest({ body: publicSchemas.submitLeadBody }),
  controller.submitLead
);

module.exports = router;
