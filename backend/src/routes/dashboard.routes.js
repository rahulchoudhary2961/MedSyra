const express = require("express");
const controller = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/summary", controller.getSummary);
router.get("/reports", controller.getReports);

module.exports = router;
