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

const modelPath = path.resolve(__dirname, "billings.model.js");
const dbPath = require.resolve(path.resolve(__dirname, "../config/db.js"));
const paginationPath = require.resolve(path.resolve(__dirname, "../utils/pagination.js"));
const auditModelPath = require.resolve(path.resolve(__dirname, "./billing-audit.model.js"));
const paymentLinksModelPath = require.resolve(path.resolve(__dirname, "./payment-links.model.js"));

const buildClient = ({ beforeInvoice, afterInvoice, insertedPayment, queries }) => {
  let detailPhase = "before";
  let paymentStatus = insertedPayment?.status || "completed";

  return {
    query: async (sql, params) => {
      queries.push(sql);

      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }

      if (sql.includes("SELECT id FROM invoices") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: beforeInvoice.id }] };
      }

      if (sql.includes("FROM invoices i")) {
        return { rows: [detailPhase === "before" ? beforeInvoice : afterInvoice] };
      }

      if (sql.includes("FROM invoice_items")) {
        return {
          rows: [
            {
              id: "item-1",
              description: "Consultation",
              quantity: 1,
              unit_price: beforeInvoice.total_amount,
              total_amount: beforeInvoice.total_amount
            }
          ]
        };
      }

      if (sql.includes("FROM payments") && sql.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              ...insertedPayment,
              status: paymentStatus
            }
          ]
        };
      }

      if (sql.includes("FROM payments")) {
        return {
          rows:
            detailPhase === "before"
              ? []
              : [
                  {
                    ...insertedPayment,
                    status: paymentStatus
                  }
                ]
        };
      }

      if (sql.includes("INSERT INTO payments")) {
        detailPhase = "after";
        return { rows: [insertedPayment] };
      }

      if (sql.includes("UPDATE payments") && sql.includes("SET status = 'refunded'")) {
        paymentStatus = "refunded";
        detailPhase = "after";
        return {
          rows: [
            {
              ...insertedPayment,
              status: "refunded",
              refunded_at: params[3]
            }
          ]
        };
      }

      if (sql.includes("UPDATE invoices") && sql.includes("SET paid_amount")) {
        detailPhase = "after";
        return { rows: [] };
      }

      throw new Error(`Unhandled query in test: ${sql}`);
    },
    release: () => {}
  };
};

const run = async () => {
  {
    const queries = [];
    const auditCalls = [];
    const beforeInvoice = {
      id: "inv-1",
      invoice_number: "INV-0001",
      patient_id: "patient-1",
      patient_name: "Jane Doe",
      doctor_id: "doctor-1",
      doctor_name: "Dr. A",
      appointment_id: null,
      issue_date: "2026-04-01",
      due_date: null,
      status: "issued",
      total_amount: 100,
      paid_amount: 0,
      balance_amount: 100,
      currency: "INR",
      notes: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z"
    };
    const insertedPayment = {
      id: "pay-1",
      amount: 100,
      method: "cash",
      reference: null,
      status: "completed",
      paid_at: "2026-04-02T00:00:00.000Z",
      created_at: "2026-04-02T00:00:00.000Z"
    };
    const afterInvoice = {
      ...beforeInvoice,
      status: "paid",
      paid_amount: 100,
      balance_amount: 0
    };
    const client = buildClient({ beforeInvoice, afterInvoice, insertedPayment, queries });

    const model = loadWithMocks(modelPath, {
      [dbPath]: {
        connect: async () => client
      },
      [paginationPath]: () => ({ offset: 0, limit: 10, page: 1 }),
      [paymentLinksModelPath]: {
        listPaymentLinksByInvoiceId: async () => []
      },
      [auditModelPath]: {
        createBillingAuditLog: async (_db, payload) => {
          auditCalls.push(payload);
          return { id: "audit-1" };
        }
      }
    });

    const payment = await model.addPayment(
      "org-1",
      "inv-1",
      { amount: 100, method: "cash", status: "completed" },
      { sub: "user-1" }
    );

    assert.equal(payment.id, "pay-1");
    assert.ok(queries.some((sql) => sql.includes("UPDATE invoices") && sql.includes("SET paid_amount")));
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].action, "payment_recorded");
    assert.equal(auditCalls[0].actorUserId, "user-1");
    assert.equal(auditCalls[0].beforeState.balance_amount, 100);
    assert.equal(auditCalls[0].afterState.balance_amount, 0);
  }

  {
    const queries = [];
    const auditCalls = [];
    const beforeInvoice = {
      id: "inv-1",
      invoice_number: "INV-0001",
      patient_id: "patient-1",
      patient_name: "Jane Doe",
      doctor_id: "doctor-1",
      doctor_name: "Dr. A",
      appointment_id: null,
      issue_date: "2026-04-01",
      due_date: null,
      status: "issued",
      total_amount: 100,
      paid_amount: 0,
      balance_amount: 100,
      currency: "INR",
      notes: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z"
    };
    const insertedPayment = {
      id: "pay-2",
      amount: 40,
      method: "card",
      reference: "ref-1",
      status: "failed",
      paid_at: "2026-04-02T00:00:00.000Z",
      created_at: "2026-04-02T00:00:00.000Z"
    };
    const afterInvoice = {
      ...beforeInvoice
    };
    const client = buildClient({ beforeInvoice, afterInvoice, insertedPayment, queries });

    const model = loadWithMocks(modelPath, {
      [dbPath]: {
        connect: async () => client
      },
      [paginationPath]: () => ({ offset: 0, limit: 10, page: 1 }),
      [paymentLinksModelPath]: {
        listPaymentLinksByInvoiceId: async () => []
      },
      [auditModelPath]: {
        createBillingAuditLog: async (_db, payload) => {
          auditCalls.push(payload);
          return { id: "audit-2" };
        }
      }
    });

    const payment = await model.addPayment(
      "org-1",
      "inv-1",
      { amount: 40, method: "card", status: "failed", reference: "ref-1" },
      { sub: "user-2" }
    );

    assert.equal(payment.status, "failed");
    assert.ok(!queries.some((sql) => sql.includes("UPDATE invoices") && sql.includes("SET paid_amount")));
    assert.equal(auditCalls.length, 1);
    assert.equal(auditCalls[0].beforeState.balance_amount, 100);
    assert.equal(auditCalls[0].afterState.balance_amount, 100);
    assert.equal(auditCalls[0].metadata.paymentStatus, "failed");
  }

  {
    const queries = [];
    const auditCalls = [];
    const beforeInvoice = {
      id: "inv-7",
      invoice_number: "INV-0007",
      patient_id: "patient-1",
      patient_name: "Jane Doe",
      doctor_id: "doctor-1",
      doctor_name: "Dr. A",
      appointment_id: null,
      issue_date: "2026-04-01",
      due_date: "2026-04-10",
      status: "paid",
      total_amount: 100,
      paid_amount: 100,
      balance_amount: 0,
      currency: "INR",
      notes: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z"
    };
    const insertedPayment = {
      id: "pay-7",
      amount: 100,
      method: "cash",
      reference: null,
      status: "completed",
      paid_at: "2026-04-02T00:00:00.000Z",
      created_at: "2026-04-02T00:00:00.000Z"
    };
    const afterInvoice = {
      ...beforeInvoice,
      status: "issued",
      paid_amount: 0,
      balance_amount: 100
    };
    const client = buildClient({ beforeInvoice, afterInvoice, insertedPayment, queries });
    const model = loadWithMocks(modelPath, {
      [dbPath]: {
        connect: async () => client,
        query: async () => ({ rows: [] })
      },
      [paginationPath]: () => ({ offset: 0, limit: 10, page: 1 }),
      [paymentLinksModelPath]: {
        listPaymentLinksByInvoiceId: async () => []
      },
      [auditModelPath]: {
        createBillingAuditLog: async (_db, payload) => {
          auditCalls.push(payload);
          return { id: "audit-7" };
        }
      }
    });

    const result = await model.refundPayment(
      "org-1",
      "inv-7",
      "pay-7",
      { reason: "Duplicate charge", refundedAt: "2026-04-03T09:00:00.000Z" },
      { sub: "user-9" }
    );

    assert.equal(result.payment.status, "refunded");
    assert.ok(queries.some((sql) => sql.includes("UPDATE payments") && sql.includes("refunded")));
    assert.ok(queries.some((sql) => sql.includes("UPDATE invoices") && sql.includes("balance_amount")));
    assert.equal(auditCalls[0].action, "payment_refunded");
    assert.equal(auditCalls[0].metadata.reason, "Duplicate charge");
  }
};

module.exports = run;
