const express = require("express");
const authRoutes = require("./auth.routes");
const patientsRoutes = require("./patients.routes");
const doctorsRoutes = require("./doctors.routes");
const appointmentsRoutes = require("./appointments.routes");
const medicalRecordsRoutes = require("./medical-records.routes");
const billingsRoutes = require("./billings.routes");
const dashboardRoutes = require("./dashboard.routes");
const commercialRoutes = require("./commercial.routes");
const leadsRoutes = require("./leads.routes");
const aiRoutes = require("./ai.routes");
const requireAuth = require("../middlewares/require-auth");
const {
  protectedReadLimiter,
  protectedWriteLimiter,
  aiGenerationLimiter
} = require("../middlewares/abuse-protection");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/leads", leadsRoutes);
router.use("/patients", requireAuth, protectedReadLimiter, protectedWriteLimiter, patientsRoutes);
router.use("/doctors", requireAuth, protectedReadLimiter, protectedWriteLimiter, doctorsRoutes);
router.use("/appointments", requireAuth, protectedReadLimiter, protectedWriteLimiter, appointmentsRoutes);
router.use("/medical-records", requireAuth, protectedReadLimiter, protectedWriteLimiter, medicalRecordsRoutes);
router.use("/billings", requireAuth, protectedReadLimiter, protectedWriteLimiter, billingsRoutes);
router.use("/dashboard", requireAuth, protectedReadLimiter, dashboardRoutes);
router.use("/commercial", requireAuth, protectedReadLimiter, protectedWriteLimiter, commercialRoutes);
router.use("/ai", requireAuth, aiGenerationLimiter, aiRoutes);

module.exports = router;
