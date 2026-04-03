"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessAssistant } from "@/lib/roles";
import { Patient } from "@/types/api";

type AssistantResponse = {
  success: boolean;
  data: {
    reply: string;
    mode: "nvidia" | "local";
    suggestions: string[];
    patient: {
      id: string;
      fullName: string;
    } | null;
    generatedAt: string;
  };
};

type PatientsResponse = {
  success: boolean;
  data: {
    items: Patient[];
  };
};

type MeResponse = {
  success: boolean;
  data: {
    role: string;
  };
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  mode?: "nvidia" | "local";
};

const initialPrompts = [
  "How many appointments are left today?",
  "What is this week's revenue?",
  "How many follow-ups are due today?"
];

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Ask about appointments, revenue, follow-ups, or select a patient to get a focused summary."
};

export default function AssistantPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(initialPrompts);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then((response) => setCurrentRole(response.data.role || ""))
      .catch(() => setCurrentRole(""));
  }, []);

  useEffect(() => {
    apiRequest<PatientsResponse>("/patients?limit=100", { authenticated: true })
      .then((response) => setPatients(response.data.items || []))
      .catch(() => setPatients([]))
      .finally(() => setLoadingPatients(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  );

  const submitPrompt = async (prompt: string) => {
    const message = prompt.trim();
    if (!message || sending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSending(true);
    setError("");

    try {
      const response = await apiRequest<AssistantResponse>("/ai/assistant", {
        method: "POST",
        authenticated: true,
        body: {
          ...(selectedPatientId ? { patientId: selectedPatientId } : {}),
          message
        }
      });

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: response.data.reply,
          mode: response.data.mode
        }
      ]);
      setSuggestions(response.data.suggestions || initialPrompts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get assistant response");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitPrompt(input);
  };

  if (currentRole && !canAccessAssistant(currentRole)) {
    return <p className="text-red-600">You do not have access to the AI assistant.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-600">AI Assistant</p>
            <h1 className="mt-2 text-2xl text-gray-900">MedSyra Copilot</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              One screen, one purpose: ask operational questions and get a short answer from your real data.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Patient Context</p>
              <p className="mt-2 text-sm text-emerald-900">
                {selectedPatient ? selectedPatient.full_name : "General organization view"}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Good For</p>
              <p className="mt-2 text-sm text-gray-700">Appointments, revenue, follow-ups, patient summaries</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Optional patient</span>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              disabled={loadingPatients || sending}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900"
            >
              <option value="">General organization context</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-sm font-medium text-gray-700">Quick prompts</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitPrompt(prompt)}
                  disabled={sending}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section data-tour-id="tour-assistant-chat" className="rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-600 p-2 text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg text-gray-900">Assistant Chat</h2>
              <p className="text-sm text-gray-600">Keep prompts short and operational.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div className="max-h-[460px] space-y-4 overflow-y-auto pr-1">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-3xl rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-emerald-600 text-white"
                      : "border border-gray-200 bg-gray-50 text-gray-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {message.role === "assistant" && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{message.mode === "nvidia" ? "NVIDIA-backed response" : "Local data fallback"}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something like: Which metrics need attention today?"
              rows={4}
              disabled={sending}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                {selectedPatient ? `Patient context: ${selectedPatient.full_name}` : "Using general organization context"}
              </p>
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-base text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                Ask Assistant
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
