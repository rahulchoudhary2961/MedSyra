const express = require("express");
const authRoutes = require("./auth.routes");
const patientsRoutes = require("./patients.routes");
const doctorsRoutes = require("./doctors.routes");
const appointmentsRoutes = require("./appointments.routes");
const medicalRecordsRoutes = require("./medical-records.routes");
const billingsRoutes = require("./billings.routes");
const dashboardRoutes = require("./dashboard.routes");
const branchesRoutes = require("./branches.routes");
const crmRoutes = require("./crm.routes");
const labRoutes = require("./lab.routes");
const pharmacyRoutes = require("./pharmacy.routes");
const inventoryRoutes = require("./inventory.routes");
const insuranceRoutes = require("./insurance.routes");
const doctorToolsRoutes = require("./doctor-tools.routes");
const notificationsRoutes = require("./notifications.routes");
const securityRoutes = require("./security.routes");
const commercialRoutes = require("./commercial.routes");
const leadsRoutes = require("./leads.routes");
const aiRoutes = require("./ai.routes");
const paymentsRoutes = require("./payments.routes");
const requireAuth = require("../middlewares/require-auth");
const resolveBranchContext = require("../middlewares/resolve-branch-context");
const {
  protectedReadLimiter,
  protectedWriteLimiter,
  aiGenerationLimiter
} = require("../middlewares/abuse-protection");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/leads", leadsRoutes);
router.use("/payments", paymentsRoutes);
router.use("/branches", requireAuth, protectedReadLimiter, protectedWriteLimiter, branchesRoutes);
router.use("/patients", requireAuth, protectedReadLimiter, protectedWriteLimiter, patientsRoutes);
router.use("/doctors", requireAuth, protectedReadLimiter, protectedWriteLimiter, doctorsRoutes);
router.use("/appointments", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, appointmentsRoutes);
router.use("/medical-records", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, medicalRecordsRoutes);
router.use("/billings", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, billingsRoutes);
router.use("/dashboard", requireAuth, resolveBranchContext, protectedReadLimiter, dashboardRoutes);
router.use("/crm", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, crmRoutes);
router.use("/lab", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, labRoutes);
router.use("/pharmacy", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, pharmacyRoutes);
router.use("/inventory", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, inventoryRoutes);
router.use("/insurance", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, insuranceRoutes);
router.use("/doctor-tools", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, doctorToolsRoutes);
router.use("/notifications", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, notificationsRoutes);
router.use("/security", requireAuth, resolveBranchContext, protectedReadLimiter, protectedWriteLimiter, securityRoutes);
router.use("/commercial", requireAuth, protectedReadLimiter, protectedWriteLimiter, commercialRoutes);
router.use("/ai", requireAuth, resolveBranchContext, aiGenerationLimiter, aiRoutes);

module.exports = router;
