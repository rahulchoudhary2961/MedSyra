"use client";

import { FileText } from "lucide-react";

type DocumentPreviewCardProps = {
  title: string;
  fileName: string;
  fileUrl?: string | null;
  previewUrl?: string | null;
  contentType?: string | null;
  onClick: () => void;
  className?: string;
};

const getExtensionLabel = (fileName: string, contentType?: string | null) => {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".pdf") || contentType?.includes("pdf")) return "PDF";
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || contentType?.includes("spreadsheet")) return "XLS";
  if (lowerName.endsWith(".csv")) return "CSV";
  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) return "DOC";
  if (lowerName.endsWith(".png")) return "PNG";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "JPG";
  if (lowerName.endsWith(".webp")) return "WEBP";
  if (lowerName.endsWith(".gif")) return "GIF";
  return "FILE";
};

export default function DocumentPreviewCard({
  title,
  fileName,
  fileUrl,
  previewUrl,
  contentType,
  onClick,
  className = ""
}: DocumentPreviewCardProps) {
  if (!fileUrl) {
    return null;
  }

  const isImage = Boolean(previewUrl && contentType?.startsWith("image/"));
  const isPdf = Boolean(previewUrl && contentType?.includes("pdf"));
  const ext = getExtensionLabel(fileName, contentType);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-4 inline-flex max-w-full items-center gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 text-left shadow-sm transition hover:border-emerald-200 hover:shadow-md ${className}`}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {isImage ? (
          <img src={previewUrl || ""} alt={title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : isPdf ? (
          <iframe
            src={previewUrl || ""}
            title={title}
            className="h-full w-full border-0 bg-white pointer-events-none"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-stone-50 via-white to-emerald-50 text-emerald-600">
            <FileText className="h-5 w-5" />
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{ext}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 pr-1">
        <p className="truncate text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">{fileName}</p>
      </div>
      <span className="mr-1 shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
        Open
      </span>
    </button>
  );
}
