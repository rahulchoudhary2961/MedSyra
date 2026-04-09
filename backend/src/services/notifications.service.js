const ApiError = require("../utils/api-error");
const env = require("../config/env");
const notificationsModel = require("../models/notifications.model");
const { sendWhatsAppText } = require("./whatsapp-reminder.service");
const { sendSmsText } = require("./sms.service");
const { getMailConfigStatus } = require("./mail.service");

const diagnosisMatchers = [
  { tag: "diabetes", pattern: /(diabet|sugar|hba1c|glucose)/i },
  { tag: "hypertension", pattern: /(hypertension|blood pressure|bp\b)/i },
  { tag: "dental", pattern: /(dental|tooth|teeth|root canal|implant|crown|gum)/i },
  { tag: "respiratory", pattern: /(asthma|copd|respiratory|breath|lung)/i },
  { tag: "cardiac", pattern: /(cardiac|heart|cholesterol|angina)/i }
];

const truncatePreview = (body) => String(body || "").replace(/\s+/g, " ").trim().slice(0, 160);

const renderTemplate = (body, context = {}) =>
  String(body || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => {
    const normalizedKey = String(token || "").trim();
    const value = context[normalizedKey];
    return value === undefined || value === null || value === "" ? "" : String(value);
  });

const detectConditionTags = (diagnosis) => {
  const source = String(diagnosis || "").trim();
  if (!source) {
    return [];
  }

  return diagnosisMatchers.filter((item) => item.pattern.test(source)).map((item) => item.tag);
};

const buildTemplateContext = (context = {}) => {
  const patientName = String(context.patientName || "Patient").trim();
  const firstName = patientName.split(/\s+/)[0] || "Patient";

  return {
    firstName,
    patientName,
    clinicName: context.clinicName || "your clinic",
    doctorName: context.doctorName || "Doctor",
    appointmentDate: context.appointmentDate || "",
    appointmentTime: context.appointmentTime || "",
    followUpDate: context.followUpDate || "",
    diagnosis: context.diagnosis || "",
    campaignName: context.campaignName || context.templateName || "our latest offer",
    campaignNote: context.campaignNote || ""
  };
};

const pickTemplate = (templates, notificationType, channel, templateId, conditionTags = []) => {
  if (templateId) {
    return templates.find((item) => item.id === templateId) || null;
  }

  const matchingType = templates.filter(
    (item) => item.notification_type === notificationType && (item.channel === channel || item.channel === "whatsapp")
  );
  if (matchingType.length === 0) {
    return null;
  }

  const conditionMatch = matchingType.find(
    (item) => item.condition_tag && conditionTags.includes(item.condition_tag)
  );
  if (conditionMatch) {
    return conditionMatch;
  }

  return matchingType.find((item) => item.is_default) || matchingType[0];
};

const buildPreferencesResponse = async (organizationId) => {
  const preferences = await notificationsModel.getNotificationPreferences(organizationId);

  return {
    preferences,
    providers: {
      whatsapp: {
        enabled: env.whatsappReminderEnabled,
        configured: !env.whatsappReminderEnabled || Boolean(env.ycloudApiKey && env.ycloudWhatsappFrom)
      },
      sms: {
        enabled: env.smsReminderEnabled,
        configured:
          !env.smsReminderEnabled ||
          (env.smsProvider === "twilio"
            ? Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioFromNumber)
            : Boolean(env.httpsmsApiKey && env.httpsmsFromNumber))
      },
      email: getMailConfigStatus()
    }
  };
};

const getNotificationPreferences = async (organizationId) => {
  return buildPreferencesResponse(organizationId);
};

const updateNotificationPreferences = async (organizationId, payload) => {
  await notificationsModel.updateNotificationPreferences(organizationId, payload);
  return buildPreferencesResponse(organizationId);
};

const listNotificationLogs = async (organizationId, query) => notificationsModel.listNotificationLogs(organizationId, query);

const listNotificationTemplates = async (organizationId, query) =>
  notificationsModel.listNotificationTemplates(organizationId, query);

const createNotificationTemplate = async (organizationId, payload) =>
  notificationsModel.createNotificationTemplate(organizationId, payload);

const updateNotificationTemplate = async (organizationId, id, payload) => {
  const updated = await notificationsModel.updateNotificationTemplate(organizationId, id, payload);
  if (!updated) {
    throw new ApiError(404, "Notification template not found");
  }

  return updated;
};

const listNotificationCampaigns = async (organizationId, query) =>
  notificationsModel.listNotificationCampaigns(organizationId, query);

const createNotificationCampaign = async (organizationId, payload) =>
  notificationsModel.getNotificationTemplateById(organizationId, payload.templateId).then((template) => {
    if (!template) {
      throw new ApiError(404, "Notification template not found");
    }

    return notificationsModel.createNotificationCampaign(organizationId, payload);
  });

const recordNotificationLog = async (payload) => notificationsModel.createNotificationLog(payload);

const getReminderChannels = (preferences, type) => {
  if (type === "appointment_reminder") {
    return {
      whatsapp: preferences.appointment_whatsapp_enabled === true,
      sms: preferences.appointment_sms_enabled === true
    };
  }

  if (type === "follow_up_reminder") {
    return {
      whatsapp: preferences.follow_up_whatsapp_enabled === true,
      sms: preferences.follow_up_sms_enabled === true
    };
  }

  if (type === "marketing_campaign") {
    return {
      whatsapp: preferences.campaign_whatsapp_enabled === true,
      sms: preferences.campaign_sms_enabled === true
    };
  }

  return {
    whatsapp: false,
    sms: false
  };
};

const resolveNotificationBody = async ({
  organizationId,
  notificationType,
  channel,
  templateId = null,
  templateContext = {},
  body = null
}) => {
  if (body) {
    return {
      body,
      template: null
    };
  }

  const templates = await notificationsModel.listNotificationTemplates(organizationId, { notificationType });
  const conditionTags = detectConditionTags(templateContext.diagnosis);
  const template = pickTemplate(templates, notificationType, channel, templateId, conditionTags);

  if (!template) {
    throw new ApiError(400, `No active ${notificationType.replace(/_/g, " ")} template is configured`);
  }

  return {
    body: renderTemplate(template.body, buildTemplateContext(templateContext)),
    template
  };
};

const sendReminderDeliveries = async ({
  organizationId,
  branchId = null,
  actorUserId = null,
  notificationType,
  referenceId = null,
  phone,
  body,
  templateId = null,
  templateContext = {},
  metadata = {},
  preferences,
  channels: explicitChannels = null
}) => {
  const deliveries = [];
  const channels = explicitChannels || getReminderChannels(preferences, notificationType);

  if (channels.whatsapp) {
    const { body: whatsappBody, template } = await resolveNotificationBody({
      organizationId,
      notificationType,
      channel: "whatsapp",
      templateId,
      templateContext,
      body
    });
    const preview = truncatePreview(whatsappBody);

    try {
      const result = await sendWhatsAppText({
        phone,
        body: whatsappBody,
        organizationId,
        actorUserId,
        sourceFeature: notificationType,
        referenceId,
        note: `${notificationType} WhatsApp notification`
      });

      await recordNotificationLog({
        organizationId,
        branchId,
        actorUserId,
        notificationType,
        channel: "whatsapp",
        status: "sent",
        referenceId,
        recipient: result.recipient,
        messagePreview: preview,
        metadata: {
          ...metadata,
          templateId: template?.id || null,
          templateKey: template?.template_key || null
        }
      });

      deliveries.push({
        channel: "whatsapp",
        status: "sent",
        recipient: result.recipient
      });
    } catch (error) {
      await recordNotificationLog({
        organizationId,
        branchId,
        actorUserId,
        notificationType,
        channel: "whatsapp",
        status: "failed",
        referenceId,
        recipient: phone,
        messagePreview: preview,
        errorMessage: error.message,
        metadata
      });
      deliveries.push({
        channel: "whatsapp",
        status: "failed",
        error: error.message
      });
    }
  }

  if (channels.sms) {
    const { body: smsBody, template } = await resolveNotificationBody({
      organizationId,
      notificationType,
      channel: "sms",
      templateId,
      templateContext,
      body
    });
    const preview = truncatePreview(smsBody);

    try {
      const result = await sendSmsText({
        phone,
        body: smsBody,
        organizationId,
        actorUserId,
        sourceFeature: notificationType,
        referenceId,
        note: `${notificationType} SMS notification`
      });

      await recordNotificationLog({
        organizationId,
        branchId,
        actorUserId,
        notificationType,
        channel: "sms",
        status: "sent",
        referenceId,
        recipient: result.recipient,
        messagePreview: preview,
        metadata: {
          ...metadata,
          templateId: template?.id || null,
          templateKey: template?.template_key || null
        }
      });

      deliveries.push({
        channel: "sms",
        status: "sent",
        recipient: result.recipient
      });
    } catch (error) {
      await recordNotificationLog({
        organizationId,
        branchId,
        actorUserId,
        notificationType,
        channel: "sms",
        status: "failed",
        referenceId,
        recipient: phone,
        messagePreview: preview,
        errorMessage: error.message,
        metadata
      });
      deliveries.push({
        channel: "sms",
        status: "failed",
        error: error.message
      });
    }
  }

  return deliveries;
};

const sendNotificationCampaign = async (organizationId, campaignId, actorUserId = null) => {
  const campaign = await notificationsModel.getNotificationCampaignById(organizationId, campaignId);
  if (!campaign) {
    throw new ApiError(404, "Notification campaign not found");
  }

  const preferencesResponse = await getNotificationPreferences(organizationId);
  const allowedChannels = getReminderChannels(preferencesResponse.preferences, "marketing_campaign");
  const requestedChannels = campaign.channel_config || { whatsapp: true, sms: false };
  const activeChannels = {
    whatsapp: requestedChannels.whatsapp === true && allowedChannels.whatsapp === true,
    sms: requestedChannels.sms === true && allowedChannels.sms === true
  };

  if (!activeChannels.whatsapp && !activeChannels.sms) {
    throw new ApiError(400, "No campaign channels are enabled in notification settings");
  }

  const audience = await notificationsModel.listCampaignAudiencePatients(
    organizationId,
    campaign.audience_type,
    campaign.branch_id || null
  );

  const organizationContext = await notificationsModel.getOrganizationNotificationContext(organizationId);
  let successfulRecipients = 0;
  let failedRecipients = 0;

  for (const patient of audience) {
    const deliveries = await sendReminderDeliveries({
      organizationId,
      branchId: campaign.branch_id || organizationContext.default_branch_id || null,
      actorUserId,
      notificationType: "marketing_campaign",
      referenceId: campaign.id,
      phone: patient.phone,
      templateId: campaign.template_id,
      templateContext: {
        patientName: patient.full_name,
        clinicName: organizationContext.clinic_name,
        diagnosis: patient.latest_diagnosis || "",
        campaignName: campaign.name,
        campaignNote: campaign.notes || ""
      },
      metadata: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        audienceType: campaign.audience_type,
        patientId: patient.id,
        patientCode: patient.patient_code || null
      },
      preferences: preferencesResponse.preferences,
      channels: activeChannels
    });

    if (deliveries.some((item) => item.status === "sent")) {
      successfulRecipients += 1;
    } else {
      failedRecipients += 1;
    }
  }

  const totalRecipients = audience.length;
  const status =
    totalRecipients === 0
      ? "failed"
      : successfulRecipients === totalRecipients
        ? "sent"
        : successfulRecipients > 0
          ? "partial"
          : "failed";

  const updated = await notificationsModel.updateNotificationCampaignResult(organizationId, campaign.id, {
    status,
    totalRecipients,
    successfulRecipients,
    failedRecipients,
    lastSentAt: new Date().toISOString()
  });

  return {
    campaign: updated,
    summary: {
      totalRecipients,
      successfulRecipients,
      failedRecipients
    }
  };
};

module.exports = {
  getNotificationPreferences,
  updateNotificationPreferences,
  listNotificationLogs,
  listNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  listNotificationCampaigns,
  createNotificationCampaign,
  sendNotificationCampaign,
  recordNotificationLog,
  sendReminderDeliveries
};
