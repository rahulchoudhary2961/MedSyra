const express = require("express");
const controller = require("../controllers/payments.controller");

const router = express.Router();

router.post("/webhooks/razorpay", controller.handleRazorpayWebhook);

module.exports = router;
