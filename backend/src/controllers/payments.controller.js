const asyncHandler = require("../utils/async-handler");
const onlinePaymentsService = require("../services/online-payments.service");

const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const data = await onlinePaymentsService.handleRazorpayWebhook({
    rawBody: req.rawBody,
    signature: req.headers["x-razorpay-signature"],
    body: req.body
  });

  res.json({ success: true, data });
});

module.exports = {
  handleRazorpayWebhook
};
