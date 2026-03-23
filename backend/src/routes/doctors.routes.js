const express = require("express");
const controller = require("../controllers/doctors.controller");
const validateRequest = require("../middlewares/validate-request");
const { doctorsSchemas } = require("../validators/schemas");

const router = express.Router();

router.get("/", validateRequest({ query: doctorsSchemas.listQuery }), controller.listDoctors);
router.post("/", validateRequest({ body: doctorsSchemas.createBody }), controller.createDoctor);

module.exports = router;
