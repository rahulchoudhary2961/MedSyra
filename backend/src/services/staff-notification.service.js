const authModel = require("../models/auth.model");
const appointmentsModel = require("../models/appointments.model");
const { sendMail } = require("./mail.service");
const { sendWhatsAppText } = require("./whatsapp-reminder.service");

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
  const results = [];

  for (const recipient of recipients) {
    const cacheKey = `${recipient.organization_id}:${date}`;
    if (!appointmentsByOrgDate.has(cacheKey)) {
      appointmentsByOrgDate.set(
        cacheKey,
        await appointmentsModel.listAppointmentsForDate(recipient.organization_id, date)
      );
    }

    const schedule = buildDailyScheduleLines({
      organizationName: recipient.organization_name,
      date,
      appointments: appointmentsByOrgDate.get(cacheKey)
    });

    if (recipient.notify_daily_schedule_email) {
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
      } catch (error) {
        results.push({
          userId: recipient.id,
          organizationId: recipient.organization_id,
          channel: "email",
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to send daily schedule email"
        });
      }
    }

    if (recipient.notify_daily_schedule_sms) {
      try {
        const result = await sendWhatsAppText({
          phone: recipient.phone,
          body: schedule.body
        });

        results.push({
          userId: recipient.id,
          organizationId: recipient.organization_id,
          channel: "sms",
          status: "sent",
          recipient: result.recipient
        });
      } catch (error) {
        results.push({
          userId: recipient.id,
          organizationId: recipient.organization_id,
          channel: "sms",
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to send daily schedule SMS"
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
