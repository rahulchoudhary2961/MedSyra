const express = require("express");
const controller = require("../controllers/billings.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { billingsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ query: billingsSchemas.listQuery }),
  controller.listInvoices
);
router.post(
  "/",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ body: billingsSchemas.createBody }),
  controller.createInvoice
);
router.get(
  "/reconciliation",
  authorizeRoles("full_access", "billing_access"),
  controller.getReconciliationReport
);
router.post(
  "/:id/payment-links",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.paymentLinkBody }),
  controller.createPaymentLink
);
router.post(
  "/:id/payment-links/:linkId/refresh",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.paymentLinkParams, body: billingsSchemas.paymentLinkBody }),
  controller.refreshPaymentLink
);
router.get(
  "/:id",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.idParams }),
  controller.getInvoice
);
router.patch(
  "/:id",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.updateBody }),
  controller.updateInvoice
);
router.post(
  "/:id/issue",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.issueBody }),
  controller.issueInvoice
);
router.post(
  "/:id/payments",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.paymentBody }),
  controller.recordPayment
);
router.post(
  "/:id/refunds",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.refundBody }),
  controller.refundPayment
);
router.post(
  "/:id/mark-paid",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.idParams, body: billingsSchemas.quickPayBody }),
  controller.markInvoicePaid
);
router.get(
  "/:id/pdf",
  authorizeRoles("full_access", "billing_access"),
  validateRequest({ params: billingsSchemas.idParams }),
  controller.downloadInvoicePdf
);
router.delete(
  "/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: billingsSchemas.idParams }),
  controller.deleteInvoice
);

module.exports = router;
