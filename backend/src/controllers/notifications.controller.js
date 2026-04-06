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

module.exports = {
  getPreferences,
  updatePreferences,
  listLogs
};
