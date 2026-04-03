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

const servicePath = path.resolve(__dirname, "./appointments.service.js");
const apiErrorPath = require.resolve(path.resolve(__dirname, "../utils/api-error.js"));
const appointmentsModelPath = require.resolve(path.resolve(__dirname, "../models/appointments.model.js"));
const doctorsModelPath = require.resolve(path.resolve(__dirname, "../models/doctors.model.js"));
const patientsModelPath = require.resolve(path.resolve(__dirname, "../models/patients.model.js"));
const medicalRecordsServicePath = require.resolve(path.resolve(__dirname, "./medical-records.service.js"));
const appointmentNotificationPath = require.resolve(path.resolve(__dirname, "./appointment-notification.service.js"));
const cachePath = require.resolve(path.resolve(__dirname, "../utils/cache.js"));
const availabilityPath = require.resolve(path.resolve(__dirname, "../utils/doctor-availability.js"));

const run = async () => {
  const ApiError = require(apiErrorPath);

  {
    const service = loadWithMocks(servicePath, {
      [appointmentsModelPath]: {
        getAppointmentById: async () => ({
          id: "appt-1",
          status: "completed"
        })
      },
      [doctorsModelPath]: {},
      [patientsModelPath]: {},
      [medicalRecordsServicePath]: {},
      [appointmentNotificationPath]: {
        sendNoShowNotifications: async () => []
      },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} },
      [availabilityPath]: { isDoctorAvailableForSlot: () => true }
    });

    await assert.rejects(
      service.markAppointmentNoShow("org-1", "appt-1", {}),
      (error) => error instanceof ApiError && error.message === "This appointment cannot be marked as no-show"
    );
  }

  {
    let passedNotificationArgs = null;
    const invalidatedPrefixes = [];
    const updatedAppointment = {
      id: "appt-2",
      patient_name: "S Mahesh",
      email: "mahesh@example.com",
      mobile_number: "9888877777",
      appointment_date: "2026-04-03",
      appointment_time: "10:00:00",
      status: "no-show"
    };

    const service = loadWithMocks(servicePath, {
      [appointmentsModelPath]: {
        getAppointmentById: async () => ({
          id: "appt-2",
          title: "S Mahesh",
          patient_id: "patient-1",
          patient_name: "S Mahesh",
          mobile_number: "9888877777",
          email: "mahesh@example.com",
          doctor_id: "doctor-1",
          category: "consultation",
          status: "confirmed",
          appointment_date: "2026-04-03",
          appointment_time: "10:00:00",
          duration_minutes: 15,
          planned_procedures: null,
          notes: "note"
        }),
        updateAppointment: async () => updatedAppointment,
        getAppointmentReminderContext: async () => ({
          clinic_name: "City General",
          doctor_name: "Dr. Rao"
        })
      },
      [doctorsModelPath]: {},
      [patientsModelPath]: {},
      [medicalRecordsServicePath]: {},
      [appointmentNotificationPath]: {
        sendNoShowNotifications: async (args) => {
          passedNotificationArgs = args;
          return [{ channel: "email", status: "sent", recipient: "mahesh@example.com" }];
        }
      },
      [cachePath]: {
        invalidateByPrefix: async (prefix) => {
          invalidatedPrefixes.push(prefix);
        },
        get: async () => null,
        set: async () => {}
      },
      [availabilityPath]: { isDoctorAvailableForSlot: () => true }
    });

    const result = await service.markAppointmentNoShow(
      "org-1",
      "appt-2",
      { notifySms: true, notifyEmail: true }
    );

    assert.equal(result.appointment, updatedAppointment);
    assert.equal(result.notifications.length, 1);
    assert.equal(passedNotificationArgs.notifySms, true);
    assert.equal(passedNotificationArgs.notifyEmail, true);
    assert.ok(invalidatedPrefixes.includes("appointments:list:org-1:"));
    assert.ok(invalidatedPrefixes.includes("dashboard:summary:org-1"));
    assert.ok(invalidatedPrefixes.includes("dashboard:reports:org-1"));
  }

  {
    const service = loadWithMocks(servicePath, {
      [appointmentsModelPath]: {
        getAppointmentById: async () => ({
          id: "appt-3",
          doctor_id: "doctor-owner",
          status: "confirmed"
        })
      },
      [doctorsModelPath]: {
        getDoctorByUserId: async () => ({ id: "doctor-other" })
      },
      [patientsModelPath]: {},
      [medicalRecordsServicePath]: {},
      [appointmentNotificationPath]: {
        sendNoShowNotifications: async () => []
      },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} },
      [availabilityPath]: { isDoctorAvailableForSlot: () => true }
    });

    await assert.rejects(
      service.markAppointmentNoShow("org-1", "appt-3", {}, { role: "doctor", sub: "user-2" }),
      (error) => error instanceof ApiError && error.message === "You can only update your own appointments"
    );
  }
};

module.exports = run;
