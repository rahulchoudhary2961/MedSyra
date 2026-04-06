const express = require("express");
const controller = require("../controllers/crm.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { crmSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/tasks",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ query: crmSchemas.listQuery }),
  controller.listTasks
);
router.post(
  "/tasks",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ body: crmSchemas.createBody }),
  controller.createTask
);
router.patch(
  "/tasks/:id",
  authorizeRoles("full_access", "reception_access", "doctor"),
  validateRequest({ params: crmSchemas.idParams, body: crmSchemas.updateBody }),
  controller.updateTask
);

module.exports = router;
