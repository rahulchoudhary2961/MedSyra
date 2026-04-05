const { sendMail } = require("./mail.service");
const { sendSmsText } = require("./sms.service");
const notificationsService = require("./notifications.service");

const buildNoShowEmail = ({ patientName, clinicName, doctorName, appointmentDate, appointmentTime }) => {
  const firstName = String(patientName || "Patient").trim().split(/\s+/)[0] || "Patient";
  const clinic = clinicName || "your clinic";
  const doctor = doctorName || "Doctor";

  return {
    subject: `Appointment marked no-show at ${clinic}`,
    text: [
      `Hello ${firstName},`,
      "",
      `Your appointment at ${clinic} on ${appointmentDate} at ${String(appointmentTime || "").slice(0, 5)} has been marked as a no-show.`,
      "If you need to reschedule, please contact the clinic.",
      "",
      `- ${doctor}`
    ].join("\n")
  };
};

const buildNoShowSms = ({ patientName, clinicName, appointmentDate, appointmentTime }) => {
  const firstName = String(patientName || "Patient").trim().split(/\s+/)[0] || "Patient";
  const clinic = clinicName || "your clinic";

  return [
    `Hello ${firstName},`,
    `Your appointment at ${clinic} on ${appointmentDate} at ${String(appointmentTime || "").slice(0, 5)} was marked as no-show.`,
    "Reply or contact the clinic to reschedule."
  ].join("\n");
};

const sendNoShowNotifications = async ({ appointment, context, notifySms, notifyEmail, organizationId }) => {
  const notifications = [];
  const messagePreview = buildNoShowSms({
    patientName: appointment.patient_name || appointment.title,
    clinicName: context?.clinic_name,
    appointmentDate: appointment.appointment_date,
    appointmentTime: appointment.appointment_time
  }).replace(/\s+/g, " ").trim().slice(0, 160);

  if (notifyEmail) {
    try {
      if (!appointment.email) {
        throw new Error("Patient email is missing");
      }

      const email = buildNoShowEmail({
        patientName: appointment.patient_name || appointment.title,
        clinicName: context?.clinic_name,
        doctorName: context?.doctor_name,
        appointmentDate: appointment.appointment_date,
        appointmentTime: appointment.appointment_time
      });
      const sent = await sendMail({
        to: appointment.email,
        subject: email.subject,
        text: email.text
      });
      notifications.push({
        channel: "email",
        status: sent ? "sent" : "fallback",
        recipient: appointment.email
      });
      await notificationsService.recordNotificationLog({
        organizationId,
        notificationType: "appointment_no_show",
        channel: "email",
        status: sent ? "sent" : "fallback",
        referenceId: appointment.id,
        recipient: appointment.email,
        messagePreview,
        metadata: {
          appointmentId: appointment.id,
          patientName: appointment.patient_name || appointment.title
        }
      });
    } catch (error) {
      notifications.push({
        channel: "email",
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to send email"
      });
      await notificationsService.recordNotificationLog({
        organizationId,
        notificationType: "appointment_no_show",
        channel: "email",
        status: "failed",
        referenceId: appointment.id,
        recipient: appointment.email || null,
        messagePreview,
        errorMessage: error instanceof Error ? error.message : "Failed to send email",
        metadata: {
          appointmentId: appointment.id,
          patientName: appointment.patient_name || appointment.title
        }
      });
    }
  }

  if (notifySms) {
    try {
      const body = buildNoShowSms({
        patientName: appointment.patient_name || appointment.title,
        clinicName: context?.clinic_name,
        appointmentDate: appointment.appointment_date,
        appointmentTime: appointment.appointment_time
      });
      const result = await sendSmsText({
        phone: appointment.mobile_number,
        body,
        organizationId,
        sourceFeature: "appointment_no_show_notification",
        referenceId: appointment.id,
        note: "Appointment no-show SMS notification"
      });
      notifications.push({
        channel: "sms",
        status: "sent",
        recipient: result.recipient
      });
      await notificationsService.recordNotificationLog({
        organizationId,
        notificationType: "appointment_no_show",
        channel: "sms",
        status: "sent",
        referenceId: appointment.id,
        recipient: result.recipient,
        messagePreview: body.replace(/\s+/g, " ").trim().slice(0, 160),
        metadata: {
          appointmentId: appointment.id,
          patientName: appointment.patient_name || appointment.title
        }
      });
    } catch (error) {
      notifications.push({
        channel: "sms",
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to send SMS"
      });
      await notificationsService.recordNotificationLog({
        organizationId,
        notificationType: "appointment_no_show",
        channel: "sms",
        status: "failed",
        referenceId: appointment.id,
        recipient: appointment.mobile_number || null,
        messagePreview,
        errorMessage: error instanceof Error ? error.message : "Failed to send SMS",
        metadata: {
          appointmentId: appointment.id,
          patientName: appointment.patient_name || appointment.title
        }
      });
    }
  }

  return notifications;
};

module.exports = {
  sendNoShowNotifications
};
