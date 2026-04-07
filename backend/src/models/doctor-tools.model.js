const pool = require("../config/db");

const mapPrescriptionTemplate = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    branch_id: row.branch_id,
    created_by_user_id: row.created_by_user_id,
    doctor_id: row.doctor_id,
    name: row.name,
    template_text: row.template_text,
    diagnosis_hint: row.diagnosis_hint,
    notes_hint: row.notes_hint,
    use_count: Number(row.use_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

const mapFavoriteMedicine = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organization_id: row.organization_id,
    branch_id: row.branch_id,
    created_by_user_id: row.created_by_user_id,
    doctor_id: row.doctor_id,
    medicine_id: row.medicine_id,
    medicine_name: row.medicine_name,
    generic_name: row.generic_name,
    dosage_form: row.dosage_form,
    strength: row.strength,
    preferred_sig: row.preferred_sig,
    use_count: Number(row.use_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
};

const listPrescriptionTemplates = async (organizationId, { userId, branchId = null, limit = 12 }) => {
  const values = [organizationId, userId];
  let branchClause = "";

  if (branchId) {
    values.push(branchId);
    branchClause = `AND branch_id = $${values.length}`;
  }

  values.push(limit);
  const { rows } = await pool.query(
    `
      SELECT
        id,
        organization_id,
        branch_id,
        created_by_user_id,
        doctor_id,
        name,
        template_text,
        diagnosis_hint,
        notes_hint,
        use_count,
        created_at,
        updated_at
      FROM prescription_templates
      WHERE organization_id = $1
        AND created_by_user_id = $2
        ${branchClause}
      ORDER BY use_count DESC, updated_at DESC, name ASC
      LIMIT $${values.length}
    `,
    values
  );

  return rows.map(mapPrescriptionTemplate);
};

const getPrescriptionTemplateById = async (organizationId, id) => {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        organization_id,
        branch_id,
        created_by_user_id,
        doctor_id,
        name,
        template_text,
        diagnosis_hint,
        notes_hint,
        use_count,
        created_at,
        updated_at
      FROM prescription_templates
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapPrescriptionTemplate(rows[0] || null);
};

const createPrescriptionTemplate = async (organizationId, payload) => {
  const { rows } = await pool.query(
    `
      INSERT INTO prescription_templates (
        organization_id,
        branch_id,
        created_by_user_id,
        doctor_id,
        name,
        template_text,
        diagnosis_hint,
        notes_hint
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `,
    [
      organizationId,
      payload.branchId,
      payload.createdByUserId,
      payload.doctorId || null,
      payload.name,
      payload.templateText,
      payload.diagnosisHint || null,
      payload.notesHint || null
    ]
  );

  return getPrescriptionTemplateById(organizationId, rows[0].id);
};

const deletePrescriptionTemplate = async (organizationId, id) => {
  const { rowCount } = await pool.query(
    `
      DELETE FROM prescription_templates
      WHERE organization_id = $1
        AND id = $2
    `,
    [organizationId, id]
  );

  return rowCount > 0;
};

const listFavoriteMedicines = async (organizationId, { userId, branchId = null, limit = 16 }) => {
  const values = [organizationId, userId];
  let branchClause = "";

  if (branchId) {
    values.push(branchId);
    branchClause = `AND branch_id = $${values.length}`;
  }

  values.push(limit);
  const { rows } = await pool.query(
    `
      SELECT
        id,
        organization_id,
        branch_id,
        created_by_user_id,
        doctor_id,
        medicine_id,
        medicine_name,
        generic_name,
        dosage_form,
        strength,
        preferred_sig,
        use_count,
        created_at,
        updated_at
      FROM favorite_medicines
      WHERE organization_id = $1
        AND created_by_user_id = $2
        ${branchClause}
      ORDER BY use_count DESC, updated_at DESC, medicine_name ASC
      LIMIT $${values.length}
    `,
    values
  );

  return rows.map(mapFavoriteMedicine);
};

const getFavoriteMedicineById = async (organizationId, id) => {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        organization_id,
        branch_id,
        created_by_user_id,
        doctor_id,
        medicine_id,
        medicine_name,
        generic_name,
        dosage_form,
        strength,
        preferred_sig,
        use_count,
        created_at,
        updated_at
      FROM favorite_medicines
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
    `,
    [organizationId, id]
  );

  return mapFavoriteMedicine(rows[0] || null);
};

const createFavoriteMedicine = async (organizationId, payload) => {
  const { rows } = await pool.query(
    `
      INSERT INTO favorite_medicines (
        organization_id,
        branch_id,
        created_by_user_id,
        doctor_id,
        medicine_id,
        medicine_name,
        generic_name,
        dosage_form,
        strength,
        preferred_sig
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `,
    [
      organizationId,
      payload.branchId,
      payload.createdByUserId,
      payload.doctorId || null,
      payload.medicineId || null,
      payload.medicineName,
      payload.genericName || null,
      payload.dosageForm || null,
      payload.strength || null,
      payload.preferredSig
    ]
  );

  return getFavoriteMedicineById(organizationId, rows[0].id);
};

const deleteFavoriteMedicine = async (organizationId, id) => {
  const { rowCount } = await pool.query(
    `
      DELETE FROM favorite_medicines
      WHERE organization_id = $1
        AND id = $2
    `,
    [organizationId, id]
  );

  return rowCount > 0;
};

const getLastPrescription = async (organizationId, patientId, branchId = null) => {
  const values = [organizationId, patientId];
  let branchClause = "";

  if (branchId) {
    values.push(branchId);
    branchClause = `AND mr.branch_id = $${values.length}`;
  }

  const { rows } = await pool.query(
    `
      SELECT
        mr.id AS medical_record_id,
        mr.record_date::text AS record_date,
        mr.prescription AS prescription_text,
        d.full_name AS doctor_name
      FROM medical_records mr
      LEFT JOIN doctors d
        ON d.id = mr.doctor_id
       AND d.organization_id = mr.organization_id
      WHERE mr.organization_id = $1
        AND mr.patient_id = $2
        ${branchClause}
        AND mr.prescription IS NOT NULL
        AND BTRIM(mr.prescription) <> ''
      ORDER BY mr.record_date DESC, mr.created_at DESC
      LIMIT 1
    `,
    values
  );

  return rows[0] || null;
};

module.exports = {
  listPrescriptionTemplates,
  getPrescriptionTemplateById,
  createPrescriptionTemplate,
  deletePrescriptionTemplate,
  listFavoriteMedicines,
  getFavoriteMedicineById,
  createFavoriteMedicine,
  deleteFavoriteMedicine,
  getLastPrescription
};
