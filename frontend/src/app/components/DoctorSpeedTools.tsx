"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Search, Star, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/api";

type PrescriptionTemplate = {
  id: string;
  name: string;
  template_text: string;
  diagnosis_hint: string | null;
  notes_hint: string | null;
};

type FavoriteMedicine = {
  id: string;
  medicine_id: string | null;
  medicine_name: string;
  generic_name: string | null;
  dosage_form: string | null;
  strength: string | null;
  preferred_sig: string;
};

type SuggestionItem = {
  key: string;
  source: "favorite" | "catalog" | "history";
  label: string;
  insertText: string;
  medicineId: string | null;
  favoriteId: string | null;
  isFavorited: boolean;
};

type LastPrescription = {
  medical_record_id: string;
  record_date: string;
  doctor_name: string | null;
  prescription_text: string;
  items: string[];
} | null;

type WorkspaceResponse = {
  success: boolean;
  data: {
    actor_doctor_id: string | null;
    templates: PrescriptionTemplate[];
    favorites: FavoriteMedicine[];
    lastPrescription: LastPrescription;
    suggestions: SuggestionItem[];
  };
};

type MutationResponse<T> = {
  success: boolean;
  data: T;
};

type DoctorSpeedToolsProps = {
  patientId?: string | null;
  doctorId?: string | null;
  prescription: string;
  notes: string;
  diagnosis?: string;
  onPrescriptionChange: (value: string) => void;
  onNotesChange: (value: string) => void;
};

const mergeText = (current: string, next: string) => {
  const currentValue = current.trim();
  const nextValue = next.trim();

  if (!nextValue) {
    return currentValue;
  }

  if (!currentValue) {
    return nextValue;
  }

  if (currentValue.includes(nextValue)) {
    return currentValue;
  }

  return `${currentValue}\n${nextValue}`.trim();
};

const appendSpeechText = (current: string, transcript: string) => {
  const currentValue = current.trim();
  const nextValue = transcript.trim();

  if (!nextValue) {
    return currentValue;
  }

  if (!currentValue) {
    return nextValue;
  }

  return `${currentValue}\n${nextValue}`.trim();
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
};

export default function DoctorSpeedTools({
  patientId,
  doctorId,
  prescription,
  notes,
  diagnosis,
  onPrescriptionChange,
  onNotesChange
}: DoctorSpeedToolsProps) {
  const [templates, setTemplates] = useState<PrescriptionTemplate[]>([]);
  const [favorites, setFavorites] = useState<FavoriteMedicine[]>([]);
  const [lastPrescription, setLastPrescription] = useState<LastPrescription>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingFavoriteKey, setSavingFavoriteKey] = useState<string | null>(null);
  const [removingTemplateId, setRemovingTemplateId] = useState<string | null>(null);
  const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null);
  const [voiceTarget, setVoiceTarget] = useState<"prescription" | "notes" | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const recognitionRef = useRef<{
    stop: () => void;
  } | null>(null);
  const requestIdRef = useRef(0);

  const loadWorkspace = useCallback(
    async (query = "") => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setLoadingWorkspace(true);

      try {
        const params = new URLSearchParams();
        params.set("limit", "8");
        if (patientId) {
          params.set("patientId", patientId);
        }
        if (doctorId) {
          params.set("doctorId", doctorId);
        }
        if (query.trim()) {
          params.set("q", query.trim());
        }

        const response = await apiRequest<WorkspaceResponse>(`/doctor-tools/prescription-workspace?${params.toString()}`, {
          authenticated: true
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        setTemplates(response.data.templates || []);
        setFavorites(response.data.favorites || []);
        setLastPrescription(response.data.lastPrescription || null);
        setSuggestions(response.data.suggestions || []);
        setWorkspaceError("");
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setWorkspaceError(err instanceof Error ? err.message : "Failed to load doctor speed tools");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoadingWorkspace(false);
        }
      }
    },
    [doctorId, patientId]
  );

  useEffect(() => {
    void loadWorkspace("");
  }, [loadWorkspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace(searchTerm);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [loadWorkspace, searchTerm]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const canSaveTemplate = prescription.trim().length > 0;
  const canRepeatLast = Boolean(lastPrescription?.prescription_text);
  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => favorite.id)), [favorites]);

  const applyTemplate = (template: PrescriptionTemplate) => {
    onPrescriptionChange(mergeText(prescription, template.template_text));
  };

  const repeatLastPrescription = () => {
    if (!lastPrescription?.prescription_text) {
      return;
    }

    onPrescriptionChange(mergeText(prescription, lastPrescription.prescription_text));
  };

  const insertSuggestion = (suggestion: SuggestionItem) => {
    onPrescriptionChange(mergeText(prescription, suggestion.insertText));
    setSearchTerm("");
  };

  const saveCurrentTemplate = async () => {
    if (!canSaveTemplate) {
      return;
    }

    const name = window.prompt("Template name", diagnosis?.trim() || "Quick Template");
    if (!name || !name.trim()) {
      return;
    }

    setSavingTemplate(true);
    try {
      await apiRequest<MutationResponse<PrescriptionTemplate>>("/doctor-tools/prescription-templates", {
        method: "POST",
        authenticated: true,
        body: {
          name: name.trim(),
          templateText: prescription.trim(),
          diagnosisHint: diagnosis?.trim() || undefined,
          notesHint: notes.trim() || undefined
        }
      });

      await loadWorkspace(searchTerm);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const removeTemplate = async (templateId: string) => {
    setRemovingTemplateId(templateId);
    try {
      await apiRequest(`/doctor-tools/prescription-templates/${templateId}`, {
        method: "DELETE",
        authenticated: true
      });
      await loadWorkspace(searchTerm);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setRemovingTemplateId(null);
    }
  };

  const saveFavorite = async (suggestion: SuggestionItem) => {
    setSavingFavoriteKey(suggestion.key);
    try {
      await apiRequest<MutationResponse<FavoriteMedicine>>("/doctor-tools/favorite-medicines", {
        method: "POST",
        authenticated: true,
        body: {
          medicineId: suggestion.medicineId || undefined,
          medicineName: suggestion.insertText,
          preferredSig: suggestion.insertText
        }
      });
      await loadWorkspace(searchTerm);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : "Failed to save favorite medicine");
    } finally {
      setSavingFavoriteKey(null);
    }
  };

  const removeFavorite = async (favoriteId: string) => {
    if (!favoriteIds.has(favoriteId)) {
      return;
    }

    setRemovingFavoriteId(favoriteId);
    try {
      await apiRequest(`/doctor-tools/favorite-medicines/${favoriteId}`, {
        method: "DELETE",
        authenticated: true
      });
      await loadWorkspace(searchTerm);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : "Failed to remove favorite medicine");
    } finally {
      setRemovingFavoriteId(null);
    }
  };

  const startVoiceInput = (target: "prescription" | "notes") => {
    setVoiceError("");

    const SpeechRecognitionConstructor =
      typeof window === "undefined"
        ? null
        : (((window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
            .SpeechRecognition ||
            (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition) ??
          null);

    if (!SpeechRecognitionConstructor) {
      setVoiceError("Voice input is not supported in this browser.");
      return;
    }

    recognitionRef.current?.stop();

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();

      if (!transcript) {
        return;
      }

      if (target === "prescription") {
        onPrescriptionChange(appendSpeechText(prescription, transcript));
      } else {
        onNotesChange(appendSpeechText(notes, transcript));
      }
    };
    recognition.onerror = () => {
      setVoiceError("Voice capture failed. Try again.");
      setVoiceTarget(null);
    };
    recognition.onend = () => {
      setVoiceTarget(null);
      recognitionRef.current = null;
    };
    recognition.start();
    recognitionRef.current = recognition;
    setVoiceTarget(target);
  };

  const stopVoiceInput = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceTarget(null);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Doctor Speed Tools</p>
          <p className="mt-1 text-sm text-emerald-950">
            Templates, repeat-last, favorite medicines, quick suggestions, and voice input to reduce typing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={repeatLastPrescription}
            disabled={!canRepeatLast}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Repeat Last Prescription
          </button>
          <button
            type="button"
            onClick={saveCurrentTemplate}
            disabled={!canSaveTemplate || savingTemplate}
            className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingTemplate ? "Saving..." : "Save as Template"}
          </button>
        </div>
      </div>

      {(workspaceError || voiceError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {workspaceError || voiceError}
        </div>
      )}

      {lastPrescription && (
        <div className="rounded-xl border border-emerald-200 bg-white p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm text-gray-900">Last prescription</p>
              <p className="mt-1 text-xs text-gray-500">
                {formatDate(lastPrescription.record_date)}
                {lastPrescription.doctor_name ? ` | ${lastPrescription.doctor_name}` : ""}
              </p>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{lastPrescription.prescription_text}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-900">Prescription Templates</p>
              <p className="mt-1 text-xs text-gray-500">Apply a saved plan in one click.</p>
            </div>
            {loadingWorkspace && <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />}
          </div>
          {templates.length === 0 ? (
            <p className="text-sm text-gray-500">No saved templates yet.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-900">{template.name}</p>
                      {template.diagnosis_hint && <p className="mt-1 text-xs text-gray-500">{template.diagnosis_hint}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => applyTemplate(template)}
                        className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs text-emerald-800 hover:bg-emerald-50"
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeTemplate(template.id)}
                        disabled={removingTemplateId === template.id}
                        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        aria-label={`Delete ${template.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-gray-600">{template.template_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-900">Favorite Medicines</p>
              <p className="mt-1 text-xs text-gray-500">Keep your most-used medicines ready.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => (voiceTarget === "prescription" ? stopVoiceInput() : startVoiceInput("prescription"))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                {voiceTarget === "prescription" ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                Rx Voice
              </button>
              <button
                type="button"
                onClick={() => (voiceTarget === "notes" ? stopVoiceInput() : startVoiceInput("notes"))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                {voiceTarget === "notes" ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                Notes Voice
              </button>
            </div>
          </div>

          {favorites.length === 0 ? (
            <p className="text-sm text-gray-500">No favorite medicines saved yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {favorites.map((favorite) => (
                <div key={favorite.id} className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">
                  <button type="button" onClick={() => insertSuggestion({
                    key: `favorite:${favorite.id}`,
                    source: "favorite",
                    label: favorite.medicine_name,
                    insertText: favorite.preferred_sig,
                    medicineId: favorite.medicine_id,
                    favoriteId: favorite.id,
                    isFavorited: true
                  })}>
                    {favorite.medicine_name}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeFavorite(favorite.id)}
                    disabled={removingFavoriteId === favorite.id}
                    className="text-emerald-700 hover:text-emerald-900 disabled:opacity-60"
                    aria-label={`Remove ${favorite.medicine_name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-gray-700">Quick medicine search</label>
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Type medicine, strength, or last-used line"
                className="w-full border-none bg-transparent text-sm outline-none"
              />
            </div>
            <div className="space-y-2">
              {suggestions.length === 0 ? (
                <p className="text-xs text-gray-500">No suggestions yet. Start typing to search medicines.</p>
              ) : (
                suggestions.map((suggestion) => (
                  <div key={suggestion.key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <button type="button" onClick={() => insertSuggestion(suggestion)} className="min-w-0 text-left">
                      <p className="truncate text-sm text-gray-900">{suggestion.label || suggestion.insertText}</p>
                      <p className="mt-1 truncate text-xs uppercase tracking-[0.12em] text-gray-500">{suggestion.source}</p>
                    </button>
                    {suggestion.favoriteId ? (
                      <button
                        type="button"
                        onClick={() => void removeFavorite(suggestion.favoriteId!)}
                        disabled={removingFavoriteId === suggestion.favoriteId}
                        className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                        aria-label="Remove favorite"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void saveFavorite(suggestion)}
                        disabled={savingFavoriteKey === suggestion.key || suggestion.isFavorited}
                        className="rounded-lg border border-gray-300 bg-white p-2 text-amber-600 hover:bg-gray-50 disabled:opacity-60"
                        aria-label="Save favorite"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
