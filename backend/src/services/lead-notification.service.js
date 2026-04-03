const env = require("../config/env");
const { sendMail } = require("./mail.service");
const { logInfo, logWarn } = require("../utils/logger");

const formatDemoSlot = (lead) => {
  if (!lead.demo_date || !lead.demo_time) {
    return "Not selected";
  }

  return `${lead.demo_date} ${lead.demo_time}${lead.demo_timezone ? ` (${lead.demo_timezone})` : ""}`;
};

const formatLeadText = (lead) => {
  const lines = [
    "New landing page activation",
    "",
    `Activation type: ${lead.activation_type}`,
    `Status: ${lead.status}`,
    `Name: ${lead.full_name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    `Clinic: ${lead.clinic_name}`,
    `City: ${lead.city || "-"}`,
    `Requested plan: ${lead.requested_plan_tier || "-"}`,
    `Preferred demo slot: ${formatDemoSlot(lead)}`,
    `Next follow-up: ${lead.next_follow_up_at || "-"}`,
    `Provisioned organization: ${lead.organization_id || "-"}`,
    `Provisioned user: ${lead.user_id || "-"}`,
    `Message: ${lead.message || "-"}`
  ];

  return lines.join("\n");
};

const sendLeadEmail = async (lead) => {
  if (!env.leadsEmailTo) {
    logWarn("lead_email_missing_recipient", { email: lead.email });
    return false;
  }

  const text = formatLeadText(lead);
  const sent = await sendMail({
    to: env.leadsEmailTo,
    subject: `[${lead.activation_type.toUpperCase()}] ${lead.clinic_name} • ${lead.full_name}`,
    text,
    replyTo: lead.email
  });

  if (!sent) {
    logInfo("lead_email_dev_fallback", {
      to: env.leadsEmailTo,
      body: text
    });
  }

  return sent;
};

const sendLeadFollowUpEmail = async (lead) => {
  if (!env.leadsEmailTo) {
    logWarn("lead_follow_up_email_missing_recipient", { leadId: lead.id, email: lead.email });
    return false;
  }

  const text = [
    "Lead follow-up is due",
    "",
    `Lead ID: ${lead.id}`,
    `Activation type: ${lead.activation_type}`,
    `Status: ${lead.status}`,
    `Name: ${lead.full_name}`,
    `Clinic: ${lead.clinic_name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    `Preferred demo slot: ${formatDemoSlot(lead)}`,
    `Original message: ${lead.message || "-"}`
  ].join("\n");

  const sent = await sendMail({
    to: env.leadsEmailTo,
    subject: `Follow up needed: ${lead.clinic_name} • ${lead.full_name}`,
    text,
    replyTo: lead.email
  });

  if (!sent) {
    logInfo("lead_follow_up_dev_fallback", {
      to: env.leadsEmailTo,
      body: text
    });
  }

  return sent;
};

module.exports = {
  sendLeadEmail,
  sendLeadFollowUpEmail
};
