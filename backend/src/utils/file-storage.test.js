const assert = require("node:assert/strict");
const path = require("node:path");

const ApiError = require(path.resolve(__dirname, "./api-error.js"));
const {
  parseStoredMedicalRecordPath,
  deriveMedicalRecordDownloadFileName
} = require(path.resolve(__dirname, "./file-storage.js"));

const run = async () => {
  const privateAttachment = parseStoredMedicalRecordPath(
    "/private-uploads/medical-records/1774794881597-2a0332c1-da85-4ce3-933b-3abfdb87e71a-clinic-report-90d.pdf"
  );
  assert.equal(privateAttachment.storageScope, "private");
  assert.equal(
    privateAttachment.storedFileName,
    "1774794881597-2a0332c1-da85-4ce3-933b-3abfdb87e71a-clinic-report-90d.pdf"
  );

  const legacyAttachment = parseStoredMedicalRecordPath("/uploads/medical-records/demo-report.pdf");
  assert.equal(legacyAttachment.storageScope, "legacy");
  assert.equal(legacyAttachment.storedFileName, "demo-report.pdf");

  assert.equal(
    deriveMedicalRecordDownloadFileName(
      "1774794881597-2a0332c1-da85-4ce3-933b-3abfdb87e71a-clinic-report-90d.pdf"
    ),
    "clinic-report-90d.pdf"
  );

  assert.throws(
    () => parseStoredMedicalRecordPath("/uploads/medical-records/../../secrets.txt"),
    (error) => error instanceof ApiError && error.message === "Attachment path is invalid"
  );
};

module.exports = run;
