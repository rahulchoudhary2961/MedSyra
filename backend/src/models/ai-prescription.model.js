const pool = require("../config/db");

const mapSuggestion = (row) => ({
  id: row.id,
  organization_id: row.organization_id,
  branch_id: row.branch_id,
  patient_id: row.patient_id,
  patient_name: row.patient_name,
  doctor_id: row.doctor_id,
  doctor_name: row.doctor_name,
  appointment_id: row.appointment_id,
  medical_record_id: row.medical_record_id,
  generated_by_user_id: row.generated_by_user_id,
  generated_by_name: row.generated_by_name,
  reviewed_by_user_id: row.reviewed_by_user_id,
  reviewed_by_name: row.reviewed_by_name,
  status: row.status,
  input_symptoms: row.input_symptoms,
  input_diagnosis: row.input_diagnosis,
  input_notes: row.input_notes,
  clinical_summary: row.clinical_summary,
  prescription_text: row.prescription_text,
  suggestion_items: Array.isArray(row.suggestion_items) ? row.suggestion_items : [],
  care_plan: Array.isArray(row.care_plan) ? row.care_plan : [],
  guardrails: Array.isArray(row.guardrails) ? row.guardrails : [],
  red_flags: Array.isArray(row.red_flags) ? row.red_flags : [],
  confidence: row.confidence,
  disclaimer: row.disclaimer,
  suggestion_payload: row.suggestion_payload || {},
  patient_snapshot: row.patient_snapshot || {},
  review_note: row.review_note,
  reviewed_at: row.reviewed_at,
  model_name: row.model_name,
  created_at: row.created_at,
  updated_at: row.updated_at
});

const baseSelect = `
  SELECT
    aps.id,
    aps.organization_id,
    aps.branch_id,
    aps.patient_id,
    p.full_name AS patient_name,
    aps.doctor_id,
    d.full_name AS doctor_name,
    aps.appointment_id,
    aps.medical_record_id,
    aps.generated_by_user_id,
    generated_by.full_name AS generated_by_name,
    aps.reviewed_by_user_id,
    reviewed_by.full_name AS reviewed_by_name,
    aps.status,
    aps.input_symptoms,
    aps.input_diagnosis,
    aps.input_notes,
    aps.clinical_summary,
    aps.prescription_text,
    aps.suggestion_items,
    aps.care_plan,
    aps.guardrails,
    aps.red_flags,
    aps.confidence,
    aps.disclaimer,
    aps.suggestion_payload,
    aps.patient_snapshot,
    aps.review_note,
    aps.reviewed_at,
    aps.model_name,
    aps.created_at,
    aps.updated_at
  FROM ai_prescription_suggestions aps
  JOIN patients p ON p.id = aps.patient_id
  LEFT JOIN doctors d ON d.id = aps.doctor_id
  LEFT JOIN users generated_by ON generated_by.id = aps.generated_by_user_id
  LEFT JOIN users reviewed_by ON reviewed_by.id = aps.reviewed_by_user_id
`;

const listSuggestions = async (organizationId, query = {}) => {
  const conditions = ["aps.organization_id = $1"];
  const values = [organizationId];

  if (query.branchId) {
    values.push(query.branchId);
    conditions.push(`aps.branch_id = $${values.length}`);
  }

  if (query.patientId) {
    values.push(query.patientId);
    conditions.push(`aps.patient_id = $${values.length}`);
  }

  if (query.doctorId) {
    values.push(query.doctorId);
    conditions.push(`aps.doctor_id = $${values.length}`);
  }

  if (query.appointmentId) {
    values.push(query.appointmentId);
    conditions.push(`aps.appointment_id = $${values.length}`);
  }

  if (query.medicalRecordId) {
    values.push(query.medicalRecordId);
    conditions.push(`aps.medical_record_id = $${values.length}`);
  }

  if (query.status) {
    values.push(query.status);
    conditions.push(`aps.status = $${values.length}`);
  }

  values.push(Number(query.limit || 10));

  const sql = `
    ${baseSelect}
    WHERE ${conditions.join(" AND ")}
    ORDER BY aps.created_at DESC
    LIMIT $${values.length}
  `;

  const { rows } = await pool.query(sql, values);
  return rows.map(mapSuggestion);
};

const getSuggestionById = async (organizationId, id, branchId = null) => {
  const values = [organizationId, id];
  const branchClause = branchId ? " AND aps.branch_id = $3" : "";
  if (branchId) {
    values.push(branchId);
  }

  const { rows } = await pool.query(
    `
      ${baseSelect}
      WHERE aps.organization_id = $1
        AND aps.id = $2
        ${branchClause}
      LIMIT 1
    `,
    values
  );

  return rows[0] ? mapSuggestion(rows[0]) : null;
};

const createSuggestion = async (organizationId, payload) => {
  const { rows } = await pool.query(
    `
      INSERT INTO ai_prescription_suggestions (
        organization_id,
        branch_id,
        patient_id,
        doctor_id,
        appointment_id,
        medical_record_id,
        generated_by_user_id,
        status,
        input_symptoms,
        input_diagnosis,
        input_notes,
        clinical_summary,
        prescription_text,
        suggestion_items,
        care_plan,
        guardrails,
        red_flags,
        confidence,
        disclaimer,
        suggestion_payload,
        patient_snapshot,
        model_name
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18, $19, $20::jsonb, $21::jsonb, $22
      )
      RETURNING id
    `,
    [
      organizationId,
      payload.branchId,
      payload.patientId,
      payload.doctorId || null,
      payload.appointmentId || null,
      payload.medicalRecordId || null,
      payload.generatedByUserId || null,
      payload.status || "generated",
      payload.inputSymptoms || null,
      payload.inputDiagnosis || null,
      payload.inputNotes || null,
      payload.clinicalSummary || null,
      payload.prescriptionText || null,
      JSON.stringify(payload.suggestionItems || []),
      JSON.stringify(payload.carePlan || []),
      JSON.stringify(payload.guardrails || []),
      JSON.stringify(payload.redFlags || []),
      payload.confidence || "low",
      payload.disclaimer,
      JSON.stringify(payload.suggestionPayload || {}),
      JSON.stringify(payload.patientSnapshot || {}),
      payload.modelName || null
    ]
  );

  return getSuggestionById(organizationId, rows[0].id, payload.branchId || null);
};

const reviewSuggestion = async (organizationId, id, payload) => {
  const { rows } = await pool.query(
    `
      UPDATE ai_prescription_suggestions
      SET
        status = $3,
        review_note = COALESCE($4, review_note),
        reviewed_by_user_id = $5,
        reviewed_at = COALESCE($6, reviewed_at),
        medical_record_id = COALESCE($7, medical_record_id),
        appointment_id = COALESCE($8, appointment_id),
        updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
        AND ($9::uuid IS NULL OR branch_id = $9::uuid)
      RETURNING id, branch_id
    `,
    [
      organizationId,
      id,
      payload.status,
      payload.reviewNote || null,
      payload.reviewedByUserId || null,
      payload.reviewedAt || null,
      payload.medicalRecordId || null,
      payload.appointmentId || null,
      payload.branchId || null
    ]
  );

  if (rows.length === 0) {
    return null;
  }

  return getSuggestionById(organizationId, rows[0].id, rows[0].branch_id);
};

module.exports = {
  createSuggestion,
  getSuggestionById,
  listSuggestions,
  reviewSuggestion
};
