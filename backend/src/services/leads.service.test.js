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

const servicePath = path.resolve(__dirname, "./leads.service.js");
const apiErrorPath = require.resolve(path.resolve(__dirname, "../utils/api-error.js"));
const leadsModelPath = require.resolve(path.resolve(__dirname, "../models/leads.model.js"));
const authServicePath = require.resolve(path.resolve(__dirname, "./auth.service.js"));
const leadNotificationPath = require.resolve(path.resolve(__dirname, "./lead-notification.service.js"));

const run = async () => {
  const ApiError = require(apiErrorPath);

  {
    let createdPayload = null;
    let emailedLead = null;
    const service = loadWithMocks(servicePath, {
      [leadsModelPath]: {
        createLead: async (payload) => {
          createdPayload = payload;
          return {
            id: "lead-1",
            status: payload.status,
            activation_type: payload.activationType,
            next_follow_up_at: payload.nextFollowUpAt,
            clinic_name: payload.clinicName,
            full_name: payload.fullName,
            email: payload.email
          };
        },
        listDueLeadFollowUps: async () => [],
        updateLead: async () => null
      },
      [authServicePath]: {
        provisionSignupAccount: async () => {
          throw new Error("trial signup should not run");
        }
      },
      [leadNotificationPath]: {
        sendLeadEmail: async (lead) => {
          emailedLead = lead;
          return true;
        },
        sendLeadFollowUpEmail: async () => true
      }
    });

    const result = await service.submitLead({
      activationType: "demo",
      fullName: "Dr Demo",
      email: "demo@example.com",
      phone: "9876543210",
      clinicName: "Demo Clinic",
      city: "Mumbai",
      demoDate: "2026-04-10",
      demoTime: "10:30",
      demoTimezone: "Asia/Calcutta"
    });

    assert.equal(createdPayload.status, "demo_scheduled");
    assert.equal(createdPayload.activationType, "demo");
    assert.equal(result.status, "demo_scheduled");
    assert.equal(emailedLead.id, "lead-1");
  }

  {
    let createdPayload = null;
    let signupPayload = null;
    const service = loadWithMocks(servicePath, {
      [leadsModelPath]: {
        createLead: async (payload) => {
          createdPayload = payload;
          return {
            id: "lead-2",
            status: payload.status,
            activation_type: payload.activationType,
            next_follow_up_at: payload.nextFollowUpAt
          };
        },
        listDueLeadFollowUps: async () => [],
        updateLead: async () => null
      },
      [authServicePath]: {
        provisionSignupAccount: async (payload) => {
          signupPayload = payload;
          return {
            organizationId: "org-1",
            userId: "user-1",
            email: payload.email.toLowerCase()
          };
        }
      },
      [leadNotificationPath]: {
        sendLeadEmail: async () => true,
        sendLeadFollowUpEmail: async () => true
      }
    });

    const result = await service.submitLead({
      activationType: "trial",
      fullName: "Dr Trial",
      email: "TRIAL@example.com",
      phone: "9876543210",
      clinicName: "Trial Clinic",
      password: "strong-password",
      requestedPlanTier: "starter"
    });

    assert.equal(signupPayload.role, "admin");
    assert.equal(signupPayload.hospitalName, "Trial Clinic");
    assert.equal(createdPayload.status, "trial_provisioned");
    assert.equal(createdPayload.organizationId, "org-1");
    assert.equal(result.email, "trial@example.com");
  }

  {
    const service = loadWithMocks(servicePath, {
      [leadsModelPath]: {
        createLead: async () => {
          throw new Error("createLead should not run");
        },
        listDueLeadFollowUps: async () => [],
        updateLead: async () => null
      },
      [authServicePath]: {
        provisionSignupAccount: async () => {
          throw new Error("signup should not run");
        }
      },
      [leadNotificationPath]: {
        sendLeadEmail: async () => true,
        sendLeadFollowUpEmail: async () => true
      }
    });

    await assert.rejects(
      service.submitLead({
        activationType: "trial",
        fullName: "Dr Trial",
        email: "trial@example.com",
        phone: "9876543210",
        clinicName: "Trial Clinic"
      }),
      (error) => error instanceof ApiError && error.message.includes("password")
    );
  }
};

module.exports = run;
