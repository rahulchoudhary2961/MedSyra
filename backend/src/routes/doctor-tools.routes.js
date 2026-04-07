const express = require("express");
const controller = require("../controllers/doctor-tools.controller");
const authorizeRoles = require("../middlewares/authorize-roles");
const validateRequest = require("../middlewares/validate-request");
const { doctorToolsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get(
  "/prescription-workspace",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ query: doctorToolsSchemas.workspaceQuery }),
  controller.getPrescriptionWorkspace
);

router.post(
  "/prescription-templates",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ body: doctorToolsSchemas.templateCreateBody }),
  controller.createPrescriptionTemplate
);

router.delete(
  "/prescription-templates/:id",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ params: doctorToolsSchemas.idParams }),
  controller.deletePrescriptionTemplate
);

router.post(
  "/favorite-medicines",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ body: doctorToolsSchemas.favoriteCreateBody }),
  controller.createFavoriteMedicine
);

router.delete(
  "/favorite-medicines/:id",
  authorizeRoles("full_access", "doctor"),
  validateRequest({ params: doctorToolsSchemas.idParams }),
  controller.deleteFavoriteMedicine
);

module.exports = router;
