"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationItem = number | "...";

type NumberedPaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  disabled?: boolean;
};

const buildPaginationItems = (currentPage: number, totalPages: number): PaginationItem[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_value, index) => index + 1);
  }

  const items: PaginationItem[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    items.push("...");
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < totalPages - 1) {
    items.push("...");
  }

  items.push(totalPages);
  return items;
};

export default function NumberedPagination({
  currentPage,
  totalPages,
  onPageChange,
  className = "",
  disabled = false
}: NumberedPaginationProps) {
  const [goToPage, setGoToPage] = useState("");
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const items = buildPaginationItems(safeCurrentPage, safeTotalPages);

  const submitGoToPage = () => {
    if (disabled) {
      return;
    }

    const nextPage = Number(goToPage);
    if (!Number.isInteger(nextPage)) {
      return;
    }

    const clamped = Math.min(Math.max(1, nextPage), safeTotalPages);
    onPageChange(clamped);
    setGoToPage(String(clamped));
  };

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end ${className}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
          disabled={disabled || safeCurrentPage <= 1}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {items.map((item, index) =>
          item === "..." ? (
            <span key={`ellipsis-${index}`} className="px-2 text-lg leading-none text-gray-500">
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              disabled={disabled}
              className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-medium transition ${
                item === safeCurrentPage
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              aria-current={item === safeCurrentPage ? "page" : undefined}
              aria-label={`Go to page ${item}`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))}
          disabled={disabled || safeCurrentPage >= safeTotalPages}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500">Go to page</label>
        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white">
          <input
            type="number"
            min={1}
            max={safeTotalPages}
            value={goToPage}
            onChange={(event) => setGoToPage(event.target.value)}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitGoToPage();
              }
            }}
            className="w-20 border-0 px-3 py-2 text-sm outline-none disabled:bg-gray-50"
            aria-label="Go to page number"
          />
          <button
            type="button"
            onClick={submitGoToPage}
            disabled={disabled}
            className="border-l border-gray-300 px-3 py-2 text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Go to selected page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
