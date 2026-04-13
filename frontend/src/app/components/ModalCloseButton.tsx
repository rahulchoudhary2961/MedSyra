"use client";

import { X } from "lucide-react";

type ModalCloseButtonProps = {
  onClick: () => void;
  className?: string;
  title?: string;
};

export default function ModalCloseButton({ onClick, className = "", title = "Close" }: ModalCloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 transition hover:bg-red-50 hover:text-red-700 ${className}`}
    >
      <X className="h-4 w-4" />
    </button>
  );
}
