const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const ApiError = require("./api-error");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const MEDICAL_RECORDS_DIR = path.join(UPLOAD_ROOT, "medical-records");

const ALLOWED_CONTENT_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf"
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const sanitizeBaseName = (fileName) =>
  String(fileName || "attachment")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 60) || "attachment";

const saveMedicalRecordAttachment = async ({ fileName, contentType, dataBase64 }) => {
  const extension = ALLOWED_CONTENT_TYPES[contentType];
  if (!extension) {
    throw new ApiError(400, "Only JPG, PNG, WEBP, GIF, and PDF files are allowed");
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, "base64");
  } catch (_error) {
    throw new ApiError(400, "Invalid file payload");
  }

  if (!buffer || buffer.length === 0) {
    throw new ApiError(400, "Uploaded file is empty");
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new ApiError(400, "File must be 5MB or smaller");
  }

  await fs.mkdir(MEDICAL_RECORDS_DIR, { recursive: true });

  const safeBaseName = sanitizeBaseName(path.parse(fileName).name);
  const storedFileName = `${Date.now()}-${crypto.randomUUID()}-${safeBaseName}${extension}`;
  const absolutePath = path.join(MEDICAL_RECORDS_DIR, storedFileName);

  await fs.writeFile(absolutePath, buffer);

  return {
    fileUrl: `/uploads/medical-records/${storedFileName}`,
    fileName: storedFileName,
    contentType,
    size: buffer.length
  };
};

module.exports = {
  saveMedicalRecordAttachment,
  ALLOWED_CONTENT_TYPES: Object.keys(ALLOWED_CONTENT_TYPES),
  MAX_FILE_SIZE_BYTES
};
