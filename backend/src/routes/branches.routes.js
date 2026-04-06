const express = require("express");
const controller = require("../controllers/branches.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { branchesSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/",
  authorizeRoles("full_access"),
  validateRequest({ query: branchesSchemas.listQuery }),
  controller.listBranches
);

router.post(
  "/",
  authorizeRoles("full_access"),
  validateRequest({ body: branchesSchemas.createBody }),
  controller.createBranch
);

router.patch(
  "/:id",
  authorizeRoles("full_access"),
  validateRequest({ params: branchesSchemas.idParams, body: branchesSchemas.updateBody }),
  controller.updateBranch
);

module.exports = router;
