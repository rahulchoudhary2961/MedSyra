const asyncHandler = require("../utils/async-handler");
const medicalRecordsService = require("../services/medical-records.service");
const { getRequestMeta, logInfo } = require("../utils/logger");

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

const downloadMedicalRecordAttachment = asyncHandler(async (req, res) => {
  const attachment = await medicalRecordsService.getMedicalRecordAttachmentDownload(
    req.user.organizationId,
    req.params.id,
    req.user
  );
  const fileName = String(attachment.downloadFileName || "attachment").replace(/"/g, "");

  logInfo("medical_record_attachment_downloaded", {
    ...getRequestMeta(req),
    organizationId: req.user.organizationId,
    userId: req.user.sub,
    role: req.user.role,
    recordId: req.params.id,
    fileName,
    storageScope: attachment.storageScope
  });

  res.setHeader("Content-Type", attachment.contentType);
  res.setHeader("Content-Length", String(attachment.size));
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(attachment.buffer);
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
  downloadMedicalRecordAttachment,
  sendFollowUpReminder,
  deleteMedicalRecord
};
