const pool = require("../config/db");
const ApiError = require("../utils/api-error");
const insuranceModel = require("../models/insurance.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const appointmentsModel = require("../models/appointments.model");
const medicalRecordsModel = require("../models/medical-records.model");
const billingsModel = require("../models/billings.model");
const { logAuditEventSafe } = require("./audit.service");

const APPROVAL_STATUSES = new Set(["approved", "partially_approved"]);
const resolveBranchScopeId = (branchContext = null, fallback = null) =>
  branchContext?.readBranchId || branchContext?.writeBranchId || fallback || null;

const todayDateKey = () => new Date().toISOString().slice(0, 10);

const addDaysToDateKey = (dateKey, days) => {
  if (!dateKey) {
    return null;
  }

  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const resolveClaimReferences = async (organizationId, payload, current = null) => {
  const providerId = payload.providerId !== undefined ? payload.providerId : current?.provider_id;
  const patientId = payload.patientId !== undefined ? payload.patientId : current?.patient_id;
  const doctorId = payload.doctorId !== undefined ? payload.doctorId : current?.doctor_id;
  const appointmentId = payload.appointmentId !== undefined ? payload.appointmentId : current?.appointment_id;
  const medicalRecordId = payload.medicalRecordId !== undefined ? payload.medicalRecordId : current?.medical_record_id;
  const invoiceId = payload.invoiceId !== undefined ? payload.invoiceId : current?.invoice_id;

  if (!providerId) {
    throw new ApiError(400, "providerId is required");
  }

  if (!patientId) {
    throw new ApiError(400, "patientId is required");
  }

  const [provider, patient] = await Promise.all([
    insuranceModel.getInsuranceProviderById(organizationId, providerId),
    patientsModel.getPatientById(organizationId, patientId)
  ]);

  if (!provider) {
    throw new ApiError(404, "Insurance provider not found");
  }

  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  let doctor = null;
  if (doctorId) {
    doctor = await doctorsModel.getDoctorById(organizationId, doctorId);
    if (!doctor) {
      throw new ApiError(404, "Doctor not found");
    }
  }

  let appointment = null;
  if (appointmentId) {
    appointment = await appointmentsModel.getAppointmentById(organizationId, appointmentId);
    if (!appointment) {
      throw new ApiError(404, "Appointment not found");
    }

    if (appointment.patient_id && appointment.patient_id !== patientId) {
      throw new ApiError(400, "Appointment patient does not match the selected patient");
    }

    if (doctorId && appointment.doctor_id && appointment.doctor_id !== doctorId) {
      throw new ApiError(400, "Appointment doctor does not match the selected doctor");
    }
  }

  let medicalRecord = null;
  if (medicalRecordId) {
    medicalRecord = await medicalRecordsModel.getMedicalRecordById(organizationId, medicalRecordId);
    if (!medicalRecord) {
      throw new ApiError(404, "Medical record not found");
    }

    if (medicalRecord.patient_id !== patientId) {
      throw new ApiError(400, "Medical record patient does not match the selected patient");
    }

    if (doctorId && medicalRecord.doctor_id && medicalRecord.doctor_id !== doctorId) {
      throw new ApiError(400, "Medical record doctor does not match the selected doctor");
    }
  }

  let invoice = null;
  if (invoiceId) {
    invoice = await billingsModel.getInvoiceById(organizationId, invoiceId);
    if (!invoice) {
      throw new ApiError(404, "Invoice not found");
    }

    if (invoice.patient_id !== patientId) {
      throw new ApiError(400, "Invoice patient does not match the selected patient");
    }

    if (doctorId && invoice.doctor_id && invoice.doctor_id !== doctorId) {
      throw new ApiError(400, "Invoice doctor does not match the selected doctor");
    }
  }

  return {
    provider,
    patient,
    doctor,
    appointment,
    medicalRecord,
    invoice,
    branchId:
      appointment?.branch_id ||
      medicalRecord?.branch_id ||
      invoice?.branch_id ||
      null
  };
};

const normalizeMoney = (value) => Number(Number(value || 0).toFixed(2));

const deriveClaimPayload = ({ payload, current = null, references, actor = null }) => {
  const nextStatus = payload.status !== undefined ? payload.status : current?.status || "draft";
  const doctorId =
    payload.doctorId !== undefined
      ? payload.doctorId || null
      : current?.doctor_id || references.medicalRecord?.doctor_id || references.invoice?.doctor_id || references.appointment?.doctor_id || null;

  const claimedAmount =
    payload.claimedAmount !== undefined
      ? normalizeMoney(payload.claimedAmount)
      : current?.claimed_amount !== undefined
        ? normalizeMoney(current.claimed_amount)
        : normalizeMoney(references.invoice?.balance_amount || references.invoice?.total_amount || 0);

  if (claimedAmount <= 0) {
    throw new ApiError(400, "Claimed amount must be greater than zero");
  }

  const approvedAmount =
    payload.approvedAmount !== undefined
      ? normalizeMoney(payload.approvedAmount)
      : current?.approved_amount !== undefined
        ? normalizeMoney(current.approved_amount)
        : 0;
  const paidAmount =
    payload.paidAmount !== undefined
      ? normalizeMoney(payload.paidAmount)
      : current?.paid_amount !== undefined
        ? normalizeMoney(current.paid_amount)
        : 0;

  if (approvedAmount > claimedAmount) {
    throw new ApiError(400, "Approved amount cannot exceed the claimed amount");
  }

  const approvedLimit = approvedAmount > 0 ? approvedAmount : claimedAmount;
  if (paidAmount > approvedLimit) {
    throw new ApiError(400, "Paid amount cannot exceed the approved or claimed amount");
  }

  const submittedDate =
    payload.submittedDate !== undefined
      ? payload.submittedDate || null
      : current?.submitted_date || (nextStatus !== "draft" ? todayDateKey() : null);
  const responseDueDate =
    payload.responseDueDate !== undefined
      ? payload.responseDueDate || null
      : current?.response_due_date || (submittedDate ? addDaysToDateKey(submittedDate, 14) : null);
  const approvedDate =
    payload.approvedDate !== undefined
      ? payload.approvedDate || null
      : current?.approved_date || (APPROVAL_STATUSES.has(nextStatus) ? todayDateKey() : null);
  const settledDate =
    payload.settledDate !== undefined
      ? payload.settledDate || null
      : current?.settled_date || (nextStatus === "settled" ? todayDateKey() : null);

  return {
    providerId: references.provider.id,
    patientId: references.patient.id,
    doctorId,
    appointmentId: payload.appointmentId !== undefined ? payload.appointmentId || null : current?.appointment_id || null,
    medicalRecordId: payload.medicalRecordId !== undefined ? payload.medicalRecordId || null : current?.medical_record_id || null,
    invoiceId: payload.invoiceId !== undefined ? payload.invoiceId || null : current?.invoice_id || null,
    createdByUserId: current?.created_by_user_id || actor?.sub || null,
    policyNumber:
      payload.policyNumber !== undefined
        ? payload.policyNumber || null
        : current?.policy_number || null,
    memberId:
      payload.memberId !== undefined
        ? payload.memberId || null
        : current?.member_id || null,
    status: nextStatus,
    claimedAmount,
    approvedAmount,
    paidAmount,
    diagnosisSummary:
      payload.diagnosisSummary !== undefined
        ? payload.diagnosisSummary || null
        : current?.diagnosis_summary || references.medicalRecord?.diagnosis || null,
    treatmentSummary:
      payload.treatmentSummary !== undefined
        ? payload.treatmentSummary || null
        : current?.treatment_summary || references.medicalRecord?.record_type || null,
    submittedDate,
    responseDueDate,
    approvedDate,
    settledDate,
    rejectionReason:
      payload.rejectionReason !== undefined
        ? payload.rejectionReason || null
        : current?.rejection_reason || null,
    notes:
      payload.notes !== undefined
        ? payload.notes || null
        : current?.notes || null,
    lastStatusChangedAt:
      current && current.status !== nextStatus
        ? new Date().toISOString()
        : undefined
  };
};

const listInsuranceProviders = async (organizationId, query) => insuranceModel.listInsuranceProviders(organizationId, query);

const createInsuranceProvider = async (organizationId, payload, actor = null, requestMeta = null) => {
  const created = await insuranceModel.createInsuranceProvider(organizationId, payload);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "insurance",
    action: "insurance_provider_created",
    summary: `Insurance provider created: ${created.name}`,
    entityType: "insurance_provider",
    entityId: created.id,
    entityLabel: created.name,
    afterState: created
  });

  return created;
};

const updateInsuranceProvider = async (organizationId, id, payload, actor = null, requestMeta = null) => {
  const current = await insuranceModel.getInsuranceProviderById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Insurance provider not found");
  }

  const updated = await insuranceModel.updateInsuranceProvider(organizationId, id, payload);
  if (!updated) {
    throw new ApiError(404, "Insurance provider not found");
  }

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "insurance",
    action: "insurance_provider_updated",
    summary: `Insurance provider updated: ${updated.name}`,
    entityType: "insurance_provider",
    entityId: updated.id,
    entityLabel: updated.name,
    beforeState: current,
    afterState: updated
  });

  return updated;
};

const listInsuranceClaims = async (organizationId, query) => insuranceModel.listInsuranceClaims(organizationId, query);

const getInsuranceClaimById = async (organizationId, id) => {
  const claim = await insuranceModel.getInsuranceClaimById(organizationId, id);
  if (!claim) {
    throw new ApiError(404, "Insurance claim not found");
  }

  return claim;
};

const createInsuranceClaim = async (organizationId, payload, actor = null, requestMeta = null, branchContext = null) => {
  const references = await resolveClaimReferences(organizationId, payload);
  const normalizedPayload = {
    ...deriveClaimPayload({ payload, references, actor }),
    branchId: references.branchId || resolveBranchScopeId(branchContext, actor?.branchId)
  };

  if (!normalizedPayload.branchId) {
    throw new ApiError(400, "A branch must be selected before creating an insurance claim");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await insuranceModel.createInsuranceClaimWithDb(client, organizationId, normalizedPayload);

    await insuranceModel.createInsuranceClaimEventWithDb(client, organizationId, created.id, {
      actorUserId: actor?.sub || null,
      eventType: created.status === "draft" ? "claim_created" : "claim_submitted",
      previousStatus: null,
      nextStatus: created.status,
      note: created.notes || null,
      metadata: {
        providerId: created.provider_id,
        invoiceId: created.invoice_id,
        medicalRecordId: created.medical_record_id,
        claimedAmount: created.claimed_amount
      }
    });

    await client.query("COMMIT");

    await logAuditEventSafe({
      organizationId,
      actor,
      requestMeta,
      module: "insurance",
      action: "insurance_claim_created",
      summary: `Insurance claim created: ${created.claim_number}`,
      entityType: "insurance_claim",
      entityId: created.id,
      entityLabel: created.claim_number,
      metadata: {
        status: created.status,
        providerId: created.provider_id,
        invoiceId: created.invoice_id,
        medicalRecordId: created.medical_record_id
      },
      afterState: created
    });

    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateInsuranceClaim = async (organizationId, id, payload, actor = null, requestMeta = null) => {
  const current = await insuranceModel.getInsuranceClaimById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Insurance claim not found");
  }

  const references = await resolveClaimReferences(organizationId, payload, current);
  const normalizedPayload = deriveClaimPayload({ payload, current, references, actor });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await insuranceModel.updateInsuranceClaimWithDb(client, organizationId, id, normalizedPayload);
    if (!updated) {
      throw new ApiError(404, "Insurance claim not found");
    }

    const statusChanged = current.status !== updated.status;
    const eventType = statusChanged ? "status_changed" : "claim_updated";

    await insuranceModel.createInsuranceClaimEventWithDb(client, organizationId, id, {
      actorUserId: actor?.sub || null,
      eventType,
      previousStatus: current.status,
      nextStatus: updated.status,
      note: payload.notes || payload.rejectionReason || null,
      metadata: {
        claimedAmount: updated.claimed_amount,
        approvedAmount: updated.approved_amount,
        paidAmount: updated.paid_amount,
        responseDueDate: updated.response_due_date
      }
    });

    await client.query("COMMIT");

    await logAuditEventSafe({
      organizationId,
      actor,
      requestMeta,
      module: "insurance",
      action: "insurance_claim_updated",
      summary: `Insurance claim updated: ${updated.claim_number}`,
      entityType: "insurance_claim",
      entityId: updated.id,
      entityLabel: updated.claim_number,
      metadata: {
        statusChanged,
        previousStatus: current.status,
        nextStatus: updated.status
      },
      beforeState: current,
      afterState: updated
    });

    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const addInsuranceClaimEvent = async (organizationId, claimId, payload, actor = null, requestMeta = null) => {
  const current = await insuranceModel.getInsuranceClaimById(organizationId, claimId);
  if (!current) {
    throw new ApiError(404, "Insurance claim not found");
  }

  const references = await resolveClaimReferences(
    organizationId,
    {
      providerId: current.provider_id,
      patientId: current.patient_id,
      doctorId: current.doctor_id,
      appointmentId: current.appointment_id,
      medicalRecordId: current.medical_record_id,
      invoiceId: current.invoice_id
    },
    current
  );

  const eventUpdatePayload = {};
  if (payload.nextStatus !== undefined) {
    eventUpdatePayload.status = payload.nextStatus;
  }
  if (payload.approvedAmount !== undefined) {
    eventUpdatePayload.approvedAmount = payload.approvedAmount;
  }
  if (payload.paidAmount !== undefined) {
    eventUpdatePayload.paidAmount = payload.paidAmount;
  }
  if (payload.rejectionReason !== undefined) {
    eventUpdatePayload.rejectionReason = payload.rejectionReason;
  }
  if (payload.responseDueDate !== undefined) {
    eventUpdatePayload.responseDueDate = payload.responseDueDate;
  }

  const normalizedPayload =
    Object.keys(eventUpdatePayload).length > 0
      ? deriveClaimPayload({
          payload: eventUpdatePayload,
          current,
          references,
          actor
        })
      : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const updated =
      normalizedPayload
        ? await insuranceModel.updateInsuranceClaimWithDb(client, organizationId, claimId, normalizedPayload)
        : current;

    const previousStatus = current.status;
    const nextStatus = updated.status;
    let eventType = "note_added";

    if (payload.nextStatus && payload.nextStatus !== previousStatus) {
      eventType = payload.nextStatus === "submitted" && previousStatus === "draft" ? "claim_submitted" : "status_changed";
    } else if (payload.paidAmount !== undefined) {
      eventType = "payment_recorded";
    } else if (payload.approvedAmount !== undefined || payload.rejectionReason) {
      eventType = "approval_recorded";
    }

    const event = await insuranceModel.createInsuranceClaimEventWithDb(client, organizationId, claimId, {
      actorUserId: actor?.sub || null,
      eventType,
      previousStatus,
      nextStatus,
      note: payload.note || null,
      metadata: {
        approvedAmount: updated.approved_amount,
        paidAmount: updated.paid_amount,
        rejectionReason: updated.rejection_reason,
        responseDueDate: updated.response_due_date
      }
    });

    await client.query("COMMIT");

    await logAuditEventSafe({
      organizationId,
      actor,
      requestMeta,
      module: "insurance",
      action: "insurance_claim_event_added",
      summary: `Insurance claim event added: ${current.claim_number}`,
      entityType: "insurance_claim",
      entityId: current.id,
      entityLabel: current.claim_number,
      metadata: {
        eventType,
        previousStatus,
        nextStatus
      },
      beforeState: current,
      afterState: updated
    });

    return {
      claim: updated,
      event
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getInsuranceReferenceData = async (organizationId, query) => insuranceModel.getInsuranceReferenceData(organizationId, query);

module.exports = {
  listInsuranceProviders,
  createInsuranceProvider,
  updateInsuranceProvider,
  listInsuranceClaims,
  getInsuranceClaimById,
  createInsuranceClaim,
  updateInsuranceClaim,
  addInsuranceClaimEvent,
  getInsuranceReferenceData
};
