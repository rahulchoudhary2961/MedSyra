const pool = require("../config/db");

const mapPaymentLink = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    amount: Number(row.amount || 0)
  };
};

const listPaymentLinksByInvoiceId = async (organizationId, invoiceId, db = pool) => {
  const query = `
    SELECT
      id,
      organization_id,
      branch_id,
      invoice_id,
      provider,
      provider_link_id,
      short_url,
      status,
      amount,
      currency,
      expires_at,
      paid_at,
      last_synced_at,
      provider_payment_id,
      provider_payload,
      created_at,
      updated_at
    FROM invoice_payment_links
    WHERE organization_id = $1 AND invoice_id = $2
    ORDER BY created_at DESC
  `;

  const { rows } = await db.query(query, [organizationId, invoiceId]);
  return rows.map(mapPaymentLink);
};

const getPaymentLinkById = async (organizationId, invoiceId, id, db = pool) => {
  const query = `
    SELECT
      id,
      organization_id,
      branch_id,
      invoice_id,
      provider,
      provider_link_id,
      short_url,
      status,
      amount,
      currency,
      expires_at,
      paid_at,
      last_synced_at,
      provider_payment_id,
      provider_payload,
      created_at,
      updated_at
    FROM invoice_payment_links
    WHERE organization_id = $1 AND invoice_id = $2 AND id = $3
    LIMIT 1
  `;

  const { rows } = await db.query(query, [organizationId, invoiceId, id]);
  return mapPaymentLink(rows[0] || null);
};

const getPaymentLinkByProviderLinkId = async (provider, providerLinkId, db = pool) => {
  const query = `
    SELECT
      id,
      organization_id,
      branch_id,
      invoice_id,
      provider,
      provider_link_id,
      short_url,
      status,
      amount,
      currency,
      expires_at,
      paid_at,
      last_synced_at,
      provider_payment_id,
      provider_payload,
      created_at,
      updated_at
    FROM invoice_payment_links
    WHERE provider = $1 AND provider_link_id = $2
    LIMIT 1
  `;

  const { rows } = await db.query(query, [provider, providerLinkId]);
  return mapPaymentLink(rows[0] || null);
};

const getReusablePaymentLink = async (organizationId, invoiceId, amount, currency = "INR", db = pool) => {
  const query = `
    SELECT
      id,
      organization_id,
      branch_id,
      invoice_id,
      provider,
      provider_link_id,
      short_url,
      status,
      amount,
      currency,
      expires_at,
      paid_at,
      last_synced_at,
      provider_payment_id,
      provider_payload,
      created_at,
      updated_at
    FROM invoice_payment_links
    WHERE organization_id = $1
      AND invoice_id = $2
      AND amount = $3
      AND currency = $4
      AND status IN ('created', 'partially_paid')
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const { rows } = await db.query(query, [organizationId, invoiceId, amount, currency]);
  return mapPaymentLink(rows[0] || null);
};

const createPaymentLink = async (organizationId, invoiceId, payload, db = pool) => {
  const query = `
    INSERT INTO invoice_payment_links (
      organization_id,
      branch_id,
      invoice_id,
      provider,
      provider_link_id,
      short_url,
      status,
      amount,
      currency,
      expires_at,
      paid_at,
      last_synced_at,
      provider_payment_id,
      provider_payload
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING
      id,
      organization_id,
      branch_id,
      invoice_id,
      provider,
      provider_link_id,
      short_url,
      status,
      amount,
      currency,
      expires_at,
      paid_at,
      last_synced_at,
      provider_payment_id,
      provider_payload,
      created_at,
      updated_at
  `;

  const values = [
    organizationId,
    payload.branchId,
    invoiceId,
    payload.provider,
    payload.providerLinkId,
    payload.shortUrl,
    payload.status || "created",
    payload.amount,
    payload.currency || "INR",
    payload.expiresAt || null,
    payload.paidAt || null,
    payload.lastSyncedAt || null,
    payload.providerPaymentId || null,
    payload.providerPayload || null
  ];

  const { rows } = await db.query(query, values);
  return mapPaymentLink(rows[0] || null);
};

const updatePaymentLinkById = async (organizationId, invoiceId, id, payload, db = pool) => {
  const columnMap = {
    shortUrl: "short_url",
    status: "status",
    expiresAt: "expires_at",
    paidAt: "paid_at",
    lastSyncedAt: "last_synced_at",
    providerPaymentId: "provider_payment_id",
    providerPayload: "provider_payload"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getPaymentLinkById(organizationId, invoiceId, id, db);
  }

  const setClauses = [];
  const values = [organizationId, invoiceId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 4}`);
    values.push(value);
  });

  const query = `
    UPDATE invoice_payment_links
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE organization_id = $1 AND invoice_id = $2 AND id = $3
    RETURNING
      id,
      organization_id,
      branch_id,
      invoice_id,
      provider,
      provider_link_id,
      short_url,
      status,
      amount,
      currency,
      expires_at,
      paid_at,
      last_synced_at,
      provider_payment_id,
      provider_payload,
      created_at,
      updated_at
  `;

  const { rows } = await db.query(query, values);
  return mapPaymentLink(rows[0] || null);
};

const updatePaymentLinkByProviderLinkId = async (provider, providerLinkId, payload, db = pool) => {
  const columnMap = {
    shortUrl: "short_url",
    status: "status",
    expiresAt: "expires_at",
    paidAt: "paid_at",
    lastSyncedAt: "last_synced_at",
    providerPaymentId: "provider_payment_id",
    providerPayload: "provider_payload"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getPaymentLinkByProviderLinkId(provider, providerLinkId, db);
  }

  const setClauses = [];
  const values = [provider, providerLinkId];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const query = `
    UPDATE invoice_payment_links
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE provider = $1 AND provider_link_id = $2
    RETURNING
      id,
      organization_id,
      invoice_id,
      provider,
      provider_link_id,
      short_url,
      status,
      amount,
      currency,
      expires_at,
      paid_at,
      last_synced_at,
      provider_payment_id,
      provider_payload,
      created_at,
      updated_at
  `;

  const { rows } = await db.query(query, values);
  return mapPaymentLink(rows[0] || null);
};

module.exports = {
  listPaymentLinksByInvoiceId,
  getPaymentLinkById,
  getPaymentLinkByProviderLinkId,
  getReusablePaymentLink,
  createPaymentLink,
  updatePaymentLinkById,
  updatePaymentLinkByProviderLinkId
};
