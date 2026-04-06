const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const loadWithMocks = (modulePath, mocks) => {
  const resolvedPath = require.resolve(modulePath);
  const originalLoad = Module._load;

  Module._load = function mockedLoad(request, parent, isMain) {
    const resolvedRequest = Module._resolveFilename(request, parent);
    if (Object.prototype.hasOwnProperty.call(mocks, resolvedRequest)) {
      return mocks[resolvedRequest];
    }
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[resolvedPath];
  try {
    return require(resolvedPath);
  } finally {
    Module._load = originalLoad;
  }
};

const run = async () => {
  const servicePath = path.resolve(__dirname, "./staff-notification.service.js");
  const authModelPath = require.resolve(path.resolve(__dirname, "../models/auth.model.js"));
  const appointmentsModelPath = require.resolve(path.resolve(__dirname, "../models/appointments.model.js"));
  const mailServicePath = require.resolve(path.resolve(__dirname, "./mail.service.js"));
  const smsServicePath = require.resolve(path.resolve(__dirname, "./sms.service.js"));
  const notificationsServicePath = require.resolve(path.resolve(__dirname, "./notifications.service.js"));

  const sent = [];
  const service = loadWithMocks(servicePath, {
    [authModelPath]: {
      listDailyScheduleRecipients: async () => [
        {
          id: "staff-1",
          organization_id: "org-1",
          organization_name: "City General",
          email: "reception@example.com",
          phone: "9888877777",
          notify_daily_schedule_email: true,
          notify_daily_schedule_sms: false
        },
        {
          id: "staff-2",
          organization_id: "org-1",
          organization_name: "City General",
          email: "frontdesk@example.com",
          phone: "9777766666",
          notify_daily_schedule_email: false,
          notify_daily_schedule_sms: true
        }
      ]
    },
    [appointmentsModelPath]: {
      listAppointmentsForDate: async () => [
        {
          id: "appt-1",
          patient_name: "S Mahesh",
          appointment_time: "09:30:00",
          status: "confirmed",
          doctor_name: "Dr. Rao"
        }
      ]
    },
    [mailServicePath]: {
      sendMail: async (payload) => {
        sent.push({ channel: "email", payload });
        return true;
      }
    },
    [smsServicePath]: {
      sendSmsText: async (payload) => {
        sent.push({ channel: "sms", payload });
        return { recipient: "+919777766666" };
      }
    },
    [notificationsServicePath]: {
      getNotificationPreferences: async () => ({
        preferences: {
          staff_schedule_email_enabled: true,
          staff_schedule_sms_enabled: true
        }
      }),
      recordNotificationLog: async () => ({ id: "log-1" })
    }
  });

  const results = await service.sendDailyScheduleNotifications({ date: "2026-04-03" });
  assert.equal(results.length, 2);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].channel, "email");
  assert.match(sent[0].payload.subject, /Daily schedule for City General/);
  assert.match(sent[0].payload.text, /S Mahesh/);
  assert.equal(sent[1].channel, "sms");
  assert.match(sent[1].payload.body, /Dr\. Rao/);
};

module.exports = run;
