const express = require("express");
const controller = require("../controllers/dashboard.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { dashboardSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/summary", controller.getSummary);
router.get("/reports", authorizeRoles("full_access"), validateRequest({ query: dashboardSchemas.reportsQuery }), controller.getReports);

module.exports = router;
