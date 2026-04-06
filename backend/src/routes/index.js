const express = require("express");
const authRoutes = require("./auth.routes");
const patientsRoutes = require("./patients.routes");
const doctorsRoutes = require("./doctors.routes");
const appointmentsRoutes = require("./appointments.routes");
const medicalRecordsRoutes = require("./medical-records.routes");
const billingsRoutes = require("./billings.routes");
const dashboardRoutes = require("./dashboard.routes");
const crmRoutes = require("./crm.routes");
const labRoutes = require("./lab.routes");
const pharmacyRoutes = require("./pharmacy.routes");
const inventoryRoutes = require("./inventory.routes");
const notificationsRoutes = require("./notifications.routes");
const commercialRoutes = require("./commercial.routes");
const leadsRoutes = require("./leads.routes");
const aiRoutes = require("./ai.routes");
const paymentsRoutes = require("./payments.routes");
const requireAuth = require("../middlewares/require-auth");
const {
  protectedReadLimiter,
  protectedWriteLimiter,
  aiGenerationLimiter
} = require("../middlewares/abuse-protection");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/leads", leadsRoutes);
router.use("/payments", paymentsRoutes);
router.use("/patients", requireAuth, protectedReadLimiter, protectedWriteLimiter, patientsRoutes);
router.use("/doctors", requireAuth, protectedReadLimiter, protectedWriteLimiter, doctorsRoutes);
router.use("/appointments", requireAuth, protectedReadLimiter, protectedWriteLimiter, appointmentsRoutes);
router.use("/medical-records", requireAuth, protectedReadLimiter, protectedWriteLimiter, medicalRecordsRoutes);
router.use("/billings", requireAuth, protectedReadLimiter, protectedWriteLimiter, billingsRoutes);
router.use("/dashboard", requireAuth, protectedReadLimiter, dashboardRoutes);
router.use("/crm", requireAuth, protectedReadLimiter, protectedWriteLimiter, crmRoutes);
router.use("/lab", requireAuth, protectedReadLimiter, protectedWriteLimiter, labRoutes);
router.use("/pharmacy", requireAuth, protectedReadLimiter, protectedWriteLimiter, pharmacyRoutes);
router.use("/inventory", requireAuth, protectedReadLimiter, protectedWriteLimiter, inventoryRoutes);
router.use("/notifications", requireAuth, protectedReadLimiter, protectedWriteLimiter, notificationsRoutes);
router.use("/commercial", requireAuth, protectedReadLimiter, protectedWriteLimiter, commercialRoutes);
router.use("/ai", requireAuth, aiGenerationLimiter, aiRoutes);

module.exports = router;
