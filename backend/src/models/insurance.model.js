const pool = require("../config/db");
const parsePagination = require("../utils/pagination");

const INSURANCE_CLAIM_STATUSES = new Set([
  "draft",
  "submitted",
  "under_review",
  "approved",
  "partially_approved",
  "rejected",
  "settled",
  "cancelled"
]);

const mapProvider = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    open_claim_count: Number(row.open_claim_count || 0)
  };
};

const mapClaimEvent = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    metadata: row.metadata || {}
  };
};

const mapClaim = (row) => {
  if (!row) {
    return null;
  }

  return {
    ...row,
    claimed_amount: Number(row.claimed_amount || 0),
    approved_amount: Number(row.approved_amount || 0),
    paid_amount: Number(row.paid_amount || 0),
    days_to_response:
      row.days_to_response === null || row.days_to_response === undefined
        ? null
        : Number(row.days_to_response),
    event_count: Number(row.event_count || 0),
    events: Array.isArray(row.events) ? row.events.map(mapClaimEvent) : row.events
  };
};

const getNextClaimNumber = async (db, organizationId) => {
  await db.query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE", [organizationId]);

  const result = await db.query(
    `
      SELECT claim_number
      FROM insurance_claims
      WHERE organization_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [organizationId]
  );

  const lastNumber = result.rows[0]?.claim_number || "CLM-0000";
  const numeric = Number.parseInt(String(lastNumber).split("-")[1], 10) || 0;
  return `CLM-${String(numeric + 1).padStart(4, "0")}`;
};

const listInsuranceProviders = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["ip.organization_id = $1"];

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(`(ip.name ILIKE $${idx} OR ip.payer_code ILIKE $${idx} OR ip.contact_email ILIKE $${idx} OR ip.contact_phone ILIKE $${idx})`);
  }

  if (query.active !== undefined) {
    values.push(query.active === "true");
    conditions.push(`ip.is_active = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const rowsSql = `
    SELECT
      ip.id,
      ip.organization_id,
      ip.payer_code,
      ip.name,
      ip.contact_email,
      ip.contact_phone,
      ip.portal_url,
      ip.is_active,
      ip.created_at,
      ip.updated_at,
      (
        SELECT COUNT(*)::int
        FROM insurance_claims ic
        WHERE ic.organization_id = ip.organization_id
          AND ic.provider_id = ip.id
          AND ic.status IN ('submitted', 'under_review', 'approved', 'partially_approved')
      ) AS open_claim_count
    FROM insurance_providers ip
    WHERE ${whereClause}
    ORDER BY ip.is_active DESC, ip.name ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM insurance_providers ip
    WHERE ${whereClause}
  `;

  const [rowsRes, countRes] = await Promise.all([
    pool.query(rowsSql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapProvider),
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const getInsuranceProviderById = async (organizationId, id) => {
  const { rows } = await pool.query(
    `
      SELECT
        ip.id,
        ip.organization_id,
        ip.payer_code,
        ip.name,
        ip.contact_email,
        ip.contact_phone,
        ip.portal_url,
        ip.is_active,
        ip.created_at,
        ip.updated_at,
        (
          SELECT COUNT(*)::int
          FROM insurance_claims ic
          WHERE ic.organization_id = ip.organization_id
            AND ic.provider_id = ip.id
            AND ic.status IN ('submitted', 'under_review', 'approved', 'partially_approved')
        ) AS open_claim_count
      FROM insurance_providers ip
      WHERE ip.organization_id = $1
        AND ip.id = $2
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapProvider(rows[0] || null);
};

const createInsuranceProvider = async (organizationId, payload) => {
  const { rows } = await pool.query(
    `
      INSERT INTO insurance_providers (
        organization_id,
        payer_code,
        name,
        contact_email,
        contact_phone,
        portal_url,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `,
    [
      organizationId,
      payload.payerCode || null,
      payload.name,
      payload.contactEmail || null,
      payload.contactPhone || null,
      payload.portalUrl || null,
      payload.isActive ?? true
    ]
  );

  return getInsuranceProviderById(organizationId, rows[0].id);
};

const updateInsuranceProvider = async (organizationId, id, payload) => {
  const columnMap = {
    payerCode: "payer_code",
    name: "name",
    contactEmail: "contact_email",
    contactPhone: "contact_phone",
    portalUrl: "portal_url",
    isActive: "is_active"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getInsuranceProviderById(organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const { rows } = await pool.query(
    `
      UPDATE insurance_providers
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING id
    `,
    values
  );

  if (!rows[0]) {
    return null;
  }

  return getInsuranceProviderById(organizationId, id);
};

const getClaimByIdWithDb = async (db, organizationId, id) => {
  const claimRes = await db.query(
    `
      SELECT
        ic.id,
        ic.organization_id,
        ic.claim_number,
        ic.provider_id,
        ip.name AS provider_name,
        ip.payer_code,
        ic.patient_id,
        p.patient_code,
        p.full_name AS patient_name,
        p.phone,
        ic.doctor_id,
        d.full_name AS doctor_name,
        ic.appointment_id,
        ic.medical_record_id,
        mr.record_type,
        ic.invoice_id,
        inv.invoice_number,
        inv.status AS invoice_status,
        ic.created_by_user_id,
        creator.full_name AS created_by_name,
        ic.policy_number,
        ic.member_id,
        ic.status,
        ic.claimed_amount,
        ic.approved_amount,
        ic.paid_amount,
        ic.diagnosis_summary,
        ic.treatment_summary,
        ic.submitted_date::text AS submitted_date,
        ic.response_due_date::text AS response_due_date,
        ic.approved_date::text AS approved_date,
        ic.settled_date::text AS settled_date,
        ic.rejection_reason,
        ic.notes,
        ic.last_status_changed_at,
        ic.created_at,
        ic.updated_at,
        CASE
          WHEN ic.response_due_date IS NULL THEN NULL
          ELSE (ic.response_due_date - CURRENT_DATE)
        END AS days_to_response
      FROM insurance_claims ic
      JOIN insurance_providers ip
        ON ip.id = ic.provider_id
       AND ip.organization_id = ic.organization_id
      JOIN patients p
        ON p.id = ic.patient_id
       AND p.organization_id = ic.organization_id
      LEFT JOIN doctors d
        ON d.id = ic.doctor_id
       AND d.organization_id = ic.organization_id
      LEFT JOIN medical_records mr
        ON mr.id = ic.medical_record_id
       AND mr.organization_id = ic.organization_id
      LEFT JOIN invoices inv
        ON inv.id = ic.invoice_id
       AND inv.organization_id = ic.organization_id
      LEFT JOIN users creator
        ON creator.id = ic.created_by_user_id
       AND creator.organization_id = ic.organization_id
      WHERE ic.organization_id = $1
        AND ic.id = $2
      LIMIT 1
    `,
    [organizationId, id]
  );

  const claim = mapClaim(claimRes.rows[0] || null);
  if (!claim) {
    return null;
  }

  const eventsRes = await db.query(
    `
      SELECT
        ice.id,
        ice.organization_id,
        ice.claim_id,
        ice.actor_user_id,
        actor.full_name AS actor_name,
        ice.event_type,
        ice.previous_status,
        ice.next_status,
        ice.note,
        ice.metadata,
        ice.created_at
      FROM insurance_claim_events ice
      LEFT JOIN users actor
        ON actor.id = ice.actor_user_id
       AND actor.organization_id = ice.organization_id
      WHERE ice.organization_id = $1
        AND ice.claim_id = $2
      ORDER BY ice.created_at DESC
    `,
    [organizationId, id]
  );

  return {
    ...claim,
    event_count: eventsRes.rows.length,
    events: eventsRes.rows.map(mapClaimEvent)
  };
};

const getInsuranceClaimById = async (organizationId, id) => getClaimByIdWithDb(pool, organizationId, id);

const listInsuranceClaims = async (organizationId, query = {}) => {
  const { page, limit, offset } = parsePagination(query);
  const values = [organizationId];
  const conditions = ["ic.organization_id = $1"];

  if (query.q) {
    values.push(`%${query.q}%`);
    const idx = values.length;
    conditions.push(
      `(ic.claim_number ILIKE $${idx} OR p.full_name ILIKE $${idx} OR p.patient_code ILIKE $${idx} OR ip.name ILIKE $${idx} OR inv.invoice_number ILIKE $${idx})`
    );
  }

  if (query.status) {
    values.push(query.status);
    conditions.push(`ic.status = $${values.length}`);
  }

  if (query.patientId) {
    values.push(query.patientId);
    conditions.push(`ic.patient_id = $${values.length}`);
  }

  if (query.providerId) {
    values.push(query.providerId);
    conditions.push(`ic.provider_id = $${values.length}`);
  }

  if (query.invoiceId) {
    values.push(query.invoiceId);
    conditions.push(`ic.invoice_id = $${values.length}`);
  }

  values.push(limit, offset);
  const whereClause = conditions.join(" AND ");

  const rowsSql = `
    SELECT
      ic.id,
      ic.organization_id,
      ic.claim_number,
      ic.provider_id,
      ip.name AS provider_name,
      ip.payer_code,
      ic.patient_id,
      p.patient_code,
      p.full_name AS patient_name,
      p.phone,
      ic.doctor_id,
      d.full_name AS doctor_name,
      ic.appointment_id,
      ic.medical_record_id,
      mr.record_type,
      ic.invoice_id,
      inv.invoice_number,
      inv.status AS invoice_status,
      ic.created_by_user_id,
      creator.full_name AS created_by_name,
      ic.policy_number,
      ic.member_id,
      ic.status,
      ic.claimed_amount,
      ic.approved_amount,
      ic.paid_amount,
      ic.diagnosis_summary,
      ic.treatment_summary,
      ic.submitted_date::text AS submitted_date,
      ic.response_due_date::text AS response_due_date,
      ic.approved_date::text AS approved_date,
      ic.settled_date::text AS settled_date,
      ic.rejection_reason,
      ic.notes,
      ic.last_status_changed_at,
      ic.created_at,
      ic.updated_at,
      CASE
        WHEN ic.response_due_date IS NULL THEN NULL
        ELSE (ic.response_due_date - CURRENT_DATE)
      END AS days_to_response,
      (
        SELECT COUNT(*)::int
        FROM insurance_claim_events ice
        WHERE ice.claim_id = ic.id
      ) AS event_count
    FROM insurance_claims ic
    JOIN insurance_providers ip
      ON ip.id = ic.provider_id
     AND ip.organization_id = ic.organization_id
    JOIN patients p
      ON p.id = ic.patient_id
     AND p.organization_id = ic.organization_id
    LEFT JOIN doctors d
      ON d.id = ic.doctor_id
     AND d.organization_id = ic.organization_id
    LEFT JOIN medical_records mr
      ON mr.id = ic.medical_record_id
     AND mr.organization_id = ic.organization_id
    LEFT JOIN invoices inv
      ON inv.id = ic.invoice_id
     AND inv.organization_id = ic.organization_id
    LEFT JOIN users creator
      ON creator.id = ic.created_by_user_id
     AND creator.organization_id = ic.organization_id
    WHERE ${whereClause}
    ORDER BY COALESCE(ic.response_due_date, ic.submitted_date, DATE(ic.created_at)) ASC, ic.created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM insurance_claims ic
    JOIN insurance_providers ip
      ON ip.id = ic.provider_id
     AND ip.organization_id = ic.organization_id
    JOIN patients p
      ON p.id = ic.patient_id
     AND p.organization_id = ic.organization_id
    LEFT JOIN invoices inv
      ON inv.id = ic.invoice_id
     AND inv.organization_id = ic.organization_id
    WHERE ${whereClause}
  `;

  const [rowsRes, countRes] = await Promise.all([
    pool.query(rowsSql, values),
    pool.query(countSql, values.slice(0, values.length - 2))
  ]);

  return {
    items: rowsRes.rows.map(mapClaim),
    pagination: {
      page,
      limit,
      total: countRes.rows[0]?.total || 0,
      totalPages: Math.ceil((countRes.rows[0]?.total || 0) / limit) || 1
    }
  };
};

const createInsuranceClaimWithDb = async (db, organizationId, payload) => {
  const claimNumber = await getNextClaimNumber(db, organizationId);
  const { rows } = await db.query(
    `
      INSERT INTO insurance_claims (
        organization_id,
        claim_number,
        provider_id,
        patient_id,
        doctor_id,
        appointment_id,
        medical_record_id,
        invoice_id,
        created_by_user_id,
        policy_number,
        member_id,
        status,
        claimed_amount,
        approved_amount,
        paid_amount,
        diagnosis_summary,
        treatment_summary,
        submitted_date,
        response_due_date,
        approved_date,
        settled_date,
        rejection_reason,
        notes,
        last_status_changed_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
      RETURNING id
    `,
    [
      organizationId,
      claimNumber,
      payload.providerId,
      payload.patientId,
      payload.doctorId || null,
      payload.appointmentId || null,
      payload.medicalRecordId || null,
      payload.invoiceId || null,
      payload.createdByUserId || null,
      payload.policyNumber || null,
      payload.memberId || null,
      payload.status || "draft",
      payload.claimedAmount || 0,
      payload.approvedAmount || 0,
      payload.paidAmount || 0,
      payload.diagnosisSummary || null,
      payload.treatmentSummary || null,
      payload.submittedDate || null,
      payload.responseDueDate || null,
      payload.approvedDate || null,
      payload.settledDate || null,
      payload.rejectionReason || null,
      payload.notes || null
    ]
  );

  return getClaimByIdWithDb(db, organizationId, rows[0].id);
};

const updateInsuranceClaimWithDb = async (db, organizationId, id, payload) => {
  const columnMap = {
    providerId: "provider_id",
    patientId: "patient_id",
    doctorId: "doctor_id",
    appointmentId: "appointment_id",
    medicalRecordId: "medical_record_id",
    invoiceId: "invoice_id",
    policyNumber: "policy_number",
    memberId: "member_id",
    status: "status",
    claimedAmount: "claimed_amount",
    approvedAmount: "approved_amount",
    paidAmount: "paid_amount",
    diagnosisSummary: "diagnosis_summary",
    treatmentSummary: "treatment_summary",
    submittedDate: "submitted_date",
    responseDueDate: "response_due_date",
    approvedDate: "approved_date",
    settledDate: "settled_date",
    rejectionReason: "rejection_reason",
    notes: "notes",
    lastStatusChangedAt: "last_status_changed_at"
  };

  const mappedEntries = Object.entries(payload)
    .filter(([key, value]) => columnMap[key] && value !== undefined)
    .map(([key, value]) => [columnMap[key], value]);

  if (mappedEntries.length === 0) {
    return getClaimByIdWithDb(db, organizationId, id);
  }

  const setClauses = [];
  const values = [organizationId, id];

  mappedEntries.forEach(([column, value], index) => {
    setClauses.push(`${column} = $${index + 3}`);
    values.push(value);
  });

  const { rows } = await db.query(
    `
      UPDATE insurance_claims
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
      RETURNING id
    `,
    values
  );

  if (!rows[0]) {
    return null;
  }

  return getClaimByIdWithDb(db, organizationId, id);
};

const createInsuranceClaimEventWithDb = async (db, organizationId, claimId, payload) => {
  const nextStatus = payload.nextStatus && INSURANCE_CLAIM_STATUSES.has(payload.nextStatus) ? payload.nextStatus : payload.nextStatus || null;

  const { rows } = await db.query(
    `
      INSERT INTO insurance_claim_events (
        organization_id,
        claim_id,
        actor_user_id,
        event_type,
        previous_status,
        next_status,
        note,
        metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
      RETURNING
        id,
        organization_id,
        claim_id,
        actor_user_id,
        event_type,
        previous_status,
        next_status,
        note,
        metadata,
        created_at
    `,
    [
      organizationId,
      claimId,
      payload.actorUserId || null,
      payload.eventType,
      payload.previousStatus || null,
      nextStatus,
      payload.note || null,
      JSON.stringify(payload.metadata || {})
    ]
  );

  return mapClaimEvent(rows[0] || null);
};

const getInsuranceReferenceData = async (organizationId, query = {}) => {
  const patientValues = [organizationId];
  const patientConditions = ["organization_id = $1", "is_active = true"];
  if (query.patientId) {
    patientValues.push(query.patientId);
    patientConditions.push(`id = $${patientValues.length}`);
  }

  const patientsPromise = pool.query(
    `
      SELECT id, patient_code, full_name, phone
      FROM patients
      WHERE ${patientConditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT 100
    `,
    patientValues
  );

  const doctorsPromise = pool.query(
    `
      SELECT id, full_name, specialty
      FROM doctors
      WHERE organization_id = $1
      ORDER BY full_name ASC
      LIMIT 100
    `,
    [organizationId]
  );

  const recordValues = [organizationId];
  const recordConditions = ["mr.organization_id = $1"];
  if (query.patientId) {
    recordValues.push(query.patientId);
    recordConditions.push(`mr.patient_id = $${recordValues.length}`);
  }

  const recordsPromise = pool.query(
    `
      SELECT
        mr.id,
        mr.patient_id,
        p.full_name AS patient_name,
        p.patient_code,
        mr.doctor_id,
        d.full_name AS doctor_name,
        mr.record_type,
        mr.record_date::text AS record_date,
        mr.diagnosis
      FROM medical_records mr
      JOIN patients p
        ON p.id = mr.patient_id
       AND p.organization_id = mr.organization_id
      LEFT JOIN doctors d
        ON d.id = mr.doctor_id
       AND d.organization_id = mr.organization_id
      WHERE ${recordConditions.join(" AND ")}
      ORDER BY mr.record_date DESC, mr.created_at DESC
      LIMIT 100
    `,
    recordValues
  );

  const invoiceValues = [organizationId];
  const invoiceConditions = ["i.organization_id = $1"];
  if (query.patientId) {
    invoiceValues.push(query.patientId);
    invoiceConditions.push(`i.patient_id = $${invoiceValues.length}`);
  }

  const invoicesPromise = pool.query(
    `
      SELECT
        i.id,
        i.patient_id,
        p.full_name AS patient_name,
        p.patient_code,
        i.invoice_number,
        i.status,
        i.issue_date::text AS issue_date,
        i.total_amount::numeric(12,2) AS total_amount,
        i.balance_amount::numeric(12,2) AS balance_amount
      FROM invoices i
      JOIN patients p
        ON p.id = i.patient_id
       AND p.organization_id = i.organization_id
      WHERE ${invoiceConditions.join(" AND ")}
      ORDER BY i.issue_date DESC, i.created_at DESC
      LIMIT 100
    `,
    invoiceValues
  );

  const [patientsRes, doctorsRes, recordsRes, invoicesRes] = await Promise.all([
    patientsPromise,
    doctorsPromise,
    recordsPromise,
    invoicesPromise
  ]);

  return {
    patients: patientsRes.rows,
    doctors: doctorsRes.rows,
    medicalRecords: recordsRes.rows,
    invoices: invoicesRes.rows.map((row) => ({
      ...row,
      total_amount: Number(row.total_amount || 0),
      balance_amount: Number(row.balance_amount || 0)
    }))
  };
};

module.exports = {
  INSURANCE_CLAIM_STATUSES,
  listInsuranceProviders,
  getInsuranceProviderById,
  createInsuranceProvider,
  updateInsuranceProvider,
  listInsuranceClaims,
  getInsuranceClaimById,
  createInsuranceClaimWithDb,
  updateInsuranceClaimWithDb,
  createInsuranceClaimEventWithDb,
  getInsuranceReferenceData
};
