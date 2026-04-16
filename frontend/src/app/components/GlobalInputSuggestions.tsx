"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SuggestionEntry = {
  value: string;
  count: number;
  updatedAt: number;
};

const STORAGE_PREFIX = "medsyra:input-suggestions:";
const MAX_SUGGESTIONS = 8;
const INPUT_SELECTOR =
  'input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="date"]):not([type="time"]):not([type="number"])';
const ELIGIBLE_TYPES = new Set(["text", "search", "email", "tel", "url"]);

const normalizeValue = (value: string) => value.trim();

const readSuggestions = (storageKey: string): SuggestionEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SuggestionEntry[];
    return Array.isArray(parsed)
      ? parsed
          .filter((entry) => entry && typeof entry.value === "string" && typeof entry.count === "number")
          .sort((left, right) => right.count - left.count || right.updatedAt - left.updatedAt)
      : [];
  } catch {
    return [];
  }
};

const writeSuggestions = (storageKey: string, entries: SuggestionEntry[]) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 20)));
  } catch {
    // Ignore storage failures.
  }
};

const buildStorageKey = (input: HTMLInputElement) => {
  const explicitKey = input.dataset.suggestKey?.trim();
  if (explicitKey) {
    return `${STORAGE_PREFIX}${explicitKey}`;
  }

  const label = input.getAttribute("placeholder")?.trim() || input.name?.trim() || input.id?.trim() || input.type || "field";
  return `${STORAGE_PREFIX}${window.location.pathname}:${label}`;
};

const isEligibleInput = (element: EventTarget | null): element is HTMLInputElement => {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  if (element.dataset.suggest === "off") {
    return false;
  }

  return ELIGIBLE_TYPES.has((element.type || "text").toLowerCase());
};

const refreshDatalist = (input: HTMLInputElement, datalist: HTMLDataListElement) => {
  const searchTerm = normalizeValue(input.value).toLowerCase();
  const entries = readSuggestions(buildStorageKey(input));
  const filteredEntries = searchTerm
    ? entries.filter((entry) => entry.value.toLowerCase().includes(searchTerm))
    : entries;

  datalist.replaceChildren(
    ...filteredEntries.slice(0, MAX_SUGGESTIONS).map((entry) => {
      const option = document.createElement("option");
      option.value = entry.value;
      return option;
    })
  );
};

const commitSuggestion = (input: HTMLInputElement) => {
  const value = normalizeValue(input.value);
  if (!value) {
    return;
  }

  const storageKey = buildStorageKey(input);
  const currentEntries = readSuggestions(storageKey);
  const normalizedValue = value.toLowerCase();
  const existing = currentEntries.find((entry) => entry.value.toLowerCase() === normalizedValue);
  const nextEntries = existing
    ? currentEntries.map((entry) =>
        entry.value.toLowerCase() === normalizedValue
          ? { ...entry, value, count: entry.count + 1, updatedAt: Date.now() }
          : entry
      )
    : [...currentEntries, { value, count: 1, updatedAt: Date.now() }];

  nextEntries.sort((left, right) => right.count - left.count || right.updatedAt - left.updatedAt);
  writeSuggestions(storageKey, nextEntries);
};

export default function GlobalInputSuggestions() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/" || pathname.startsWith("/auth")) {
      return;
    }

    const datalistByKey = new Map<string, HTMLDataListElement>();

    const ensureDatalist = (input: HTMLInputElement) => {
      const storageKey = buildStorageKey(input);
      let datalist = datalistByKey.get(storageKey);

      if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = storageKey.replace(/[^a-zA-Z0-9_-]/g, "_");
        datalistByKey.set(storageKey, datalist);
        document.body.appendChild(datalist);
      }

      input.setAttribute("list", datalist.id);
      refreshDatalist(input, datalist);
      return datalist;
    };

    const syncAllInputs = () => {
      document.querySelectorAll<HTMLInputElement>(INPUT_SELECTOR).forEach((input) => {
        if (!isEligibleInput(input)) {
          return;
        }

        if (input.dataset.suggestBound === "true") {
          return;
        }

        input.dataset.suggestBound = "true";
        ensureDatalist(input);
      });
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEligibleInput(event.target)) {
        return;
      }

      ensureDatalist(event.target);
    };

    const handleInput = (event: Event) => {
      if (!isEligibleInput(event.target)) {
        return;
      }

      const datalistId = event.target.getAttribute("list");
      if (!datalistId) {
        return;
      }

      const datalist = document.getElementById(datalistId) as HTMLDataListElement | null;
      if (!datalist) {
        return;
      }

      refreshDatalist(event.target, datalist);
    };

    const handleCommit = (event: Event) => {
      if (!isEligibleInput(event.target)) {
        return;
      }

      commitSuggestion(event.target);
      const datalistId = event.target.getAttribute("list");
      if (!datalistId) {
        return;
      }

      const datalist = document.getElementById(datalistId) as HTMLDataListElement | null;
      if (datalist) {
        refreshDatalist(event.target, datalist);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !isEligibleInput(event.target)) {
        return;
      }

      commitSuggestion(event.target);
      const datalistId = event.target.getAttribute("list");
      if (!datalistId) {
        return;
      }

      const datalist = document.getElementById(datalistId) as HTMLDataListElement | null;
      if (datalist) {
        refreshDatalist(event.target, datalist);
      }
    };

    let observer: MutationObserver | null = null;
    let initialized = false;
    const initTimer = window.setTimeout(() => {
      initialized = true;
      syncAllInputs();

      observer = new MutationObserver(() => {
        syncAllInputs();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      document.addEventListener("focusin", handleFocusIn);
      document.addEventListener("input", handleInput);
      document.addEventListener("blur", handleCommit, true);
      document.addEventListener("keydown", handleKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(initTimer);
      observer?.disconnect();
      if (initialized) {
        document.removeEventListener("focusin", handleFocusIn);
        document.removeEventListener("input", handleInput);
        document.removeEventListener("blur", handleCommit, true);
        document.removeEventListener("keydown", handleKeyDown);
      }
      datalistByKey.forEach((datalist) => datalist.remove());
    };
  }, [pathname]);

  return null;
}
