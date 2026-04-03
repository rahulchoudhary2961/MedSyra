const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readRoute = (relativePath) =>
  fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");

const expectIncludes = (content, snippet, label) => {
  assert.ok(content.includes(snippet), `${label} should include ${snippet}`);
};

const run = async () => {
  const billingsRoutes = readRoute("./billings.routes.js");
  expectIncludes(billingsRoutes, 'authorizeRoles("full_access", "billing_access")', "Billing routes");
  expectIncludes(billingsRoutes, '"/reconciliation"', "Billing reconciliation route");
  expectIncludes(billingsRoutes, '"/:id/refunds"', "Billing refund route");

  const dashboardRoutes = readRoute("./dashboard.routes.js");
  expectIncludes(dashboardRoutes, 'authorizeRoles("full_access")', "Dashboard reports route");

  const patientsRoutes = readRoute("./patients.routes.js");
  expectIncludes(
    patientsRoutes,
    'authorizeRoles("full_access", "reception_access", "doctor")',
    "Patient read routes"
  );
  expectIncludes(
    patientsRoutes,
    'authorizeRoles("full_access", "reception_access"), validateRequest({ body: patientsSchemas.createBody })',
    "Patient create route"
  );

  const doctorsRoutes = readRoute("./doctors.routes.js");
  expectIncludes(
    doctorsRoutes,
    'authorizeRoles("full_access", "reception_access", "doctor")',
    "Doctor list route"
  );

  const aiRoutes = readRoute("./ai.routes.js");
  expectIncludes(
    aiRoutes,
    'authorizeRoles("full_access", "reception_access", "doctor")',
    "AI assistant route"
  );

  const authRoutes = readRoute("./auth.routes.js");
  expectIncludes(
    authRoutes,
    '"/staff/:id/notifications"',
    "Auth staff notification route"
  );
};

module.exports = run;
