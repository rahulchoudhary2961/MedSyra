const pool = require("../config/db");
const parsePagination = require("../utils/pagination");
const billingAuditModel = require("./billing-audit.model");

const getInvoiceByIdWithDb = async (db, organizationId, id) => {
  const invoiceQuery = `
    SELECT
      i.id,
      i.invoice_number,
      o.name AS organization_name,
      i.patient_id,
      p.full_name AS patient_name,
      i.doctor_id,
      d.full_name AS doctor_name,
      i.appointment_id,
      i.issue_date,
      i.due_date,
      i.status,
      i.total_amount,
      i.paid_amount,
      i.balance_amount,
      i.currency,
      i.notes,
      i.created_at,
      i.updated_at
    FROM invoices i
    JOIN organizations o ON o.id = i.organization_id
    LEFT JOIN patients p ON p.id = i.patient_id AND p.organization_id = i.organization_id
    LEFT JOIN doctors d ON d.id = i.doctor_id AND d.organization_id = i.organization_id
    WHERE i.organization_id = $1 AND i.id = $2
  `;
  const itemQuery = `
    SELECT id, description, quantity, unit_price, total_amount, created_at, updated_at
    FROM invoice_items
    WHERE invoice_id = $1
    ORDER BY created_at ASC
  `;
  const paymentQuery = `
    SELECT id, amount, method, reference, status, paid_at, refunded_at, created_at
    FROM payments
    WHERE organization_id = $1 AND invoice_id = $2
    ORDER BY paid_at DESC
  `;

  const invoiceResult = await db.query(invoiceQuery, [organizationId, id]);
  const invoice = invoiceResult.rows[0];
  if (!invoice) {
    return null;
  }

  const [itemsRes, paymentsRes] = await Promise.all([
    db.query(itemQuery, [id]),
    db.query(paymentQuery, [organizationId, id])
  ]);

  return {
    ...invoice,
    items: itemsRes.rows,
    payments: paymentsRes.rows
  };
};

const getNextInvoiceNumber = async (db, organizationId) => {
  const prefix = "INV";
  const query = `
    SELECT invoice_number
    FROM invoices
    WHERE organization_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const result = await db.query(query, [organizationId]);
  const last = result.rows[0]?.invoice_number || `${prefix}-0000`;
  const numeric = Number.parseInt(last.split("-")[1], 10) || 0;
  return `${prefix}-${String(numeric + 1).padStart(4, "0")}`;
};

const listInvoices = async (organizationId, query) => {
  const { offset, limit, page } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["i.organization_id = $1"];

  if (query.status) {
    values.push(query.status);
    conditions.push(`i.status = $${values.length}`);
  }

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(i.invoice_number ILIKE $${idx} OR p.full_name ILIKE $${idx})`);
  }

  if (query.patientId) {
    values.push(query.patientId);
    conditions.push(`i.patient_id = $${values.length}`);
  }

  values.push(limit, offset);
  const where = conditions.join(" AND ");

  const querySql = `
    SELECT
      i.id,
      i.invoice_number,
      o.name AS organization_name,
      i.patient_id,
      p.full_name AS patient_name,
      i.doctor_id,
      d.full_name AS doctor_name,
      i.appointment_id,
      i.issue_date,
      i.due_date,
      i.status,
      i.total_amount,
      i.paid_amount,
      i.balance_amount,
      i.currency,
      i.notes,
      i.created_at,
      i.updated_at
    FROM invoices i
    JOIN organizations o ON o.id = i.organization_id
    LEFT JOIN patients p ON p.id = i.patient_id AND p.organization_id = i.organization_id
    LEFT JOIN doctors d ON d.id = i.doctor_id AND d.organization_id = i.organization_id
    WHERE ${where}
    ORDER BY i.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM invoices i
    LEFT JOIN patients p ON p.id = i.patient_id AND p.organization_id = i.organization_id
    WHERE ${where}
  `;

  const statsSql = query.patientId
    ? `
        SELECT
          COALESCE(SUM(i.total_amount), 0)::numeric(12,2) AS total_revenue,
          COUNT(*) FILTER (WHERE i.status = 'paid')::int AS paid_invoices,
          COUNT(*) FILTER (WHERE i.status IN ('issued', 'partially_paid'))::int AS pending_invoices,
          COUNT(*) FILTER (WHERE i.status = 'overdue')::int AS overdue_invoices,
          (
            SELECT COALESCE(SUM(pay.amount), 0)::numeric(12,2)
            FROM payments pay
            INNER JOIN invoices inv ON inv.id = pay.invoice_id AND inv.organization_id = pay.organization_id
            WHERE pay.organization_id = $1 AND inv.patient_id = $2 AND pay.status = 'completed' AND pay.method = 'cash'
          ) AS cash_total,
          (
            SELECT COALESCE(SUM(pay.amount), 0)::numeric(12,2)
            FROM payments pay
            INNER JOIN invoices inv ON inv.id = pay.invoice_id AND inv.organization_id = pay.organization_id
            WHERE pay.organization_id = $1 AND inv.patient_id = $2 AND pay.status = 'completed' AND pay.method = 'upi'
          ) AS upi_total,
          (
            SELECT COALESCE(SUM(pay.amount), 0)::numeric(12,2)
            FROM payments pay
            INNER JOIN invoices inv ON inv.id = pay.invoice_id AND inv.organization_id = pay.organization_id
            WHERE pay.organization_id = $1 AND inv.patient_id = $2 AND pay.status = 'completed' AND pay.method = 'card'
          ) AS card_total
        FROM invoices i
        WHERE i.organization_id = $1 AND i.patient_id = $2
      `
    : `
        SELECT
          COALESCE(SUM(total_amount), 0)::numeric(12,2) AS total_revenue,
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_invoices,
          COUNT(*) FILTER (WHERE status IN ('issued', 'partially_paid'))::int AS pending_invoices,
          COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_invoices,
          (
            SELECT COALESCE(SUM(amount), 0)::numeric(12,2)
            FROM payments
            WHERE organization_id = $1 AND status = 'completed' AND method = 'cash'
          ) AS cash_total,
          (
            SELECT COALESCE(SUM(amount), 0)::numeric(12,2)
            FROM payments
            WHERE organization_id = $1 AND status = 'completed' AND method = 'upi'
          ) AS upi_total,
          (
            SELECT COALESCE(SUM(amount), 0)::numeric(12,2)
            FROM payments
            WHERE organization_id = $1 AND status = 'completed' AND method = 'card'
          ) AS card_total
        FROM invoices
        WHERE organization_id = $1
      `;

  const statsValues = query.patientId ? [organizationId, query.patientId] : [organizationId];

  const [rowsRes, countRes, statsRes] = await Promise.all([
    pool.query(querySql, values),
    pool.query(countSql, values.slice(0, values.length - 2)),
    pool.query(statsSql, statsValues)
  ]);

  return {
    items: rowsRes.rows,
    stats: {
      totalRevenue: Number(statsRes.rows[0].total_revenue || 0),
      paidInvoices: Number(statsRes.rows[0].paid_invoices || 0),
      pendingInvoices: Number(statsRes.rows[0].pending_invoices || 0),
      overdueInvoices: Number(statsRes.rows[0].overdue_invoices || 0),
      cashTotal: Number(statsRes.rows[0].cash_total || 0),
      upiTotal: Number(statsRes.rows[0].upi_total || 0),
      cardTotal: Number(statsRes.rows[0].card_total || 0)
    },
    pagination: {
      page,
      limit,
      total: countRes.rows[0].total,
      totalPages: Math.ceil(countRes.rows[0].total / limit) || 1
    }
  };
};

const getInvoiceById = async (organizationId, id) => {
  return getInvoiceByIdWithDb(pool, organizationId, id);
};

const createInvoice = async (organizationId, payload, actor = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [organizationId]);
    const invoiceNumber = await getNextInvoiceNumber(client, organizationId);
    const items = Array.isArray(payload.items) && payload.items.length > 0 ? payload.items : [];
    const amount = Number(items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0));
    const issueDate = payload.issueDate || new Date().toISOString().slice(0, 10);

    const invoiceQuery = `
      INSERT INTO invoices (
        organization_id, invoice_number, patient_id, doctor_id,
        appointment_id, issue_date, due_date, status, total_amount, paid_amount, balance_amount, currency, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$9,$10,$11)
      RETURNING *
    `;

    const invoiceValues = [
      organizationId,
      invoiceNumber,
      payload.patientId,
      payload.doctorId || null,
      payload.appointmentId || null,
      issueDate,
      payload.dueDate || null,
      payload.status || "draft",
      amount,
      payload.currency || "INR",
      payload.notes || null
    ];

    const invoiceRes = await client.query(invoiceQuery, invoiceValues);
    const invoice = invoiceRes.rows[0];

    const itemQuery = `
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_amount)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `;
    const itemRows = [];
    for (const item of items) {
      const itemRes = await client.query(itemQuery, [
        invoice.id,
        item.description,
        Number(item.quantity),
        Number(item.unitPrice),
        Number(item.totalAmount)
      ]);
      itemRows.push(itemRes.rows[0]);
    }
    const createdInvoice = {
      ...invoice,
      items: itemRows,
      payments: []
    };

    await billingAuditModel.createBillingAuditLog(client, {
      organizationId,
      invoiceId: invoice.id,
      actorUserId: actor?.sub || actor?.id || null,
      action: "invoice_created",
      beforeState: null,
      afterState: createdInvoice,
      metadata: {
        appointmentId: payload.appointmentId || null
      }
    });

    await client.query("COMMIT");
    return getInvoiceById(organizationId, invoice.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateInvoice = async (organizationId, id, payload, actor = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, id]);
    const current = await getInvoiceByIdWithDb(client, organizationId, id);
    if (!current) {
      await client.query("ROLLBACK");
      return null;
    }

    const nextItems = Array.isArray(payload.items) && payload.items.length > 0 ? payload.items : null;
    const amount =
      nextItems !== null
        ? Number(nextItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0))
        : payload.amount !== undefined
          ? Number(payload.amount)
          : Number(current.total_amount);
    const paid = Number(current.paid_amount);
    const balance = Math.max(amount - paid, 0);
    let status = current.status;
    if (payload.status) {
      status = payload.status;
    } else if (balance === 0 && paid > 0) {
      status = "paid";
    } else if (paid > 0 && balance > 0) {
      status = "partially_paid";
    }

    const invoiceQuery = `
      UPDATE invoices
      SET due_date = COALESCE($3, due_date),
          notes = $4,
          total_amount = $5,
          balance_amount = $6,
          status = $7,
          updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING *
    `;
    const invoiceRes = await client.query(invoiceQuery, [
      organizationId,
      id,
      payload.dueDate || null,
      payload.notes !== undefined ? payload.notes : current.notes,
      amount,
      balance,
      status
    ]);

    if (nextItems !== null) {
      await client.query("DELETE FROM invoice_items WHERE invoice_id = $1", [id]);
      for (const item of nextItems) {
        await client.query(
          `
          INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_amount)
          VALUES ($1,$2,$3,$4,$5)
          `,
          [id, item.description, Number(item.quantity), Number(item.unitPrice), Number(item.totalAmount)]
        );
      }
    } else if (payload.description || payload.amount !== undefined) {
      await client.query(
        `
        UPDATE invoice_items
        SET description = COALESCE($2, description),
            unit_price = $3,
            total_amount = $4,
            updated_at = NOW()
        WHERE invoice_id = $1
        `,
        [id, payload.description || null, amount, amount]
      );
    }

    const updatedInvoice = await getInvoiceByIdWithDb(client, organizationId, id);
    await billingAuditModel.createBillingAuditLog(client, {
      organizationId,
      invoiceId: id,
      actorUserId: actor?.sub || actor?.id || null,
      action: "invoice_updated",
      beforeState: current,
      afterState: updatedInvoice,
      metadata: {}
    });

    await client.query("COMMIT");
    return invoiceRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const issueInvoice = async (organizationId, id, dueDate = null, actor = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, id]);
    const beforeState = await getInvoiceByIdWithDb(client, organizationId, id);
    if (!beforeState) {
      await client.query("ROLLBACK");
      return null;
    }

    const query = `
      UPDATE invoices
      SET status = CASE
            WHEN paid_amount > 0 AND balance_amount > 0 THEN 'partially_paid'
            WHEN balance_amount = 0 AND paid_amount > 0 THEN 'paid'
            ELSE 'issued'
          END,
          issue_date = COALESCE(issue_date, CURRENT_DATE),
          due_date = COALESCE($3, due_date),
          updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING *
    `;
    const result = await client.query(query, [organizationId, id, dueDate]);
    const afterState = await getInvoiceByIdWithDb(client, organizationId, id);

    await billingAuditModel.createBillingAuditLog(client, {
      organizationId,
      invoiceId: id,
      actorUserId: actor?.sub || actor?.id || null,
      action: "invoice_issued",
      beforeState,
      afterState,
      metadata: {
        dueDate: dueDate || null
      }
    });

    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const addPayment = async (organizationId, invoiceId, payload, actor = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, invoiceId]);
    const beforeState = await getInvoiceByIdWithDb(client, organizationId, invoiceId);
    const invoice = beforeState;
    if (!invoice) {
      await client.query("ROLLBACK");
      return null;
    }

    const paymentAmount = Number(payload.amount);
    const paymentStatus = payload.status || "completed";
    const isCompletedPayment = paymentStatus === "completed";
    const newPaid = isCompletedPayment ? Number(invoice.paid_amount) + paymentAmount : Number(invoice.paid_amount);
    const balance = isCompletedPayment ? Math.max(Number(invoice.total_amount) - newPaid, 0) : Number(invoice.balance_amount);
    const nextStatus = isCompletedPayment
      ? balance === 0
        ? "paid"
        : "partially_paid"
      : invoice.status;

    const paymentQuery = `
      INSERT INTO payments (organization_id, invoice_id, amount, method, reference, status, paid_at)
      VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, NOW()))
      RETURNING *
    `;
    const paymentRes = await client.query(paymentQuery, [
      organizationId,
      invoiceId,
      paymentAmount,
      payload.method,
      payload.reference || null,
      paymentStatus,
      payload.paidAt || null
    ]);

    if (isCompletedPayment) {
      await client.query(
        `
        UPDATE invoices
        SET paid_amount = $3,
            balance_amount = $4,
            status = $5,
            updated_at = NOW()
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, invoiceId, newPaid, balance, nextStatus]
      );
    }

    const afterState = await getInvoiceByIdWithDb(client, organizationId, invoiceId);
    await billingAuditModel.createBillingAuditLog(client, {
      organizationId,
      invoiceId,
      paymentId: paymentRes.rows[0].id,
      actorUserId: actor?.sub || actor?.id || null,
      action: "payment_recorded",
      beforeState,
      afterState,
      metadata: {
        paymentStatus,
        paymentAmount
      }
    });

    await client.query("COMMIT");
    return paymentRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const markInvoicePaid = async (organizationId, invoiceId, payload, actor = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, invoiceId]);
    const beforeState = await getInvoiceByIdWithDb(client, organizationId, invoiceId);
    const invoice = beforeState;
    if (!invoice) {
      await client.query("ROLLBACK");
      return null;
    }

    const remaining = Number(invoice.balance_amount);
    if (remaining <= 0) {
      await client.query("COMMIT");
      return {
        invoice,
        payment: null
      };
    }

    const paymentQuery = `
      INSERT INTO payments (organization_id, invoice_id, amount, method, reference, status, paid_at)
      VALUES ($1,$2,$3,$4,$5,'completed',NOW())
      RETURNING *
    `;

    const paymentRes = await client.query(paymentQuery, [
      organizationId,
      invoiceId,
      remaining,
      payload.method || "cash",
      payload.reference || null
    ]);

    const updatedInvoiceRes = await client.query(
      `
      UPDATE invoices
      SET paid_amount = total_amount,
          balance_amount = 0,
          status = 'paid',
          updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING *
      `,
      [organizationId, invoiceId]
    );

    const afterState = await getInvoiceByIdWithDb(client, organizationId, invoiceId);
    await billingAuditModel.createBillingAuditLog(client, {
      organizationId,
      invoiceId,
      paymentId: paymentRes.rows[0].id,
      actorUserId: actor?.sub || actor?.id || null,
      action: "invoice_marked_paid",
      beforeState,
      afterState,
      metadata: {
        paymentAmount: remaining
      }
    });

    await client.query("COMMIT");
    return {
      invoice: updatedInvoiceRes.rows[0],
      payment: paymentRes.rows[0]
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteInvoice = async (organizationId, id, actor = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, id]);
    const beforeState = await getInvoiceByIdWithDb(client, organizationId, id);
    if (!beforeState) {
      await client.query("ROLLBACK");
      return null;
    }

    const query = `
      DELETE FROM invoices
      WHERE organization_id = $1 AND id = $2 AND status = 'draft'
      RETURNING id
    `;
    const result = await client.query(query, [organizationId, id]);
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await billingAuditModel.createBillingAuditLog(client, {
      organizationId,
      invoiceId: id,
      actorUserId: actor?.sub || actor?.id || null,
      action: "invoice_deleted",
      beforeState,
      afterState: null,
      metadata: {}
    });

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const computeInvoiceStatus = ({ dueDate, paidAmount, balanceAmount }) => {
  if (balanceAmount <= 0 && paidAmount > 0) {
    return "paid";
  }

  if (paidAmount > 0 && balanceAmount > 0) {
    return "partially_paid";
  }

  if (dueDate) {
    const dueDateValue = new Date(`${dueDate}T00:00:00`);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!Number.isNaN(dueDateValue.getTime()) && dueDateValue < today) {
      return "overdue";
    }
  }

  return "issued";
};

const refundPayment = async (organizationId, invoiceId, paymentId, payload = {}, actor = null) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, invoiceId]);
    const beforeState = await getInvoiceByIdWithDb(client, organizationId, invoiceId);
    if (!beforeState) {
      await client.query("ROLLBACK");
      return null;
    }

    const paymentQuery = `
      SELECT id, invoice_id, amount, method, reference, status, paid_at, refunded_at, created_at
      FROM payments
      WHERE organization_id = $1 AND invoice_id = $2 AND id = $3
      FOR UPDATE
    `;
    const paymentResult = await client.query(paymentQuery, [organizationId, invoiceId, paymentId]);
    const payment = paymentResult.rows[0] || null;
    if (!payment) {
      await client.query("ROLLBACK");
      return { invoice: beforeState, payment: null };
    }

    const refundAmount = Number(payment.amount);
    const nextPaidAmount = Math.max(Number(beforeState.paid_amount) - refundAmount, 0);
    const nextBalanceAmount = Math.max(Number(beforeState.total_amount) - nextPaidAmount, 0);
    const nextStatus = computeInvoiceStatus({
      dueDate: beforeState.due_date,
      paidAmount: nextPaidAmount,
      balanceAmount: nextBalanceAmount
    });
    const refundedAt = payload.refundedAt || new Date().toISOString();

    const refundedPaymentResult = await client.query(
      `
      UPDATE payments
      SET status = 'refunded',
          refunded_at = $4,
          updated_at = NOW()
      WHERE organization_id = $1 AND invoice_id = $2 AND id = $3
      RETURNING *
      `,
      [organizationId, invoiceId, paymentId, refundedAt]
    );

    await client.query(
      `
      UPDATE invoices
      SET paid_amount = $3,
          balance_amount = $4,
          status = $5,
          updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      `,
      [organizationId, invoiceId, nextPaidAmount, nextBalanceAmount, nextStatus]
    );

    const afterState = await getInvoiceByIdWithDb(client, organizationId, invoiceId);
    await billingAuditModel.createBillingAuditLog(client, {
      organizationId,
      invoiceId,
      paymentId,
      actorUserId: actor?.sub || actor?.id || null,
      action: "payment_refunded",
      beforeState,
      afterState,
      metadata: {
        paymentAmount: refundAmount,
        paymentMethod: payment.method,
        refundedAt,
        reason: payload.reason || null
      }
    });

    await client.query("COMMIT");
    return {
      invoice: afterState,
      payment: refundedPaymentResult.rows[0] || null
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getReconciliationReport = async (organizationId) => {
  const summaryQuery = `
    WITH payment_totals AS (
      SELECT
        invoice_id,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS completed_paid_amount,
        COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded_payments,
        COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0)::numeric(12,2) AS refunded_amount
      FROM payments
      WHERE organization_id = $1
      GROUP BY invoice_id
    )
    SELECT
      COUNT(*)::int AS total_invoices,
      COUNT(*) FILTER (
        WHERE i.paid_amount <> COALESCE(pt.completed_paid_amount, 0)
           OR i.balance_amount <> GREATEST(i.total_amount - COALESCE(pt.completed_paid_amount, 0), 0)
      )::int AS mismatched_invoices,
      COUNT(*) FILTER (WHERE i.status IN ('issued', 'partially_paid', 'overdue'))::int AS outstanding_invoices,
      COALESCE(SUM(COALESCE(pt.refunded_amount, 0)), 0)::numeric(12,2) AS refunded_amount,
      COALESCE(SUM(COALESCE(pt.refunded_payments, 0)), 0)::int AS refunded_payments
    FROM invoices i
    LEFT JOIN payment_totals pt ON pt.invoice_id = i.id
    WHERE i.organization_id = $1
  `;

  const itemsQuery = `
    WITH payment_totals AS (
      SELECT
        invoice_id,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS completed_paid_amount
      FROM payments
      WHERE organization_id = $1
      GROUP BY invoice_id
    )
    SELECT
      i.id,
      i.invoice_number,
      i.status,
      i.total_amount,
      i.paid_amount,
      i.balance_amount,
      COALESCE(pt.completed_paid_amount, 0)::numeric(12,2) AS computed_paid_amount,
      GREATEST(i.total_amount - COALESCE(pt.completed_paid_amount, 0), 0)::numeric(12,2) AS computed_balance_amount
    FROM invoices i
    LEFT JOIN payment_totals pt ON pt.invoice_id = i.id
    WHERE i.organization_id = $1
      AND (
        i.paid_amount <> COALESCE(pt.completed_paid_amount, 0)
        OR i.balance_amount <> GREATEST(i.total_amount - COALESCE(pt.completed_paid_amount, 0), 0)
      )
    ORDER BY i.updated_at DESC
    LIMIT 50
  `;

  const [summaryResult, itemsResult] = await Promise.all([
    pool.query(summaryQuery, [organizationId]),
    pool.query(itemsQuery, [organizationId])
  ]);

  return {
    summary: {
      totalInvoices: Number(summaryResult.rows[0]?.total_invoices || 0),
      mismatchedInvoices: Number(summaryResult.rows[0]?.mismatched_invoices || 0),
      outstandingInvoices: Number(summaryResult.rows[0]?.outstanding_invoices || 0),
      refundedPayments: Number(summaryResult.rows[0]?.refunded_payments || 0),
      refundedAmount: Number(summaryResult.rows[0]?.refunded_amount || 0)
    },
    items: itemsResult.rows.map((row) => ({
      ...row,
      total_amount: Number(row.total_amount),
      paid_amount: Number(row.paid_amount),
      balance_amount: Number(row.balance_amount),
      computed_paid_amount: Number(row.computed_paid_amount),
      computed_balance_amount: Number(row.computed_balance_amount)
    }))
  };
};

module.exports = {
  listInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  issueInvoice,
  addPayment,
  refundPayment,
  getReconciliationReport,
  markInvoicePaid,
  deleteInvoice
};
