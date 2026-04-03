const ApiError = require("../utils/api-error");
const leadsModel = require("../models/leads.model");
const authService = require("./auth.service");
const { sendLeadEmail, sendLeadFollowUpEmail } = require("./lead-notification.service");

const DEFAULT_FOLLOW_UP_HOURS = 24;

const buildNextFollowUpAt = (hours = DEFAULT_FOLLOW_UP_HOURS) => {
  const followUpAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  return followUpAt.toISOString();
};

const buildLeadPayload = (payload, overrides = {}) => ({
  activationType: payload.activationType,
  status: overrides.status,
  fullName: payload.fullName,
  email: payload.email.toLowerCase().trim(),
  phone: payload.phone,
  clinicName: payload.clinicName,
  city: payload.city || null,
  message: payload.message || null,
  requestedPlanTier: payload.requestedPlanTier || null,
  demoDate: payload.demoDate || null,
  demoTime: payload.demoTime || null,
  demoTimezone: payload.demoTimezone || null,
  nextFollowUpAt: overrides.nextFollowUpAt,
  organizationId: overrides.organizationId,
  userId: overrides.userId
});

const ensureTrialPayload = (payload) => {
  if (!payload.password || payload.password.length < 8) {
    throw new ApiError(400, "A password with at least 8 characters is required to start a trial");
  }
};

const submitLead = async (payload) => {
  const activationType = payload.activationType || "demo";
  const nextFollowUpAt = buildNextFollowUpAt();

  if (activationType === "trial") {
    ensureTrialPayload(payload);

    const signup = await authService.provisionSignupAccount({
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      role: "admin",
      hospitalName: payload.clinicName,
      password: payload.password
    });

    const lead = await leadsModel.createLead(
      buildLeadPayload(
        { ...payload, activationType },
        {
          status: "trial_provisioned",
          nextFollowUpAt,
          organizationId: signup.organizationId,
          userId: signup.userId
        }
      )
    );

    await sendLeadEmail(lead);

    return {
      message: "Trial created. Check your email and verify it to finish setup.",
      activationType,
      status: lead.status,
      leadId: lead.id,
      nextFollowUpAt: lead.next_follow_up_at,
      email: signup.email
    };
  }

  const lead = await leadsModel.createLead(
    buildLeadPayload(
      { ...payload, activationType },
      {
        status: payload.demoDate && payload.demoTime ? "demo_scheduled" : "demo_requested",
        nextFollowUpAt
      }
    )
  );

  await sendLeadEmail(lead);

  return {
    message:
      lead.status === "demo_scheduled"
        ? "Demo request scheduled. We have recorded your preferred slot and will confirm it shortly."
        : "Demo request received. We will reach out to confirm a time shortly.",
    activationType,
    status: lead.status,
    leadId: lead.id,
    nextFollowUpAt: lead.next_follow_up_at
  };
};

const processDueLeadFollowUps = async () => {
  const leads = await leadsModel.listDueLeadFollowUps();
  const results = [];

  for (const lead of leads) {
    try {
      await sendLeadFollowUpEmail(lead);
      await leadsModel.updateLead(lead.id, {
        status: "follow_up_due",
        autoFollowUpSentAt: new Date().toISOString()
      });
      results.push({ leadId: lead.id, status: "sent" });
    } catch (error) {
      results.push({
        leadId: lead.id,
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to send lead follow-up"
      });
    }
  }

  return results;
};

module.exports = {
  submitLead,
  processDueLeadFollowUps
};
