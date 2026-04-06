"use client";

import { type ComponentType, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CalendarClock,
  HeartPulse,
  Loader2,
  Receipt,
  RotateCcw,
  Send,
  Sparkles,
  Stethoscope,
  Users
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { canAccessAssistant } from "@/lib/roles";
import { Patient } from "@/types/api";

type Persona = "staff" | "patient";
type Workflow =
  | "operations"
  | "patient_summary"
  | "follow_up"
  | "billing"
  | "appointment_help"
  | "follow_up_help"
  | "billing_help"
  | "report_help";

type AssistantResponse = {
  success: boolean;
  data: {
    reply: string;
    mode: "nvidia" | "local";
    persona: Persona;
    workflow: Workflow;
    suggestions: string[];
    patient: {
      id: string;
      fullName: string;
    } | null;
    branch?: {
      id: string | null;
      name: string | null;
    };
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

type WorkflowConfig = {
  key: Workflow;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  prompts: string[];
};

const STAFF_WORKFLOWS: WorkflowConfig[] = [
  {
    key: "operations",
    title: "Operations",
    description: "Daily clinic metrics, appointments, and revenue.",
    icon: Users,
    prompts: [
      "What needs attention in this branch today?",
      "How many appointments are left today?",
      "What is this week's revenue?"
    ]
  },
  {
    key: "patient_summary",
    title: "Patient Summary",
    description: "Focused patient context, prescriptions, and last visit.",
    icon: Stethoscope,
    prompts: [
      "Summarize this patient in 3 lines",
      "What follow-up action is needed for this patient?",
      "What was last prescribed to this patient?"
    ]
  },
  {
    key: "follow_up",
    title: "Follow-Up Queue",
    description: "Recall, due follow-ups, and revisit attention.",
    icon: HeartPulse,
    prompts: [
      "How many follow-ups are due today?",
      "Which patients need recall attention next?",
      "What follow-up action is needed for this patient?"
    ]
  },
  {
    key: "billing",
    title: "Billing Help",
    description: "Revenue, dues, and operational billing status.",
    icon: Receipt,
    prompts: [
      "How many unpaid invoices do I have?",
      "What is my total income this month?",
      "Which billing metric needs attention?"
    ]
  }
];

const PATIENT_WORKFLOWS: WorkflowConfig[] = [
  {
    key: "appointment_help",
    title: "Appointment Help",
    description: "Explain the next visit, what to bring, and scheduling help.",
    icon: CalendarClock,
    prompts: [
      "Help me understand my next appointment",
      "What should I bring for my visit?",
      "How do I reschedule or contact the clinic?"
    ]
  },
  {
    key: "follow_up_help",
    title: "Follow-Up Help",
    description: "Return-visit guidance in simple patient-facing language.",
    icon: HeartPulse,
    prompts: [
      "What follow-up is due for this patient?",
      "What should the patient do next?",
      "When should the patient contact the clinic urgently?"
    ]
  },
  {
    key: "billing_help",
    title: "Billing Support",
    description: "Explain bills and payment next steps clearly.",
    icon: Receipt,
    prompts: [
      "Explain the pending bill in simple language",
      "How can the patient pay the invoice?",
      "What should the patient ask the billing desk?"
    ]
  },
  {
    key: "report_help",
    title: "Report Guidance",
    description: "Patient-friendly explanation boundaries and next questions for the doctor.",
    icon: Stethoscope,
    prompts: [
      "Explain the latest report in simple non-clinical language",
      "What should the patient ask the doctor about this report?",
      "What follow-up visit should the patient plan?"
    ]
  }
];

const PERSONA_LABELS: Record<Persona, { title: string; subtitle: string }> = {
  staff: {
    title: "Staff Copilot",
    subtitle: "Operational answers grounded in clinic data."
  },
  patient: {
    title: "Patient Support Chatbot",
    subtitle: "Patient-friendly guidance without diagnosing or prescribing."
  }
};

const getWorkflowConfig = (persona: Persona, workflow: Workflow) => {
  const workflows = persona === "patient" ? PATIENT_WORKFLOWS : STAFF_WORKFLOWS;
  return workflows.find((item) => item.key === workflow) || workflows[0];
};

const buildWelcomeMessage = (persona: Persona, workflow: Workflow): ChatMessage => {
  const workflowConfig = getWorkflowConfig(persona, workflow);

  return {
    id: `welcome-${persona}-${workflow}`,
    role: "assistant",
    content:
      persona === "patient"
        ? `Patient support mode is active for ${workflowConfig.title}. I’ll explain clinic, appointment, follow-up, billing, or report context in simple language and I will not diagnose or change medicines.`
        : `Staff chatbot mode is active for ${workflowConfig.title}. Ask short operational questions and I’ll answer from real clinic context.`
  };
};

const toHistoryPayload = (messages: ChatMessage[]) =>
  messages
    .filter((message) => message.role === "assistant" || message.role === "user")
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content
    }));

export default function AssistantPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [persona, setPersona] = useState<Persona>("staff");
  const [workflow, setWorkflow] = useState<Workflow>("operations");
  const [messages, setMessages] = useState<ChatMessage[]>([buildWelcomeMessage("staff", "operations")]);
  const [input, setInput] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(STAFF_WORKFLOWS[0].prompts);
  const [activeBranchName, setActiveBranchName] = useState<string | null>(null);
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

  useEffect(() => {
    const workflowConfig = getWorkflowConfig(persona, workflow);
    setMessages([buildWelcomeMessage(persona, workflowConfig.key)]);
    setSuggestions(workflowConfig.prompts);
    setError("");
  }, [persona, workflow]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) || null,
    [patients, selectedPatientId]
  );

  const personaConfig = PERSONA_LABELS[persona];
  const availableWorkflows = persona === "patient" ? PATIENT_WORKFLOWS : STAFF_WORKFLOWS;
  const currentWorkflowConfig = getWorkflowConfig(persona, workflow);

  const setPersonaAndWorkflow = (nextPersona: Persona) => {
    setPersona(nextPersona);
    setWorkflow(nextPersona === "patient" ? PATIENT_WORKFLOWS[0].key : STAFF_WORKFLOWS[0].key);
  };

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

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError("");

    try {
      const response = await apiRequest<AssistantResponse>("/ai/assistant", {
        method: "POST",
        authenticated: true,
        body: {
          ...(selectedPatientId ? { patientId: selectedPatientId } : {}),
          message,
          persona,
          workflow,
          history: toHistoryPayload(messages)
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
      setSuggestions(response.data.suggestions || currentWorkflowConfig.prompts);
      setActiveBranchName(response.data.branch?.name || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get chatbot response");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitPrompt(input);
  };

  const resetConversation = () => {
    setMessages([buildWelcomeMessage(persona, workflow)]);
    setSuggestions(currentWorkflowConfig.prompts);
    setInput("");
    setError("");
  };

  if (currentRole && !canAccessAssistant(currentRole)) {
    return <p className="text-red-600">You do not have access to the AI assistant.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-600">AI Chatbot</p>
            <h1 className="mt-2 text-2xl text-gray-900">MedSyra Guided Chat</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Switch between staff copilot and patient-support workflows, keep the conversation guided, and stay grounded in clinic context.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPersonaAndWorkflow("staff")}
              className={`rounded-2xl border px-4 py-4 text-left ${
                persona === "staff" ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Mode</p>
              <p className="mt-2 text-sm text-gray-900">Staff Copilot</p>
              <p className="mt-1 text-xs text-gray-500">Operations, billing, follow-ups, patient summaries</p>
            </button>
            <button
              type="button"
              onClick={() => setPersonaAndWorkflow("patient")}
              className={`rounded-2xl border px-4 py-4 text-left ${
                persona === "patient" ? "border-violet-300 bg-violet-50" : "border-gray-200 bg-gray-50"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Mode</p>
              <p className="mt-2 text-sm text-gray-900">Patient Support</p>
              <p className="mt-1 text-xs text-gray-500">Simple language, no diagnosis, no medication changes</p>
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">
              {persona === "patient" ? "Patient context recommended" : "Optional patient context"}
            </span>
            <select
              value={selectedPatientId}
              onChange={(event) => setSelectedPatientId(event.target.value)}
              disabled={loadingPatients || sending}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900"
            >
              <option value="">{persona === "patient" ? "Choose patient context if available" : "General clinic context"}</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Current Context</p>
            <p className="mt-2 text-sm text-gray-900">{personaConfig.title}</p>
            <p className="mt-1 text-sm text-gray-600">{personaConfig.subtitle}</p>
            <p className="mt-3 text-sm text-gray-700">
              Workflow: <span className="font-medium text-gray-900">{currentWorkflowConfig.title}</span>
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Patient: <span className="font-medium text-gray-900">{selectedPatient?.full_name || "Not selected"}</span>
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Branch: <span className="font-medium text-gray-900">{activeBranchName || "Current branch filter"}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg text-gray-900">Guided Workflows</h2>
            <p className="mt-1 text-sm text-gray-600">
              Start from a workflow so the chatbot stays aligned with the kind of help you need.
            </p>
          </div>
          <button
            type="button"
            onClick={resetConversation}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Chat
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-4">
          {availableWorkflows.map((item) => {
            const Icon = item.icon;
            const isActive = workflow === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setWorkflow(item.key)}
                className={`rounded-2xl border p-4 text-left transition ${
                  isActive
                    ? persona === "patient"
                      ? "border-violet-300 bg-violet-50"
                      : "border-emerald-300 bg-emerald-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="inline-flex rounded-2xl bg-white p-2 shadow-sm">
                  <Icon className={`h-5 w-5 ${persona === "patient" ? "text-violet-600" : "text-emerald-600"}`} />
                </div>
                <p className="mt-4 text-sm font-medium text-gray-900">{item.title}</p>
                <p className="mt-2 text-xs leading-5 text-gray-600">{item.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700">Guided starter prompts</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void submitPrompt(prompt)}
                disabled={sending}
                className={`rounded-full px-4 py-2 text-sm disabled:opacity-60 ${
                  persona === "patient"
                    ? "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section data-tour-id="tour-assistant-chat" className="rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-2xl p-2 text-white ${persona === "patient" ? "bg-violet-600" : "bg-emerald-600"}`}>
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg text-gray-900">{personaConfig.title}</h2>
              <p className="text-sm text-gray-600">{currentWorkflowConfig.description}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          <div className="max-h-[460px] space-y-4 overflow-y-auto pr-1">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-3xl rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? persona === "patient"
                        ? "bg-violet-600 text-white"
                        : "bg-emerald-600 text-white"
                      : "border border-gray-200 bg-gray-50 text-gray-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {message.role === "assistant" && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{persona === "patient" ? "Guided patient-support answer" : "Clinic-context chatbot answer"}</span>
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
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                persona === "patient"
                  ? "Ask something like: Explain the pending bill in simple language"
                  : "Ask something like: Which metric needs attention today?"
              }
              rows={4}
              disabled={sending}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                {selectedPatient
                  ? `Patient context: ${selectedPatient.full_name}`
                  : persona === "patient"
                    ? "Patient mode works best with patient context selected"
                    : "Using clinic-wide context"}
              </p>
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-base text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                  persona === "patient" ? "bg-violet-600 hover:bg-violet-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                <Send className="h-4 w-4" />
                Ask Chatbot
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
