const assert = require("node:assert/strict");
const path = require("node:path");

const ApiError = require(path.resolve(__dirname, "../utils/api-error.js"));
const authorizeRoles = require(path.resolve(__dirname, "./authorize-roles.js"));

const runMiddleware = async (middleware, req) => {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const run = async () => {
  await runMiddleware(authorizeRoles("full_access"), {
    user: { role: "admin" }
  });

  await runMiddleware(authorizeRoles("full_access"), {
    user: { role: "management" }
  });

  await runMiddleware(authorizeRoles("reception_access"), {
    user: { role: "receptionist" }
  });

  await runMiddleware(authorizeRoles("reception_access"), {
    user: { role: "nurse" }
  });

  await runMiddleware(authorizeRoles("billing_access"), {
    user: { role: "billing" }
  });

  await assert.rejects(
    runMiddleware(authorizeRoles("reception_access"), {
      user: { role: "billing" }
    }),
    (error) => error instanceof ApiError && error.statusCode === 403
  );

  await assert.rejects(
    runMiddleware(authorizeRoles("billing_access"), {
      user: { role: "receptionist" }
    }),
    (error) => error instanceof ApiError && error.statusCode === 403
  );

  await assert.rejects(
    runMiddleware(authorizeRoles("full_access"), {
      user: { role: "doctor" }
    }),
    (error) => error instanceof ApiError && error.statusCode === 403
  );
};

module.exports = run;
