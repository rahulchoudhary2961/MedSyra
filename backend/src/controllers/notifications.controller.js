const asyncHandler = require("../utils/async-handler");
const notificationsService = require("../services/notifications.service");

const getPreferences = asyncHandler(async (req, res) => {
  const data = await notificationsService.getNotificationPreferences(req.user.organizationId);
  res.json({ success: true, data });
});

const updatePreferences = asyncHandler(async (req, res) => {
  const data = await notificationsService.updateNotificationPreferences(req.user.organizationId, req.body);
  res.json({ success: true, message: "Notification preferences updated", data });
});

const listLogs = asyncHandler(async (req, res) => {
  const items = await notificationsService.listNotificationLogs(req.user.organizationId, req.query);
  res.json({ success: true, data: { items } });
});

const listTemplates = asyncHandler(async (req, res) => {
  const items = await notificationsService.listNotificationTemplates(req.user.organizationId, req.query);
  res.json({ success: true, data: { items } });
});

const createTemplate = asyncHandler(async (req, res) => {
  const data = await notificationsService.createNotificationTemplate(req.user.organizationId, req.body);
  res.status(201).json({ success: true, message: "Notification template created", data });
});

const updateTemplate = asyncHandler(async (req, res) => {
  const data = await notificationsService.updateNotificationTemplate(req.user.organizationId, req.params.id, req.body);
  res.json({ success: true, message: "Notification template updated", data });
});

const listCampaigns = asyncHandler(async (req, res) => {
  const items = await notificationsService.listNotificationCampaigns(req.user.organizationId, req.query);
  res.json({ success: true, data: { items } });
});

const createCampaign = asyncHandler(async (req, res) => {
  const data = await notificationsService.createNotificationCampaign(req.user.organizationId, {
    ...req.body,
    branchId: req.branchContext?.writeBranchId || null,
    channelConfig: {
      whatsapp: req.body.sendWhatsapp !== false,
      sms: req.body.sendSms === true
    },
    createdByUserId: req.user.sub
  });
  res.status(201).json({ success: true, message: "Notification campaign created", data });
});

const sendCampaign = asyncHandler(async (req, res) => {
  const data = await notificationsService.sendNotificationCampaign(
    req.user.organizationId,
    req.params.id,
    req.user.sub
  );
  res.json({ success: true, message: "Notification campaign processed", data });
});

module.exports = {
  getPreferences,
  updatePreferences,
  listLogs,
  listTemplates,
  createTemplate,
  updateTemplate,
  listCampaigns,
  createCampaign,
  sendCampaign
};
