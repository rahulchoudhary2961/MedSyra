/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const rootDir = path.resolve(__dirname, "..");

const readFile = (relativePath) => fs.readFileSync(path.resolve(rootDir, relativePath), "utf8");

const loadRolesModule = () => {
  const rolesPath = path.resolve(rootDir, "src/lib/roles.ts");
  const source = fs.readFileSync(rolesPath, "utf8");
  const transformed = `${source
    .replace(/\(role\?: string \| null\)/g, "(role)")
    .replace(/export const /g, "const ")}

module.exports = {
  isAdministratorRole,
  isManagementRole,
  isFullAccessRole,
  isReceptionistRole,
  isFrontDeskRole,
  isBillingRole,
  isReceptionRole,
  canManageAppointments,
  canAccessAssistant,
  canAccessPatients,
  canAccessBilling,
  canAccessReports,
  canAccessSettings,
  canManageDoctors,
  canAccessMedicalRecords,
  canDeleteMedicalRecords
};`;

  const sandbox = {
    module: { exports: {} },
    exports: {},
    require,
    __dirname: path.dirname(rolesPath),
    __filename: rolesPath
  };

  vm.runInNewContext(transformed, sandbox, { filename: rolesPath });
  return sandbox.module.exports;
};

const testRolesBehavior = () => {
  const roles = loadRolesModule();

  assert.equal(roles.isFullAccessRole("admin"), true);
  assert.equal(roles.isFullAccessRole("management"), true);
  assert.equal(roles.isFullAccessRole("receptionist"), false);

  assert.equal(roles.canManageAppointments("receptionist"), true);
  assert.equal(roles.canManageAppointments("nurse"), true);
  assert.equal(roles.canManageAppointments("billing"), false);

  assert.equal(roles.canAccessBilling("billing"), true);
  assert.equal(roles.canAccessBilling("receptionist"), false);
  assert.equal(roles.canAccessBilling("nurse"), false);

  assert.equal(roles.canAccessReports("admin"), true);
  assert.equal(roles.canAccessReports("management"), true);
  assert.equal(roles.canAccessReports("receptionist"), false);
  assert.equal(roles.canAccessReports("billing"), false);

  assert.equal(roles.canAccessSettings("admin"), true);
  assert.equal(roles.canAccessSettings("management"), true);
  assert.equal(roles.canAccessSettings("nurse"), false);

  assert.equal(roles.canAccessAssistant("doctor"), true);
  assert.equal(roles.canAccessAssistant("billing"), false);

  assert.equal(roles.canAccessPatients("doctor"), true);
  assert.equal(roles.canAccessPatients("billing"), false);

  assert.equal(roles.canAccessMedicalRecords("doctor"), true);
  assert.equal(roles.canAccessMedicalRecords("receptionist"), true);
  assert.equal(roles.canAccessMedicalRecords("billing"), false);

  assert.equal(roles.canManageDoctors("admin"), true);
  assert.equal(roles.canManageDoctors("management"), true);
  assert.equal(roles.canManageDoctors("receptionist"), false);
};

const testGuardContracts = () => {
  const patientsPage = readFile("src/app/dashboard/patients/page.tsx");
  assert.match(patientsPage, /canAccessPatients/);
  assert.match(patientsPage, /You do not have access to patients\./);

  const recordsPage = readFile("src/app/dashboard/medical-records/page.tsx");
  assert.match(recordsPage, /canAccessMedicalRecords/);
  assert.match(recordsPage, /You do not have access to medical records\./);

  const assistantPage = readFile("src/app/dashboard/assistant/page.tsx");
  assert.match(assistantPage, /canAccessAssistant/);
  assert.match(assistantPage, /You do not have access to the AI assistant\./);

  const reportsPage = readFile("src/app/dashboard/reports/page.tsx");
  assert.match(reportsPage, /canAccessReports/);
  assert.match(reportsPage, /You do not have access to reports\./);

  const settingsPage = readFile("src/app/dashboard/settings/page.tsx");
  assert.match(settingsPage, /canAccessSettings/);
  assert.match(settingsPage, /You do not have access to settings\./);
};

const testSidebarContracts = () => {
  const layout = readFile("src/app/components/DashboardLayout.tsx");
  assert.match(layout, /canAccessAssistant\(currentUser\?\.role\)/);
  assert.match(layout, /canAccessPatients\(currentUser\?\.role\)/);
  assert.match(layout, /canManageAppointments\(currentUser\?\.role\)/);
  assert.match(layout, /canAccessBilling\(currentUser\?\.role\)/);
  assert.match(layout, /canAccessReports\(currentUser\?\.role\)/);
  assert.match(layout, /canAccessSettings\(currentUser\?\.role\)/);
  assert.match(layout, /canManageDoctors\(currentUser\?\.role\)/);
  assert.match(layout, /canAccessMedicalRecords\(currentUser\?\.role\)/);
};

const testWorkflowContracts = () => {
  const settingsPage = readFile("src/app/dashboard/settings/page.tsx");
  assert.match(settingsPage, /\/auth\/staff\/\$\{staff\.id\}\/notifications/);
  assert.match(settingsPage, /Save Preferences/);
  assert.match(settingsPage, /Daily schedule delivery now uses these saved preferences\./);

  const appointmentsPage = readFile("src/app/dashboard/appointments/page.tsx");
  assert.match(appointmentsPage, /\/appointments\/\$\{noShowTarget\.id\}\/no-show/);
  assert.match(appointmentsPage, /notifySms: noShowNotificationOptions\.sms/);
  assert.match(appointmentsPage, /notifyEmail: noShowNotificationOptions\.email/);
  assert.match(appointmentsPage, /Appointment marked no-show/);
};

const run = async () => {
  testRolesBehavior();
  process.stdout.write("PASS roles-behavior\n");

  testGuardContracts();
  process.stdout.write("PASS page-guards\n");

  testSidebarContracts();
  process.stdout.write("PASS sidebar-contracts\n");

  testWorkflowContracts();
  process.stdout.write("PASS workflow-contracts\n");

  process.stdout.write("Frontend permission tests passed (4/4)\n");
};

run().catch((error) => {
  process.stderr.write(`Frontend permission tests failed\n${error.stack || error.message}\n`);
  process.exit(1);
});
