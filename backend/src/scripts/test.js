const path = require("path");

const tests = [
  path.resolve(__dirname, "../middlewares/authorize-roles.test.js"),
  path.resolve(__dirname, "../routes/permission-routes.test.js"),
  path.resolve(__dirname, "../routes/permission-api.test.js"),
  path.resolve(__dirname, "../models/billings.model.test.js"),
  path.resolve(__dirname, "../services/billings.service.test.js"),
  path.resolve(__dirname, "../services/auth.service.test.js"),
  path.resolve(__dirname, "../services/leads.service.test.js"),
  path.resolve(__dirname, "../services/commercial.service.test.js"),
  path.resolve(__dirname, "../services/appointments.service.test.js"),
  path.resolve(__dirname, "../services/staff-notification.service.test.js"),
  path.resolve(__dirname, "../utils/file-storage.test.js")
];

const run = async () => {
  let passed = 0;

  for (const testFile of tests) {
    const execute = require(testFile);
    await execute();
    passed += 1;
    process.stdout.write(`PASS ${path.basename(testFile)}\n`);
  }

  process.stdout.write(`Backend tests passed (${passed}/${tests.length})\n`);
};

run().catch((error) => {
  process.stderr.write(`Backend tests failed\n${error.stack || error.message}\n`);
  process.exit(1);
});
