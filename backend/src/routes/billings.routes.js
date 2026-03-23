const express = require("express");
const controller = require("../controllers/billings.controller");
const validateRequest = require("../middlewares/validate-request");
const { billingsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", validateRequest({ query: billingsSchemas.listQuery }), controller.listInvoices);
router.post("/", validateRequest({ body: billingsSchemas.createBody }), controller.createInvoice);
router.get("/:id", validateRequest({ params: billingsSchemas.idParams }), controller.getInvoice);
router.patch(
  "/:id",
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.updateBody }),
  controller.updateInvoice
);
router.post(
  "/:id/issue",
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.issueBody }),
  controller.issueInvoice
);
router.post(
  "/:id/payments",
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.paymentBody }),
  controller.recordPayment
);
router.get("/:id/pdf", validateRequest({ params: billingsSchemas.idParams }), controller.downloadInvoicePdf);
router.delete("/:id", validateRequest({ params: billingsSchemas.idParams }), controller.deleteInvoice);

module.exports = router;
