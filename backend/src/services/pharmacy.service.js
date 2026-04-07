const ApiError = require("../utils/api-error");
const cache = require("../utils/cache");
const pharmacyModel = require("../models/pharmacy.model");
const patientsModel = require("../models/patients.model");
const doctorsModel = require("../models/doctors.model");
const appointmentsModel = require("../models/appointments.model");
const medicalRecordsModel = require("../models/medical-records.model");
const { logAuditEventSafe } = require("./audit.service");

const patientProfileCachePrefix = (organizationId) => `patients:profile:${organizationId}`;
const dashboardSummaryCachePrefix = (organizationId) => `dashboard:summary:${organizationId}`;
const dashboardReportsCachePrefix = (organizationId) => `dashboard:reports:${organizationId}`;
const billingListCachePrefix = (organizationId) => `billings:list:${organizationId}`;
const billingItemCachePrefix = (organizationId) => `billings:item:${organizationId}`;

const invalidatePharmacyRelatedCaches = async (organizationId) => {
  await Promise.all([
    cache.invalidateByPrefix(patientProfileCachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardSummaryCachePrefix(organizationId)),
    cache.invalidateByPrefix(dashboardReportsCachePrefix(organizationId)),
    cache.invalidateByPrefix(billingListCachePrefix(organizationId)),
    cache.invalidateByPrefix(billingItemCachePrefix(organizationId))
  ]);
};

const resolveActorDoctor = async (organizationId, actor) => {
  if (actor?.role !== "doctor") {
    return null;
  }

  const doctor =
    (await doctorsModel.getDoctorByUserId(organizationId, actor.sub)) ||
    (await doctorsModel.getDoctorByEmail(organizationId, actor.email));

  if (!doctor) {
    throw new ApiError(403, "Doctor account is not linked to a doctor profile");
  }

  return doctor;
};

const ensurePharmacyDoctorAccess = async (organizationId, actor, doctorId = null) => {
  const actorDoctor = await resolveActorDoctor(organizationId, actor);
  if (!actorDoctor) {
    return doctorId || null;
  }

  if (doctorId && doctorId !== actorDoctor.id) {
    throw new ApiError(403, "You can only access pharmacy entries assigned to your own doctor profile");
  }

  return actorDoctor.id;
};

const validateBatchPayload = async (organizationId, payload, currentBatch = null) => {
  const medicineId = payload.medicineId || currentBatch?.medicine_id;
  if (!medicineId) {
    throw new ApiError(400, "medicineId is required");
  }

  const medicine = await pharmacyModel.getMedicineById(organizationId, medicineId);
  if (!medicine) {
    throw new ApiError(404, "Medicine not found");
  }

  const receivedQuantity =
    payload.receivedQuantity !== undefined
      ? Number(payload.receivedQuantity)
      : Number(currentBatch?.received_quantity || 0);
  const availableQuantity =
    payload.availableQuantity !== undefined
      ? Number(payload.availableQuantity)
      : currentBatch
        ? Number(currentBatch.available_quantity || 0)
        : receivedQuantity;

  if (availableQuantity > receivedQuantity) {
    throw new ApiError(400, "availableQuantity cannot be greater than receivedQuantity");
  }

  return medicine;
};

const validateDispenseReferences = async (organizationId, payload) => {
  const patient = await patientsModel.getPatientById(organizationId, payload.patientId);
  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  let doctor = null;
  if (payload.doctorId) {
    doctor = await doctorsModel.getDoctorById(organizationId, payload.doctorId);
    if (!doctor) {
      throw new ApiError(404, "Doctor not found");
    }
  }

  let appointment = null;
  if (payload.appointmentId) {
    appointment = await appointmentsModel.getAppointmentById(organizationId, payload.appointmentId);
    if (!appointment) {
      throw new ApiError(404, "Appointment not found");
    }

    if (appointment.patient_id && appointment.patient_id !== payload.patientId) {
      throw new ApiError(400, "Appointment does not belong to the selected patient");
    }

    if (payload.doctorId && appointment.doctor_id && appointment.doctor_id !== payload.doctorId) {
      throw new ApiError(400, "Appointment does not belong to the selected doctor");
    }
  }

  let medicalRecord = null;
  if (payload.medicalRecordId) {
    medicalRecord = await medicalRecordsModel.getMedicalRecordById(organizationId, payload.medicalRecordId);
    if (!medicalRecord) {
      throw new ApiError(404, "Medical record not found");
    }

    if (medicalRecord.patient_id !== payload.patientId) {
      throw new ApiError(400, "Medical record does not belong to the selected patient");
    }

    if (payload.doctorId && medicalRecord.doctor_id && medicalRecord.doctor_id !== payload.doctorId) {
      throw new ApiError(400, "Medical record does not belong to the selected doctor");
    }
  }

  return { patient, doctor, appointment, medicalRecord };
};

const validateDispenseItems = async (organizationId, items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Add at least one medicine line");
  }

  const resolved = [];

  for (const item of items) {
    const batch = await pharmacyModel.getMedicineBatchById(organizationId, item.medicineBatchId);
    if (!batch) {
      throw new ApiError(404, "Selected medicine batch was not found");
    }

    if (Number(batch.available_quantity || 0) <= 0) {
      throw new ApiError(400, `Batch ${batch.batch_number} for ${batch.medicine_name} is out of stock`);
    }

    resolved.push({
      medicineBatchId: batch.id,
      quantity: Number(item.quantity),
      unitPrice: item.unitPrice !== undefined ? Number(item.unitPrice) : undefined,
      directions: item.directions || null
    });
  }

  return resolved;
};

const listMedicines = async (organizationId, query) => pharmacyModel.listMedicines(organizationId, query);
const getPharmacyInsights = async (organizationId, query = {}) =>
  pharmacyModel.getPharmacyInsights(organizationId, Math.min(Math.max(Number(query.limit) || 8, 1), 20));

const createMedicine = async (organizationId, payload, actor = null, requestMeta = null) => {
  const created = await pharmacyModel.createMedicine(organizationId, payload);
  await invalidatePharmacyRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "pharmacy",
    action: "medicine_created",
    summary: `Medicine created: ${created.name}`,
    entityType: "medicine",
    entityId: created.id,
    entityLabel: created.name,
    metadata: {
      code: created.code || null
    },
    afterState: created
  });

  return created;
};

const updateMedicine = async (organizationId, id, payload, actor = null, requestMeta = null) => {
  const current = await pharmacyModel.getMedicineById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Medicine not found");
  }

  const updated = await pharmacyModel.updateMedicine(organizationId, id, payload);
  await invalidatePharmacyRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "pharmacy",
    action: "medicine_updated",
    summary: `Medicine updated: ${updated.name}`,
    entityType: "medicine",
    entityId: updated.id,
    entityLabel: updated.name,
    metadata: {
      code: updated.code || null
    },
    beforeState: current,
    afterState: updated
  });

  return updated;
};

const listMedicineBatches = async (organizationId, query) => pharmacyModel.listMedicineBatches(organizationId, query);

const createMedicineBatch = async (organizationId, payload, actor = null, requestMeta = null) => {
  await validateBatchPayload(organizationId, payload);
  const created = await pharmacyModel.createMedicineBatch(organizationId, payload);
  await invalidatePharmacyRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "pharmacy",
    action: "medicine_batch_created",
    summary: `Medicine batch created: ${created.batch_number}`,
    entityType: "medicine_batch",
    entityId: created.id,
    entityLabel: `${created.medicine_name} ${created.batch_number}`,
    metadata: {
      medicineId: created.medicine_id,
      expiryDate: created.expiry_date || null
    },
    afterState: created
  });

  return created;
};

const updateMedicineBatch = async (organizationId, id, payload, actor = null, requestMeta = null) => {
  const current = await pharmacyModel.getMedicineBatchById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Medicine batch not found");
  }

  await validateBatchPayload(organizationId, payload, current);
  const updated = await pharmacyModel.updateMedicineBatch(organizationId, id, payload);
  await invalidatePharmacyRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "pharmacy",
    action: "medicine_batch_updated",
    summary: `Medicine batch updated: ${updated.batch_number}`,
    entityType: "medicine_batch",
    entityId: updated.id,
    entityLabel: `${updated.medicine_name} ${updated.batch_number}`,
    metadata: {
      medicineId: updated.medicine_id,
      expiryDate: updated.expiry_date || null
    },
    beforeState: current,
    afterState: updated
  });

  return updated;
};

const listPharmacyDispenses = async (organizationId, query, actor = null) => {
  const scopedDoctorId = await ensurePharmacyDoctorAccess(organizationId, actor, query.doctorId || null);
  const effectiveQuery = actor?.role === "doctor" ? { ...query, doctorId: scopedDoctorId } : query;
  return pharmacyModel.listPharmacyDispenses(organizationId, effectiveQuery);
};

const getPharmacyDispenseById = async (organizationId, id, actor = null) => {
  const dispense = await pharmacyModel.getPharmacyDispenseById(organizationId, id);
  if (!dispense) {
    throw new ApiError(404, "Pharmacy dispense not found");
  }

  const scopedDoctorId = await ensurePharmacyDoctorAccess(organizationId, actor, dispense.doctor_id || null);
  if (actor?.role === "doctor" && scopedDoctorId && dispense.doctor_id !== scopedDoctorId) {
    throw new ApiError(403, "You can only access your own pharmacy records");
  }

  return dispense;
};

const createPharmacyDispense = async (organizationId, payload, actor = null, requestMeta = null) => {
  const scopedDoctorId = await ensurePharmacyDoctorAccess(organizationId, actor, payload.doctorId || null);
  const normalizedPayload = {
    ...payload,
    doctorId: scopedDoctorId || payload.doctorId || null,
    dispensedByUserId: actor?.sub || null
  };

  const references = await validateDispenseReferences(organizationId, normalizedPayload);
  normalizedPayload.items = await validateDispenseItems(organizationId, normalizedPayload.items);

  if (!normalizedPayload.prescriptionSnapshot && references.medicalRecord?.prescription) {
    normalizedPayload.prescriptionSnapshot = references.medicalRecord.prescription;
  }

  const created = await pharmacyModel.createPharmacyDispense(organizationId, normalizedPayload, actor);
  await invalidatePharmacyRelatedCaches(organizationId);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "pharmacy",
    action: "dispense_created",
    summary: `Medicine dispensed: ${created.dispense_number}`,
    entityType: "pharmacy_dispense",
    entityId: created.id,
    entityLabel: created.dispense_number,
    metadata: {
      patientId: created.patient_id,
      doctorId: created.doctor_id || null,
      invoiceId: created.invoice_id || null,
      status: created.status
    },
    afterState: created
  });

  return created;
};

module.exports = {
  listMedicines,
  getPharmacyInsights,
  createMedicine,
  updateMedicine,
  listMedicineBatches,
  createMedicineBatch,
  updateMedicineBatch,
  listPharmacyDispenses,
  getPharmacyDispenseById,
  createPharmacyDispense
};
