const express = require("express");
const controller = require("../controllers/dashboard.controller");
const validateRequest = require("../middlewares/validate-request");
const { dashboardSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/summary", controller.getSummary);
router.get("/reports", validateRequest({ query: dashboardSchemas.reportsQuery }), controller.getReports);

module.exports = router;
