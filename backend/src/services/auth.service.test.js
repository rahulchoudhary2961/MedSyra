const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

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

const servicePath = path.resolve(__dirname, "./auth.service.js");
const apiErrorPath = require.resolve(path.resolve(__dirname, "../utils/api-error.js"));
const poolPath = require.resolve(path.resolve(__dirname, "../config/db.js"));
const envPath = require.resolve(path.resolve(__dirname, "../config/env.js"));
const authModelPath = require.resolve(path.resolve(__dirname, "../models/auth.model.js"));
const authNotificationPath = require.resolve(path.resolve(__dirname, "./auth-notification.service.js"));

const run = async () => {
  const ApiError = require(apiErrorPath);

  {
    let createUserPayload = null;
    let resetEmailPayload = null;
    const service = loadWithMocks(servicePath, {
      [poolPath]: {},
      [envPath]: {
        jwtSecret: "test-secret",
        passwordResetTokenMinutes: 30,
        emailVerificationTokenMinutes: 60,
        maxLoginAttempts: 5,
        loginLockMinutes: 15
      },
      [authModelPath]: {
        findUserByEmail: async () => null,
        createUser: async (payload) => {
          createUserPayload = payload;
          return {
            id: "staff-1",
            organization_id: payload.organizationId,
            full_name: payload.fullName,
            email: payload.email,
            phone: payload.phone,
            role: payload.role,
            notify_daily_schedule_sms: payload.notifyDailyScheduleSms,
            notify_daily_schedule_email: payload.notifyDailyScheduleEmail
          };
        },
        setPasswordResetToken: async () => {}
      },
      [authNotificationPath]: {
        sendVerificationEmail: async () => true,
        sendPasswordResetEmail: async (payload) => {
          resetEmailPayload = payload;
          return true;
        }
      }
    });

    const result = await service.createStaff("org-1", {
      fullName: "Reception User",
      email: "RECEPTION@example.com",
      phone: "9876543210",
      role: "receptionist",
      notifyDailyScheduleSms: true,
      notifyDailyScheduleEmail: false
    });

    assert.equal(createUserPayload.email, "reception@example.com");
    assert.equal(createUserPayload.notifyDailyScheduleSms, true);
    assert.equal(createUserPayload.notifyDailyScheduleEmail, false);
    assert.equal(resetEmailPayload.email, "reception@example.com");
    assert.equal(result.setup_sent, true);
  }

  {
    const service = loadWithMocks(servicePath, {
      [poolPath]: {},
      [envPath]: {
        jwtSecret: "test-secret",
        passwordResetTokenMinutes: 30,
        emailVerificationTokenMinutes: 60,
        maxLoginAttempts: 5,
        loginLockMinutes: 15
      },
      [authModelPath]: {
        updateStaffNotificationPreferences: async () => null
      },
      [authNotificationPath]: {
        sendVerificationEmail: async () => true,
        sendPasswordResetEmail: async () => true
      }
    });

    await assert.rejects(
      service.updateStaffNotificationPreferences("org-1", "staff-404", {
        notifyDailyScheduleSms: false,
        notifyDailyScheduleEmail: true
      }),
      (error) => error instanceof ApiError && error.message === "Staff member not found"
    );
  }

  {
    let resentEmailPayload = null;
    const service = loadWithMocks(servicePath, {
      [poolPath]: {},
      [envPath]: {
        jwtSecret: "test-secret",
        passwordResetTokenMinutes: 30,
        emailVerificationTokenMinutes: 60,
        maxLoginAttempts: 5,
        loginLockMinutes: 15
      },
      [authModelPath]: {
        findUserByIdAndOrganization: async () => ({
          id: "staff-2",
          email: "billing@example.com",
          organization_id: "org-1"
        }),
        setPasswordResetToken: async () => {}
      },
      [authNotificationPath]: {
        sendVerificationEmail: async () => true,
        sendPasswordResetEmail: async (payload) => {
          resentEmailPayload = payload;
          return true;
        }
      }
    });

    const result = await service.resendStaffSetup("org-1", "staff-2");
    assert.equal(resentEmailPayload.email, "billing@example.com");
    assert.equal(result.setup_sent, true);
  }
};

module.exports = run;
