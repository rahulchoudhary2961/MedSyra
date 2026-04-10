const crypto = require("crypto");
const { createReadStream } = require("fs");
const fs = require("fs/promises");
const { Readable } = require("stream");
const path = require("path");
const env = require("../config/env");
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

const AWS_ALGORITHM = "AWS4-HMAC-SHA256";
const AWS_REQUEST_TYPE = "aws4_request";
const AWS_SERVICE = "s3";

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

const isR2StorageEnabled = () => env.fileStorageProvider === "r2";

const requireR2Config = () => {
  if (!isR2StorageEnabled()) {
    throw new ApiError(500, "R2 storage is not enabled");
  }

  return {
    accountId: env.r2AccountId,
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
    bucketName: env.r2BucketName,
    region: env.r2Region || "auto",
    endpoint: env.r2Endpoint || `https://${env.r2AccountId}.r2.cloudflarestorage.com`
  };
};

const buildR2ObjectKey = (folderName, storedFileName) => `${folderName}/${storedFileName}`;

const encodeR2Path = (value) =>
  String(value || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const getTimestampParts = (date = new Date()) => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: `${iso.slice(0, 8)}T${iso.slice(9, 15)}Z`,
    dateStamp: iso.slice(0, 8)
  };
};

const sha256Hex = (value) => crypto.createHash("sha256").update(value).digest("hex");

const hmac = (key, value) => crypto.createHmac("sha256", key).update(value).digest();

const getSigningKey = (secretAccessKey, dateStamp, region, service) => {
  const kDate = hmac(Buffer.from(`AWS4${secretAccessKey}`, "utf8"), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, AWS_REQUEST_TYPE);
};

const buildCanonicalQueryString = (searchParams = new URLSearchParams()) =>
  [...searchParams.entries()]
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? leftValue.localeCompare(rightValue) : leftKey.localeCompare(rightKey)
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

const signR2Request = ({ method, url, body, contentType, accessKeyId, secretAccessKey, region }) => {
  const parsedUrl = new URL(url);
  const { amzDate, dateStamp } = getTimestampParts();
  const payload = body || Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);

  const headers = {
    host: parsedUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };

  if (contentType) {
    headers["content-type"] = contentType;
  }

  const canonicalHeaders = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, " ")])
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  const signedHeaders = canonicalHeaders.map(([key]) => key).join(";");
  const canonicalHeadersString = canonicalHeaders.map(([key, value]) => `${key}:${value}\n`).join("");
  const canonicalRequest = [
    method.toUpperCase(),
    parsedUrl.pathname,
    buildCanonicalQueryString(parsedUrl.searchParams),
    canonicalHeadersString,
    signedHeaders,
    payloadHash
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${AWS_SERVICE}/${AWS_REQUEST_TYPE}`;
  const stringToSign = [
    AWS_ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, AWS_SERVICE);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `${AWS_ALGORITHM} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...headers,
    authorization
  };
};

const buildR2ObjectUrl = (folderName, storedFileName) => {
  const config = requireR2Config();
  const objectKey = buildR2ObjectKey(folderName, storedFileName);
  return `${config.endpoint.replace(/\/$/, "")}/${config.bucketName}/${encodeR2Path(objectKey)}`;
};

const uploadAttachmentToR2 = async ({ folderName, storedFileName, buffer, contentType }) => {
  const config = requireR2Config();
  const url = buildR2ObjectUrl(folderName, storedFileName);
  const headers = signR2Request({
    method: "PUT",
    url,
    body: buffer,
    contentType,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region
  });

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: buffer
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new ApiError(
      502,
      `Failed to upload attachment to R2 (${response.status})`,
      details || null
    );
  }
};

const loadAttachmentFromR2 = async ({ folderName, storedFileName, fallbackNotFoundMessage, contentTypeResolver }) => {
  const config = requireR2Config();
  const url = buildR2ObjectUrl(folderName, storedFileName);
  const headers = signR2Request({
    method: "GET",
    url,
    body: Buffer.alloc(0),
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region
  });

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  if (response.status === 404) {
    throw new ApiError(404, fallbackNotFoundMessage);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new ApiError(
      502,
      `Failed to load attachment from R2 (${response.status})`,
      details || null
    );
  }

  if (!response.body) {
    throw new ApiError(404, fallbackNotFoundMessage);
  }

  return {
    absolutePath: url,
    size: Number(response.headers.get("content-length") || 0) || null,
    storedFileName,
    downloadFileName: deriveDownloadFileName(storedFileName),
    contentType: response.headers.get("content-type") || contentTypeResolver(storedFileName),
    storageScope: "private",
    createReadStream: () => Readable.fromWeb(response.body)
  };
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

  if (isR2StorageEnabled()) {
    await uploadAttachmentToR2({
      folderName: path.basename(privateDir),
      storedFileName,
      buffer,
      contentType
    });
  } else {
    const absolutePath = path.join(privateDir, storedFileName);
    await fs.writeFile(absolutePath, buffer);
  }

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
  if (isR2StorageEnabled()) {
    return loadAttachmentFromR2({
      folderName: "medical-records",
      storedFileName: parsedAttachmentPath.storedFileName,
      fallbackNotFoundMessage: "Attachment file not found",
      contentTypeResolver: getMedicalRecordContentType
    });
  }

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
  if (isR2StorageEnabled()) {
    return loadAttachmentFromR2({
      folderName: "lab-reports",
      storedFileName: parsedAttachmentPath.storedFileName,
      fallbackNotFoundMessage: "Lab report file not found",
      contentTypeResolver: getMedicalRecordContentType
    });
  }

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
  MAX_FILE_SIZE_BYTES,
  buildR2ObjectUrl
};
