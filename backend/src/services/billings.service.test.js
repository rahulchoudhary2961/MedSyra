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

const servicePath = path.resolve(__dirname, "billings.service.js");
const apiErrorPath = require.resolve(path.resolve(__dirname, "../utils/api-error.js"));
const modelPath = require.resolve(path.resolve(__dirname, "../models/billings.model.js"));
const patientsModelPath = require.resolve(path.resolve(__dirname, "../models/patients.model.js"));
const doctorsModelPath = require.resolve(path.resolve(__dirname, "../models/doctors.model.js"));
const appointmentsModelPath = require.resolve(path.resolve(__dirname, "../models/appointments.model.js"));
const pdfPath = require.resolve(path.resolve(__dirname, "../utils/pdf.js"));
const cachePath = require.resolve(path.resolve(__dirname, "../utils/cache.js"));

const run = async () => {
  const ApiError = require(apiErrorPath);
  {
    const service = loadWithMocks(servicePath, {
      [modelPath]: {
        createInvoice: async () => {
          throw new Error("should not be called");
        }
      },
      [patientsModelPath]: {
        getPatientById: async () => ({ id: "patient-1" })
      },
      [doctorsModelPath]: {
        getDoctorById: async () => ({ id: "doctor-1", consultation_fee: 500 })
      },
      [appointmentsModelPath]: {
        getAppointmentById: async () => ({
          id: "appt-1",
          patient_id: "patient-2",
          doctor_id: "doctor-1",
          invoice_id: null
        })
      },
      [pdfPath]: { createInvoicePdfBuffer: () => Buffer.from("") },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} }
    });

    await assert.rejects(
      service.createInvoice("org-1", {
        patientId: "patient-1",
        doctorId: "doctor-1",
        appointmentId: "appt-1",
        description: "Consultation"
      }),
      (error) => error instanceof ApiError && error.message === "Appointment does not belong to the selected patient"
    );
  }

  {
    const service = loadWithMocks(servicePath, {
      [modelPath]: {
        getInvoiceById: async () => ({ id: "inv-1", status: "issued" }),
        updateInvoice: async () => {
          throw new Error("should not be called");
        }
      },
      [patientsModelPath]: {},
      [doctorsModelPath]: {},
      [appointmentsModelPath]: {},
      [pdfPath]: { createInvoicePdfBuffer: () => Buffer.from("") },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} }
    });

    await assert.rejects(
      service.updateInvoice("org-1", "inv-1", { notes: "changed" }),
      (error) => error instanceof ApiError && error.message === "Only draft invoices can be edited"
    );
  }

  {
    const service = loadWithMocks(servicePath, {
      [modelPath]: {
        getInvoiceById: async () => ({ id: "inv-1", status: "issued", balance_amount: 100 }),
        addPayment: async () => {
          throw new Error("should not be called");
        }
      },
      [patientsModelPath]: {},
      [doctorsModelPath]: {},
      [appointmentsModelPath]: {},
      [pdfPath]: { createInvoicePdfBuffer: () => Buffer.from("") },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} }
    });

    await assert.rejects(
      service.recordPayment("org-1", "inv-1", { amount: 50, method: "cash", status: "refunded" }),
      (error) => error instanceof ApiError && error.message === "Refunds must be handled through a dedicated refund flow"
    );
  }

  {
    const service = loadWithMocks(servicePath, {
      [modelPath]: {
        getInvoiceById: async () => ({
          id: "inv-1",
          status: "paid",
          payments: [{ id: "pay-1", status: "failed" }]
        })
      },
      [patientsModelPath]: {},
      [doctorsModelPath]: {},
      [appointmentsModelPath]: {},
      [pdfPath]: { createInvoicePdfBuffer: () => Buffer.from("") },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} }
    });

    await assert.rejects(
      service.refundPayment("org-1", "inv-1", { paymentId: "pay-1" }),
      (error) => error instanceof ApiError && error.message === "Only completed payments can be refunded"
    );
  }

  {
    let refundArgs = null;
    const service = loadWithMocks(servicePath, {
      [modelPath]: {
        getInvoiceById: async () => ({
          id: "inv-1",
          status: "paid",
          payments: [{ id: "pay-2", status: "completed" }]
        }),
        refundPayment: async (...args) => {
          refundArgs = args;
          return { invoice: { id: "inv-1", status: "issued" }, payment: { id: "pay-2", status: "refunded" } };
        }
      },
      [patientsModelPath]: {},
      [doctorsModelPath]: {},
      [appointmentsModelPath]: {},
      [pdfPath]: { createInvoicePdfBuffer: () => Buffer.from("") },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} }
    });

    const result = await service.refundPayment(
      "org-1",
      "inv-1",
      { paymentId: "pay-2", reason: "Duplicate charge" },
      { sub: "user-2" }
    );

    assert.equal(result.payment.status, "refunded");
    assert.equal(refundArgs[2], "pay-2");
    assert.equal(refundArgs[3].reason, "Duplicate charge");
    assert.equal(refundArgs[4].sub, "user-2");
  }

  {
    let receivedActor = null;
    const actor = { sub: "user-1", role: "admin" };
    const createdInvoice = { id: "inv-1" };
    const service = loadWithMocks(servicePath, {
      [modelPath]: {
        createInvoice: async (_organizationId, _payload, passedActor) => {
          receivedActor = passedActor;
          return createdInvoice;
        }
      },
      [patientsModelPath]: {
        getPatientById: async () => ({ id: "patient-1" })
      },
      [doctorsModelPath]: {
        getDoctorById: async () => ({ id: "doctor-1", consultation_fee: 500 })
      },
      [appointmentsModelPath]: {},
      [pdfPath]: { createInvoicePdfBuffer: () => Buffer.from("") },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} }
    });

    const result = await service.createInvoice(
      "org-1",
      { patientId: "patient-1", doctorId: "doctor-1", description: "Consultation" },
      actor
    );

    assert.equal(result, createdInvoice);
    assert.deepEqual(receivedActor, actor);
  }

  {
    const reconciliationReport = {
      summary: {
        totalInvoices: 4,
        mismatchedInvoices: 1
      },
      items: [{ id: "inv-9" }]
    };
    const service = loadWithMocks(servicePath, {
      [modelPath]: {
        getReconciliationReport: async () => reconciliationReport
      },
      [patientsModelPath]: {},
      [doctorsModelPath]: {},
      [appointmentsModelPath]: {},
      [pdfPath]: { createInvoicePdfBuffer: () => Buffer.from("") },
      [cachePath]: { invalidateByPrefix: async () => {}, get: async () => null, set: async () => {} }
    });

    const result = await service.getReconciliationReport("org-1");
    assert.equal(result, reconciliationReport);
  }

  {
    let receivedInvoice = null;
    const pdfBuffer = Buffer.from("invoice-pdf");
    const invoice = {
      id: "inv-7",
      invoice_number: "INV-0007",
      organization_name: "City Clinic",
      patient_name: "Amit Sharma",
      doctor_name: "Dr. Rao",
      issue_date: "2026-04-04",
      due_date: "2026-04-05",
      status: "issued",
      total_amount: 500,
      paid_amount: 200,
      balance_amount: 300,
      currency: "INR",
      notes: "Consultation",
      items: [{ description: "Consultation", quantity: 1, unit_price: 500, total_amount: 500 }]
    };
    const service = loadWithMocks(servicePath, {
      [modelPath]: {
        getInvoiceById: async () => invoice
      },
      [patientsModelPath]: {},
      [doctorsModelPath]: {},
      [appointmentsModelPath]: {},
      [pdfPath]: {
        createInvoicePdfBuffer: (invoice) => {
          receivedInvoice = invoice;
          return pdfBuffer;
        }
      },
      [cachePath]: {
        invalidateByPrefix: async () => {},
        get: async () => null,
        set: async () => {}
      }
    });

    const result = await service.generateInvoicePdf("org-1", "inv-7");
    assert.equal(result.filename, "INV-0007.pdf");
    assert.equal(result.buffer, pdfBuffer);
    assert.equal(receivedInvoice.organization_name, "City Clinic");
  }
};

module.exports = run;
