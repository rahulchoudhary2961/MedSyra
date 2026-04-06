const authModel = require("../models/auth.model");
const appointmentsModel = require("../models/appointments.model");
const { sendMail } = require("./mail.service");
const { sendSmsText } = require("./sms.service");
const notificationsService = require("./notifications.service");

const formatDateLabel = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateValue
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const formatTimeLabel = (timeValue) => {
  const [hours, minutes] = String(timeValue || "09:00").slice(0, 5).split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};

const buildDailyScheduleLines = ({ organizationName, date, appointments }) => {
  const dateLabel = formatDateLabel(date);
  const header = `Daily schedule for ${organizationName} on ${dateLabel}`;
  const lines = appointments.length
    ? appointments.map((appointment) => {
        const doctor = appointment.doctor_name || "Unassigned doctor";
        const patient = appointment.patient_name || appointment.title || "Patient";
        return `${formatTimeLabel(appointment.appointment_time)} - ${patient} with ${doctor} (${appointment.status})`;
      })
    : ["No appointments are scheduled for today."];

  return {
    subject: header,
    body: [header, "", ...lines].join("\n")
  };
};

const sendDailyScheduleNotifications = async ({ date, organizationId = null }) => {
  const recipients = await authModel.listDailyScheduleRecipients(organizationId);
  const appointmentsByOrgDate = new Map();
  const preferencesByOrg = new Map();
  const results = [];

  for (const recipient of recipients) {
    const cacheKey = `${recipient.organization_id}:${date}`;
    if (!appointmentsByOrgDate.has(cacheKey)) {
      appointmentsByOrgDate.set(
        cacheKey,
        await appointmentsModel.listAppointmentsForDate(recipient.organization_id, date)
      );
    }
    if (!preferencesByOrg.has(recipient.organization_id)) {
      const preferencesResponse = await notificationsService.getNotificationPreferences(recipient.organization_id);
      preferencesByOrg.set(recipient.organization_id, preferencesResponse.preferences);
    }

    const schedule = buildDailyScheduleLines({
      organizationName: recipient.organization_name,
      date,
      appointments: appointmentsByOrgDate.get(cacheKey)
    });
    const preferences = preferencesByOrg.get(recipient.organization_id);
    const preview = schedule.body.replace(/\s+/g, " ").trim().slice(0, 160);

    if (recipient.notify_daily_schedule_email && preferences.staff_schedule_email_enabled) {
      try {
        if (!recipient.email) {
          throw new Error("Staff email is missing");
        }

        const sent = await sendMail({
          to: recipient.email,
          subject: schedule.subject,
          text: schedule.body
        });

        results.push({
          userId: recipient.id,
          organizationId: recipient.organization_id,
          channel: "email",
          status: sent ? "sent" : "fallback"
        });
        await notificationsService.recordNotificationLog({
          organizationId: recipient.organization_id,
          notificationType: "staff_daily_schedule",
          channel: "email",
          status: sent ? "sent" : "fallback",
          referenceId: recipient.id,
          recipient: recipient.email,
          messagePreview: preview,
          metadata: {
            userId: recipient.id,
            scheduleDate: date
          }
        });
      } catch (error) {
        results.push({
          userId: recipient.id,
          organizationId: recipient.organization_id,
          channel: "email",
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to send daily schedule email"
        });
        await notificationsService.recordNotificationLog({
          organizationId: recipient.organization_id,
          notificationType: "staff_daily_schedule",
          channel: "email",
          status: "failed",
          referenceId: recipient.id,
          recipient: recipient.email || null,
          messagePreview: preview,
          errorMessage: error instanceof Error ? error.message : "Failed to send daily schedule email",
          metadata: {
            userId: recipient.id,
            scheduleDate: date
          }
        });
      }
    }

    if (recipient.notify_daily_schedule_sms && preferences.staff_schedule_sms_enabled) {
      try {
        const result = await sendSmsText({
          phone: recipient.phone,
          body: schedule.body,
          organizationId: recipient.organization_id,
          referenceId: recipient.id,
          sourceFeature: "staff_daily_schedule",
          note: "Daily staff schedule SMS notification"
        });

        results.push({
          userId: recipient.id,
          organizationId: recipient.organization_id,
          channel: "sms",
          status: "sent",
          recipient: result.recipient
        });
        await notificationsService.recordNotificationLog({
          organizationId: recipient.organization_id,
          notificationType: "staff_daily_schedule",
          channel: "sms",
          status: "sent",
          referenceId: recipient.id,
          recipient: result.recipient,
          messagePreview: preview,
          metadata: {
            userId: recipient.id,
            scheduleDate: date
          }
        });
      } catch (error) {
        results.push({
          userId: recipient.id,
          organizationId: recipient.organization_id,
          channel: "sms",
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to send daily schedule SMS"
        });
        await notificationsService.recordNotificationLog({
          organizationId: recipient.organization_id,
          notificationType: "staff_daily_schedule",
          channel: "sms",
          status: "failed",
          referenceId: recipient.id,
          recipient: recipient.phone || null,
          messagePreview: preview,
          errorMessage: error instanceof Error ? error.message : "Failed to send daily schedule SMS",
          metadata: {
            userId: recipient.id,
            scheduleDate: date
          }
        });
      }
    }
  }

  return results;
};

module.exports = {
  sendDailyScheduleNotifications,
  buildDailyScheduleLines
};
