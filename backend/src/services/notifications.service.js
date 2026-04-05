const env = require("../config/env");
const notificationsModel = require("../models/notifications.model");
const { sendWhatsAppText } = require("./whatsapp-reminder.service");
const { sendSmsText } = require("./sms.service");
const { getMailConfigStatus } = require("./mail.service");

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
        configured: !env.smsReminderEnabled || Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioFromNumber)
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

const listNotificationLogs = async (organizationId, query) => {
  return notificationsModel.listNotificationLogs(organizationId, query);
};

const recordNotificationLog = async (payload) => {
  return notificationsModel.createNotificationLog(payload);
};

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

  return {
    whatsapp: false,
    sms: false
  };
};

const truncatePreview = (body) => String(body || "").replace(/\s+/g, " ").trim().slice(0, 160);

const sendReminderDeliveries = async ({
  organizationId,
  actorUserId = null,
  notificationType,
  referenceId = null,
  phone,
  body,
  metadata = {},
  preferences
}) => {
  const deliveries = [];
  const channels = getReminderChannels(preferences, notificationType);
  const preview = truncatePreview(body);

  if (channels.whatsapp) {
    try {
      const result = await sendWhatsAppText({
        phone,
        body,
        organizationId,
        actorUserId,
        sourceFeature: notificationType,
        referenceId,
        note: `${notificationType} WhatsApp notification`
      });

      await recordNotificationLog({
        organizationId,
        actorUserId,
        notificationType,
        channel: "whatsapp",
        status: "sent",
        referenceId,
        recipient: result.recipient,
        messagePreview: preview,
        metadata
      });

      deliveries.push({
        channel: "whatsapp",
        status: "sent",
        recipient: result.recipient
      });
    } catch (error) {
      await recordNotificationLog({
        organizationId,
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
    try {
      const result = await sendSmsText({
        phone,
        body,
        organizationId,
        actorUserId,
        sourceFeature: notificationType,
        referenceId,
        note: `${notificationType} SMS notification`
      });

      await recordNotificationLog({
        organizationId,
        actorUserId,
        notificationType,
        channel: "sms",
        status: "sent",
        referenceId,
        recipient: result.recipient,
        messagePreview: preview,
        metadata
      });

      deliveries.push({
        channel: "sms",
        status: "sent",
        recipient: result.recipient
      });
    } catch (error) {
      await recordNotificationLog({
        organizationId,
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

module.exports = {
  getNotificationPreferences,
  updateNotificationPreferences,
  listNotificationLogs,
  recordNotificationLog,
  sendReminderDeliveries
};
