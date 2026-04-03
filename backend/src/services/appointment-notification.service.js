const { sendMail } = require("./mail.service");
const { sendWhatsAppText } = require("./whatsapp-reminder.service");

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
    } catch (error) {
      notifications.push({
        channel: "email",
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to send email"
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
      const result = await sendWhatsAppText({
        phone: appointment.mobile_number,
        body,
        organizationId,
        sourceFeature: "appointment_no_show_notification",
        referenceId: appointment.id,
        note: "Appointment no-show WhatsApp notification"
      });
      notifications.push({
        channel: "sms",
        status: "sent",
        recipient: result.recipient
      });
    } catch (error) {
      notifications.push({
        channel: "sms",
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to send SMS"
      });
    }
  }

  return notifications;
};

module.exports = {
  sendNoShowNotifications
};
