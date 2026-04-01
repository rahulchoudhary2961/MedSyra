const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const getNextInvoiceNumber = async (organizationId) => {
  const prefix = "INV";
  const query = `
    SELECT invoice_number
    FROM invoices
    WHERE organization_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const result = await pool.query(query, [organizationId]);
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
  const invoiceQuery = `
    SELECT
      i.id,
      i.invoice_number,
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
    SELECT id, amount, method, reference, status, paid_at, created_at
    FROM payments
    WHERE organization_id = $1 AND invoice_id = $2
    ORDER BY paid_at DESC
  `;

  const invoiceResult = await pool.query(invoiceQuery, [organizationId, id]);
  const invoice = invoiceResult.rows[0];
  if (!invoice) {
    return null;
  }

  const [itemsRes, paymentsRes] = await Promise.all([
    pool.query(itemQuery, [id]),
    pool.query(paymentQuery, [organizationId, id])
  ]);

  return {
    ...invoice,
    items: itemsRes.rows,
    payments: paymentsRes.rows
  };
};

const createInvoice = async (organizationId, payload) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceNumber = await getNextInvoiceNumber(organizationId);
    const amount = Number(payload.amount);
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
      payload.currency || "USD",
      payload.notes || null
    ];

    const invoiceRes = await client.query(invoiceQuery, invoiceValues);
    const invoice = invoiceRes.rows[0];

    const itemQuery = `
      INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_amount)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `;
    const description = payload.description || "Consultation";
    await client.query(itemQuery, [invoice.id, description, 1, amount, amount]);

    await client.query("COMMIT");
    return getInvoiceById(organizationId, invoice.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateInvoice = async (organizationId, id, payload) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentRes = await client.query(
      "SELECT * FROM invoices WHERE organization_id = $1 AND id = $2",
      [organizationId, id]
    );
    const current = currentRes.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return null;
    }

    const amount = payload.amount !== undefined ? Number(payload.amount) : Number(current.total_amount);
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

    if (payload.description || payload.amount !== undefined) {
      await client.query(
        `
        UPDATE invoice_items
        SET description = COALESCE($2, description),
            unit_price = $3,
            total_amount = $3,
            updated_at = NOW()
        WHERE invoice_id = $1
        `,
        [id, payload.description || null, amount]
      );
    }

    await client.query("COMMIT");
    return invoiceRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const issueInvoice = async (organizationId, id, dueDate = null) => {
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
  const result = await pool.query(query, [organizationId, id, dueDate]);
  return result.rows[0] || null;
};

const addPayment = async (organizationId, invoiceId, payload) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoiceRes = await client.query(
      "SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE",
      [organizationId, invoiceId]
    );
    const invoice = invoiceRes.rows[0];
    if (!invoice) {
      await client.query("ROLLBACK");
      return null;
    }

    const paymentAmount = Number(payload.amount);
    const newPaid = Number(invoice.paid_amount) + paymentAmount;
    const balance = Math.max(Number(invoice.total_amount) - newPaid, 0);
    const nextStatus = balance === 0 ? "paid" : "partially_paid";

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
      payload.status || "completed",
      payload.paidAt || null
    ]);

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

    await client.query("COMMIT");
    return paymentRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const markInvoicePaid = async (organizationId, invoiceId, payload) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoiceRes = await client.query(
      "SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE",
      [organizationId, invoiceId]
    );
    const invoice = invoiceRes.rows[0];
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

const deleteInvoice = async (organizationId, id) => {
  const query = `
    DELETE FROM invoices
    WHERE organization_id = $1 AND id = $2 AND status = 'draft'
    RETURNING id
  `;
  const result = await pool.query(query, [organizationId, id]);
  return result.rows[0] || null;
};

module.exports = {
  listInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  issueInvoice,
  addPayment,
  markInvoicePaid,
  deleteInvoice
};
