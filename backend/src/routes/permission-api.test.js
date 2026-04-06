const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");
const path = require("node:path");
const express = require("express");

const noopMiddleware = (_req, _res, next) => next();

const loadWithMocks = (modulePath, mocks) => {
  const resolvedPath = require.resolve(modulePath);
  const originalLoad = Module._load;

  Module._load = function mockedLoad(request, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(request, parent);
    if (Object.prototype.hasOwnProperty.call(mocks, resolvedRequest)) {
      return mocks[resolvedRequest];
    }
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[resolvedPath];
  try {
    return require(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }
};

const buildOkController = (methods) =>
  Object.fromEntries(
    methods.map((method) => [
      method,
      (_req, res) => {
        res.json({ success: true, method });
      }
    ])
  );

const buildTestRequireAuth = () => (req, _res, next) => {
  const role = req.headers["x-test-role"];
  if (!role) {
    const error = new Error("Authorization token is required");
    error.statusCode = 401;
    next(error);
    return;
  }

  req.user = {
    sub: "user-1",
    organizationId: "org-1",
    role
  };
  next();
};

const withErrorHandler = (router) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    if (role) {
      req.user = {
        sub: "user-1",
        organizationId: "org-1",
        role
      };
    }
    next();
  });
  app.use(router);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  });
  return app;
};

const startErrorHandledServer = async (router) => {
  const app = withErrorHandler(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
};

const run = async () => {
  {
    const routePath = path.resolve(__dirname, "./patients.routes.js");
    const controllerPath = require.resolve(path.resolve(__dirname, "../controllers/patients.controller.js"));
    const validatePath = require.resolve(path.resolve(__dirname, "../middlewares/validate-request.js"));
    const schemasPath = require.resolve(path.resolve(__dirname, "../validators/schemas.js"));

    const router = loadWithMocks(routePath, {
      [controllerPath]: buildOkController(["listPatients", "createPatient", "getPatientProfile", "getPatient", "updatePatient", "deletePatient"]),
      [validatePath]: () => noopMiddleware,
      [schemasPath]: { patientsSchemas: { listQuery: {}, createBody: {}, idParams: {}, updateBody: {} } }
    });

    const server = await startErrorHandledServer(router);
    try {
      let response = await fetch(`${server.baseUrl}/`, { headers: { "x-test-role": "receptionist" } });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-role": "doctor" },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 403);

      response = await fetch(`${server.baseUrl}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-role": "receptionist" },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/patient-1`, {
        method: "DELETE",
        headers: { "x-test-role": "receptionist" }
      });
      assert.equal(response.status, 403);

      response = await fetch(`${server.baseUrl}/patient-1`, {
        method: "DELETE",
        headers: { "x-test-role": "admin" }
      });
      assert.equal(response.status, 200);
    } finally {
      await server.close();
    }
  }

  {
    const routePath = path.resolve(__dirname, "./billings.routes.js");
    const controllerPath = require.resolve(path.resolve(__dirname, "../controllers/billings.controller.js"));
    const validatePath = require.resolve(path.resolve(__dirname, "../middlewares/validate-request.js"));
    const schemasPath = require.resolve(path.resolve(__dirname, "../validators/schemas.js"));

    const router = loadWithMocks(routePath, {
      [controllerPath]: buildOkController([
        "listInvoices",
        "createInvoice",
        "getInvoice",
        "updateInvoice",
        "createPaymentLink",
        "refreshPaymentLink",
        "issueInvoice",
        "recordPayment",
        "refundPayment",
        "getReconciliationReport",
        "markInvoicePaid",
        "downloadInvoicePdf",
        "deleteInvoice"
      ]),
      [validatePath]: () => noopMiddleware,
      [schemasPath]: {
        billingsSchemas: {
          listQuery: {},
          createBody: {},
          idParams: {},
          paymentLinkParams: {},
          paymentLinkBody: {},
          updateBody: {},
          issueBody: {},
          paymentBody: {},
          refundBody: {},
          quickPayBody: {}
        }
      }
    });

    const server = await startErrorHandledServer(router);
    try {
      let response = await fetch(`${server.baseUrl}/`, { headers: { "x-test-role": "billing" } });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/`, { headers: { "x-test-role": "receptionist" } });
      assert.equal(response.status, 403);

      response = await fetch(`${server.baseUrl}/reconciliation`, { headers: { "x-test-role": "billing" } });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/invoice-1/refunds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-role": "receptionist" },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 403);

      response = await fetch(`${server.baseUrl}/invoice-1`, {
        method: "DELETE",
        headers: { "x-test-role": "billing" }
      });
      assert.equal(response.status, 403);

      response = await fetch(`${server.baseUrl}/invoice-1`, {
        method: "DELETE",
        headers: { "x-test-role": "admin" }
      });
      assert.equal(response.status, 200);
    } finally {
      await server.close();
    }
  }

  {
    const routePath = path.resolve(__dirname, "./dashboard.routes.js");
    const controllerPath = require.resolve(path.resolve(__dirname, "../controllers/dashboard.controller.js"));
    const validatePath = require.resolve(path.resolve(__dirname, "../middlewares/validate-request.js"));
    const schemasPath = require.resolve(path.resolve(__dirname, "../validators/schemas.js"));

    const router = loadWithMocks(routePath, {
      [controllerPath]: buildOkController(["getSummary", "getReports"]),
      [validatePath]: () => noopMiddleware,
      [schemasPath]: { dashboardSchemas: { reportsQuery: {} } }
    });

    const server = await startErrorHandledServer(router);
    try {
      let response = await fetch(`${server.baseUrl}/reports`, { headers: { "x-test-role": "admin" } });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/reports`, { headers: { "x-test-role": "billing" } });
      assert.equal(response.status, 403);
    } finally {
      await server.close();
    }
  }

  {
    const routePath = path.resolve(__dirname, "./security.routes.js");
    const controllerPath = require.resolve(path.resolve(__dirname, "../controllers/security.controller.js"));
    const validatePath = require.resolve(path.resolve(__dirname, "../middlewares/validate-request.js"));
    const schemasPath = require.resolve(path.resolve(__dirname, "../validators/schemas.js"));

    const router = loadWithMocks(routePath, {
      [controllerPath]: buildOkController(["getOverview", "listAuditLogs"]),
      [validatePath]: () => noopMiddleware,
      [schemasPath]: { securitySchemas: { overviewQuery: {}, logsQuery: {} } }
    });

    const server = await startErrorHandledServer(router);
    try {
      let response = await fetch(`${server.baseUrl}/overview`, { headers: { "x-test-role": "admin" } });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/audit-logs`, { headers: { "x-test-role": "management" } });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/overview`, { headers: { "x-test-role": "billing" } });
      assert.equal(response.status, 403);
    } finally {
      await server.close();
    }
  }

  {
    const routePath = path.resolve(__dirname, "./commercial.routes.js");
    const controllerPath = require.resolve(path.resolve(__dirname, "../controllers/commercial.controller.js"));
    const validatePath = require.resolve(path.resolve(__dirname, "../middlewares/validate-request.js"));
    const schemasPath = require.resolve(path.resolve(__dirname, "../validators/schemas.js"));

    const router = loadWithMocks(routePath, {
      [controllerPath]: buildOkController(["getOverview", "updatePricing", "createTopUp", "updatePlatformInfra"]),
      [validatePath]: () => noopMiddleware,
      [schemasPath]: { commercialSchemas: { updatePricingBody: {}, createTopUpBody: {}, updatePlatformInfraBody: {} } }
    });

    const server = await startErrorHandledServer(router);
    try {
      let response = await fetch(`${server.baseUrl}/overview`, { headers: { "x-test-role": "admin" } });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/overview`, { headers: { "x-test-role": "billing" } });
      assert.equal(response.status, 403);

      response = await fetch(`${server.baseUrl}/top-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-role": "management" },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 200);
    } finally {
      await server.close();
    }
  }

  {
    const routePath = path.resolve(__dirname, "./auth.routes.js");
    const controllerPath = require.resolve(path.resolve(__dirname, "../controllers/auth.controller.js"));
    const requireAuthPath = require.resolve(path.resolve(__dirname, "../middlewares/require-auth.js"));
    const authorizeRolesPath = require.resolve(path.resolve(__dirname, "../middlewares/authorize-roles.js"));
    const validatePath = require.resolve(path.resolve(__dirname, "../middlewares/validate-request.js"));
    const abusePath = require.resolve(path.resolve(__dirname, "../middlewares/abuse-protection.js"));
    const schemasPath = require.resolve(path.resolve(__dirname, "../validators/schemas.js"));

    const router = loadWithMocks(routePath, {
      [controllerPath]: buildOkController([
        "signup",
        "signin",
        "verifyEmail",
        "resendVerificationEmail",
        "requestPasswordReset",
        "resetPassword",
        "createStaff",
        "resendStaffSetup",
        "updateStaffNotificationPreferences",
        "listUsers",
        "me"
      ]),
      [requireAuthPath]: buildTestRequireAuth(),
      [validatePath]: () => noopMiddleware,
      [abusePath]: {
        signupLimiter: noopMiddleware,
        signinLimiter: noopMiddleware,
        recoveryLimiter: noopMiddleware
      },
      [schemasPath]: { authSchemas: { signupBody: {}, signinBody: {}, verifyEmailBody: {}, resendVerificationBody: {}, requestPasswordResetBody: {}, resetPasswordBody: {}, createStaffBody: {}, updateStaffNotificationsBody: {}, listUsersQuery: {}, idParams: {} } }
    });

    const server = await startErrorHandledServer(router);
    try {
      let response = await fetch(`${server.baseUrl}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-role": "admin" },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-role": "billing" },
        body: JSON.stringify({})
      });
      assert.equal(response.status, 403);

      response = await fetch(`${server.baseUrl}/staff/user-1/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-test-role": "admin" },
        body: JSON.stringify({ notifyDailyScheduleEmail: true })
      });
      assert.equal(response.status, 200);

      response = await fetch(`${server.baseUrl}/staff/user-1/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-test-role": "receptionist" },
        body: JSON.stringify({ notifyDailyScheduleEmail: true })
      });
      assert.equal(response.status, 403);
    } finally {
      await server.close();
    }
  }
};

module.exports = run;
