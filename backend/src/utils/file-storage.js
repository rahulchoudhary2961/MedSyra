const crypto = require("crypto");
const { createReadStream } = require("fs");
const fs = require("fs/promises");
const path = require("path");
const ApiError = require("./api-error");

const PRIVATE_UPLOAD_ROOT = path.join(__dirname, "..", "..", "private-uploads");
const LEGACY_UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const PRIVATE_MEDICAL_RECORDS_DIR = path.join(PRIVATE_UPLOAD_ROOT, "medical-records");
const LEGACY_MEDICAL_RECORDS_DIR = path.join(LEGACY_UPLOAD_ROOT, "medical-records");
const PRIVATE_MEDICAL_RECORDS_PREFIX = "/private-uploads/medical-records/";
const LEGACY_MEDICAL_RECORDS_PREFIX = "/uploads/medical-records/";
const PRIVATE_LAB_REPORTS_DIR = path.join(PRIVATE_UPLOAD_ROOT, "lab-reports");
const LEGACY_LAB_REPORTS_DIR = path.join(LEGACY_UPLOAD_ROOT, "lab-reports");
const PRIVATE_LAB_REPORTS_PREFIX = "/private-uploads/lab-reports/";
const LEGACY_LAB_REPORTS_PREFIX = "/uploads/lab-reports/";

const ALLOWED_CONTENT_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf"
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPE_BY_EXTENSION = Object.fromEntries(
  Object.entries(ALLOWED_CONTENT_TYPES).map(([contentType, extension]) => [extension, contentType])
);

const sanitizeBaseName = (fileName) =>
  String(fileName || "attachment")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 60) || "attachment";

const parseStoredPath = (fileUrl, folderName) => {
  const normalized = String(fileUrl || "").trim().replace(/\\/g, "/");
  const match = normalized.match(new RegExp(`^\\/(private-uploads|uploads)\\/${folderName}\\/([a-z0-9._-]+)$`, "i"));

  if (!match) {
    throw new ApiError(400, "Attachment path is invalid");
  }

  return {
    normalizedPath: normalized,
    storedFileName: match[2],
    storageScope: match[1].toLowerCase() === "private-uploads" ? "private" : "legacy"
  };
};

const getScopedAbsolutePath = (parsedAttachmentPath, privateDir, legacyDir) =>
  path.join(parsedAttachmentPath.storageScope === "private" ? privateDir : legacyDir, parsedAttachmentPath.storedFileName);

const deriveDownloadFileName = (storedFileName) => {
  const normalized = String(storedFileName || "attachment");
  const stripped =
    normalized.match(/^\d{13}-[0-9a-f-]{36}-(.+)$/i)?.[1] ||
    normalized;

  return stripped.replace(/[^a-zA-Z0-9._-]/g, "-") || "attachment";
};

const parseStoredMedicalRecordPath = (fileUrl) => {
  return parseStoredPath(fileUrl, "medical-records");
};

const getMedicalRecordAbsolutePath = (parsedAttachmentPath) =>
  getScopedAbsolutePath(parsedAttachmentPath, PRIVATE_MEDICAL_RECORDS_DIR, LEGACY_MEDICAL_RECORDS_DIR);

const deriveMedicalRecordDownloadFileName = (storedFileName) => {
  return deriveDownloadFileName(storedFileName);
};

const getMedicalRecordContentType = (storedFileName) =>
  CONTENT_TYPE_BY_EXTENSION[path.extname(storedFileName).toLowerCase()] || "application/octet-stream";

const saveScopedAttachment = async ({ fileName, contentType, dataBase64, privateDir, privatePrefix }) => {
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

  await fs.mkdir(privateDir, { recursive: true });

  const safeBaseName = sanitizeBaseName(path.parse(fileName).name);
  const storedFileName = `${Date.now()}-${crypto.randomUUID()}-${safeBaseName}${extension}`;
  const absolutePath = path.join(privateDir, storedFileName);

  await fs.writeFile(absolutePath, buffer);

  return {
    fileUrl: `${privatePrefix}${storedFileName}`,
    fileName: storedFileName,
    contentType,
    size: buffer.length
  };
};

const saveMedicalRecordAttachment = async ({ fileName, contentType, dataBase64 }) =>
  saveScopedAttachment({
    fileName,
    contentType,
    dataBase64,
    privateDir: PRIVATE_MEDICAL_RECORDS_DIR,
    privatePrefix: PRIVATE_MEDICAL_RECORDS_PREFIX
  });

const saveLabReportAttachment = async ({ fileName, contentType, dataBase64 }) =>
  saveScopedAttachment({
    fileName,
    contentType,
    dataBase64,
    privateDir: PRIVATE_LAB_REPORTS_DIR,
    privatePrefix: PRIVATE_LAB_REPORTS_PREFIX
  });

const getAttachmentStats = async (absolutePath, notFoundMessage) => {
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new ApiError(404, notFoundMessage);
    }

    return stats;
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new ApiError(404, notFoundMessage);
    }

    throw error;
  }
};

const loadMedicalRecordAttachment = async (fileUrl) => {
  const parsedAttachmentPath = parseStoredMedicalRecordPath(fileUrl);
  const absolutePath = getMedicalRecordAbsolutePath(parsedAttachmentPath);
  const stats = await getAttachmentStats(absolutePath, "Attachment file not found");

  return {
    absolutePath,
    size: stats.size,
    storedFileName: parsedAttachmentPath.storedFileName,
    downloadFileName: deriveMedicalRecordDownloadFileName(parsedAttachmentPath.storedFileName),
    contentType: getMedicalRecordContentType(parsedAttachmentPath.storedFileName),
    storageScope: parsedAttachmentPath.storageScope,
    createReadStream: () => createReadStream(absolutePath)
  };
};

const parseStoredLabReportPath = (fileUrl) => parseStoredPath(fileUrl, "lab-reports");

const getLabReportAbsolutePath = (parsedAttachmentPath) =>
  getScopedAbsolutePath(parsedAttachmentPath, PRIVATE_LAB_REPORTS_DIR, LEGACY_LAB_REPORTS_DIR);

const loadLabReportAttachment = async (fileUrl) => {
  const parsedAttachmentPath = parseStoredLabReportPath(fileUrl);
  const absolutePath = getLabReportAbsolutePath(parsedAttachmentPath);
  const stats = await getAttachmentStats(absolutePath, "Lab report file not found");

  return {
    absolutePath,
    size: stats.size,
    storedFileName: parsedAttachmentPath.storedFileName,
    downloadFileName: deriveDownloadFileName(parsedAttachmentPath.storedFileName),
    contentType: getMedicalRecordContentType(parsedAttachmentPath.storedFileName),
    storageScope: parsedAttachmentPath.storageScope,
    createReadStream: () => createReadStream(absolutePath)
  };
};

module.exports = {
  saveMedicalRecordAttachment,
  saveLabReportAttachment,
  loadMedicalRecordAttachment,
  loadLabReportAttachment,
  parseStoredMedicalRecordPath,
  parseStoredLabReportPath,
  deriveMedicalRecordDownloadFileName,
  PRIVATE_MEDICAL_RECORDS_PREFIX,
  LEGACY_MEDICAL_RECORDS_PREFIX,
  PRIVATE_LAB_REPORTS_PREFIX,
  LEGACY_LAB_REPORTS_PREFIX,
  ALLOWED_CONTENT_TYPES: Object.keys(ALLOWED_CONTENT_TYPES),
  MAX_FILE_SIZE_BYTES
};
