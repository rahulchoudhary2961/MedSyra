const ApiError = require("../utils/api-error");
const doctorToolsModel = require("../models/doctor-tools.model");
const doctorsModel = require("../models/doctors.model");
const pharmacyModel = require("../models/pharmacy.model");
const { logAuditEventSafe } = require("./audit.service");

const FULL_ACCESS_ROLES = new Set(["admin", "management"]);

const splitPrescriptionItems = (value) =>
  String(value || "")
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);

const buildMedicineInsertText = ({ medicineName, strength = null, dosageForm = null, preferredSig = null }) => {
  if (preferredSig && String(preferredSig).trim()) {
    return String(preferredSig).trim();
  }

  return [medicineName, strength, dosageForm].filter(Boolean).join(" ").trim();
};

const resolveActorDoctor = async (organizationId, actor) => {
  if (actor?.role !== "doctor") {
    return null;
  }

  return (
    (await doctorsModel.getDoctorByUserId(organizationId, actor.sub)) ||
    (await doctorsModel.getDoctorByEmail(organizationId, actor.email))
  );
};

const canManageResource = (actor, resource) =>
  FULL_ACCESS_ROLES.has(actor?.role) || resource.created_by_user_id === actor?.sub;

const buildFavoritePayload = async (organizationId, payload) => {
  let medicine = null;
  if (payload.medicineId) {
    medicine = await pharmacyModel.getMedicineById(organizationId, payload.medicineId);
    if (!medicine) {
      throw new ApiError(404, "Medicine not found");
    }
  }

  const medicineName = payload.medicineName?.trim() || medicine?.name || "";
  if (!medicineName) {
    throw new ApiError(400, "medicineName is required");
  }

  const genericName = payload.genericName?.trim() || medicine?.generic_name || null;
  const dosageForm = payload.dosageForm?.trim() || medicine?.dosage_form || null;
  const strength = payload.strength?.trim() || medicine?.strength || null;
  const preferredSig = buildMedicineInsertText({
    medicineName,
    strength,
    dosageForm,
    preferredSig: payload.preferredSig?.trim() || null
  });

  return {
    medicineId: medicine?.id || payload.medicineId || null,
    medicineName,
    genericName,
    dosageForm,
    strength,
    preferredSig
  };
};

const buildWorkspaceSuggestions = ({ favorites, medicines, lastPrescription, q = "", limit = 8 }) => {
  const normalizedQuery = q.trim().toLowerCase();
  const matchesQuery = (value) => !normalizedQuery || value.toLowerCase().includes(normalizedQuery);
  const seen = new Set();
  const items = [];

  const pushSuggestion = (suggestion) => {
    const dedupeKey = suggestion.insertText.toLowerCase();
    if (!suggestion.insertText || seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    items.push(suggestion);
  };

  favorites
    .filter((favorite) =>
      matchesQuery(
        `${favorite.medicine_name} ${favorite.generic_name || ""} ${favorite.strength || ""} ${favorite.dosage_form || ""} ${favorite.preferred_sig || ""}`
      )
    )
    .forEach((favorite) =>
      pushSuggestion({
        key: `favorite:${favorite.id}`,
        source: "favorite",
        label: [favorite.medicine_name, favorite.strength, favorite.dosage_form].filter(Boolean).join(" | "),
        insertText: favorite.preferred_sig,
        medicineId: favorite.medicine_id || null,
        favoriteId: favorite.id,
        isFavorited: true
      })
    );

  (lastPrescription?.items || [])
    .filter((item) => matchesQuery(item))
    .forEach((item, index) =>
      pushSuggestion({
        key: `history:${index}`,
        source: "history",
        label: item,
        insertText: item,
        medicineId: null,
        favoriteId: null,
        isFavorited: false
      })
    );

  medicines
    .filter((medicine) =>
      matchesQuery(`${medicine.name} ${medicine.generic_name || ""} ${medicine.strength || ""} ${medicine.dosage_form || ""}`)
    )
    .forEach((medicine) =>
      pushSuggestion({
        key: `catalog:${medicine.id}`,
        source: "catalog",
        label: [medicine.name, medicine.strength, medicine.dosage_form].filter(Boolean).join(" | "),
        insertText: buildMedicineInsertText({
          medicineName: medicine.name,
          strength: medicine.strength,
          dosageForm: medicine.dosage_form
        }),
        medicineId: medicine.id,
        favoriteId: null,
        isFavorited: favorites.some((favorite) => favorite.medicine_id === medicine.id)
      })
    );

  return items.slice(0, limit);
};

const getPrescriptionWorkspace = async (organizationId, query, actor, branchContext) => {
  const branchId = branchContext?.readBranchId || null;
  const doctor = await resolveActorDoctor(organizationId, actor);
  const limit = Math.min(Number.parseInt(String(query.limit || "8"), 10) || 8, 20);
  const [templates, favorites, lastPrescription, medicinesResponse] = await Promise.all([
    doctorToolsModel.listPrescriptionTemplates(organizationId, {
      userId: actor.sub,
      branchId,
      limit: 12
    }),
    doctorToolsModel.listFavoriteMedicines(organizationId, {
      userId: actor.sub,
      branchId,
      limit: 16
    }),
    query.patientId ? doctorToolsModel.getLastPrescription(organizationId, query.patientId, branchId) : Promise.resolve(null),
    pharmacyModel.listMedicines(organizationId, {
      q: query.q || "",
      active: "true",
      limit,
      page: 1
    })
  ]);

  const lastPrescriptionData = lastPrescription
    ? {
        medical_record_id: lastPrescription.medical_record_id,
        record_date: lastPrescription.record_date,
        doctor_name: lastPrescription.doctor_name || null,
        prescription_text: lastPrescription.prescription_text,
        items: splitPrescriptionItems(lastPrescription.prescription_text)
      }
    : null;

  return {
    actor_doctor_id: doctor?.id || null,
    templates,
    favorites,
    lastPrescription: lastPrescriptionData,
    suggestions: buildWorkspaceSuggestions({
      favorites,
      medicines: medicinesResponse.items || [],
      lastPrescription: lastPrescriptionData,
      q: query.q || "",
      limit
    })
  };
};

const createPrescriptionTemplate = async (organizationId, payload, actor, branchContext, requestMeta) => {
  const branchId = branchContext?.writeBranchId || null;
  if (!branchId) {
    throw new ApiError(400, "Select a branch before saving prescription templates");
  }

  const doctor = await resolveActorDoctor(organizationId, actor);
  const created = await doctorToolsModel.createPrescriptionTemplate(organizationId, {
    branchId,
    createdByUserId: actor.sub,
    doctorId: doctor?.id || null,
    name: payload.name.trim(),
    templateText: payload.templateText.trim(),
    diagnosisHint: payload.diagnosisHint?.trim() || null,
    notesHint: payload.notesHint?.trim() || null
  });

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "doctor_tools",
    action: "prescription_template_created",
    summary: `Prescription template created: ${created.name}`,
    entityType: "prescription_template",
    entityId: created.id,
    entityLabel: created.name,
    metadata: {
      branchId: created.branch_id,
      doctorId: created.doctor_id || null
    },
    afterState: created
  });

  return created;
};

const deletePrescriptionTemplate = async (organizationId, id, actor, requestMeta) => {
  const current = await doctorToolsModel.getPrescriptionTemplateById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Prescription template not found");
  }

  if (!canManageResource(actor, current)) {
    throw new ApiError(403, "You can only delete your own prescription templates");
  }

  await doctorToolsModel.deletePrescriptionTemplate(organizationId, id);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "doctor_tools",
    action: "prescription_template_deleted",
    summary: `Prescription template deleted: ${current.name}`,
    entityType: "prescription_template",
    entityId: current.id,
    entityLabel: current.name,
    isDestructive: true,
    beforeState: current
  });
};

const createFavoriteMedicine = async (organizationId, payload, actor, branchContext, requestMeta) => {
  const branchId = branchContext?.writeBranchId || null;
  if (!branchId) {
    throw new ApiError(400, "Select a branch before saving favorite medicines");
  }

  const doctor = await resolveActorDoctor(organizationId, actor);
  const favoritePayload = await buildFavoritePayload(organizationId, payload);
  const existingFavorites = await doctorToolsModel.listFavoriteMedicines(organizationId, {
    userId: actor.sub,
    branchId,
    limit: 50
  });
  const duplicate = existingFavorites.find(
    (item) => item.preferred_sig.toLowerCase() === favoritePayload.preferredSig.toLowerCase()
  );

  if (duplicate) {
    return duplicate;
  }

  const created = await doctorToolsModel.createFavoriteMedicine(organizationId, {
    branchId,
    createdByUserId: actor.sub,
    doctorId: doctor?.id || null,
    ...favoritePayload
  });

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "doctor_tools",
    action: "favorite_medicine_created",
    summary: `Favorite medicine added: ${created.medicine_name}`,
    entityType: "favorite_medicine",
    entityId: created.id,
    entityLabel: created.medicine_name,
    metadata: {
      branchId: created.branch_id,
      doctorId: created.doctor_id || null,
      medicineId: created.medicine_id || null
    },
    afterState: created
  });

  return created;
};

const deleteFavoriteMedicine = async (organizationId, id, actor, requestMeta) => {
  const current = await doctorToolsModel.getFavoriteMedicineById(organizationId, id);
  if (!current) {
    throw new ApiError(404, "Favorite medicine not found");
  }

  if (!canManageResource(actor, current)) {
    throw new ApiError(403, "You can only delete your own favorite medicines");
  }

  await doctorToolsModel.deleteFavoriteMedicine(organizationId, id);

  await logAuditEventSafe({
    organizationId,
    actor,
    requestMeta,
    module: "doctor_tools",
    action: "favorite_medicine_deleted",
    summary: `Favorite medicine removed: ${current.medicine_name}`,
    entityType: "favorite_medicine",
    entityId: current.id,
    entityLabel: current.medicine_name,
    isDestructive: true,
    beforeState: current
  });
};

module.exports = {
  getPrescriptionWorkspace,
  createPrescriptionTemplate,
  deletePrescriptionTemplate,
  createFavoriteMedicine,
  deleteFavoriteMedicine
};
