const asyncHandler = require("../utils/async-handler");
const medicalRecordsService = require("../services/medical-records.service");

const listMedicalRecords = asyncHandler(async (req, res) => {
  const data = await medicalRecordsService.listMedicalRecords(req.user.organizationId, req.query, req.user);
  res.json({ success: true, data });
});

const createMedicalRecord = asyncHandler(async (req, res) => {
  const data = await medicalRecordsService.createMedicalRecord(req.user.organizationId, req.body, req.user);
  res.status(201).json({ success: true, message: "Medical record created", data });
});

const getMedicalRecord = asyncHandler(async (req, res) => {
  const data = await medicalRecordsService.getMedicalRecordById(req.user.organizationId, req.params.id, req.user);
  res.json({ success: true, data });
});

const updateMedicalRecord = asyncHandler(async (req, res) => {
  const data = await medicalRecordsService.updateMedicalRecord(req.user.organizationId, req.params.id, req.body, req.user);
  res.json({ success: true, message: "Medical record updated", data });
});

const uploadMedicalRecordAttachment = asyncHandler(async (req, res) => {
  const data = await medicalRecordsService.uploadMedicalRecordAttachment(req.user.organizationId, req.body, req.user);
  res.status(201).json({ success: true, message: "Attachment uploaded", data });
});

const sendFollowUpReminder = asyncHandler(async (req, res) => {
  const data = await medicalRecordsService.sendMedicalRecordFollowUpReminder(
    req.user.organizationId,
    req.params.id,
    req.user
  );
  res.json({ success: true, message: "WhatsApp reminder sent", data });
});

const deleteMedicalRecord = asyncHandler(async (req, res) => {
  await medicalRecordsService.deleteMedicalRecord(req.user.organizationId, req.params.id);
  res.json({ success: true, message: "Medical record deleted" });
});

module.exports = {
  listMedicalRecords,
  createMedicalRecord,
  getMedicalRecord,
  updateMedicalRecord,
  uploadMedicalRecordAttachment,
  sendFollowUpReminder,
  deleteMedicalRecord
};
