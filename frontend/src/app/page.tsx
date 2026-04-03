"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  BellRing,
  CalendarDays,
  CreditCard,
  ClipboardList,
  LayoutDashboard,
  CheckCircle2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import BrandLogo from "./components/BrandLogo";
import { getAuthToken } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

const solutionItems = [
  "Appointments",
  "Billing",
  "Patient records",
  "Reports",
  "WhatsApp reminders",
  "AI assistant",
];

const featureSections = [
  {
    title: "Appointments",
    icon: CalendarDays,
    points: [
      "Book appointments",
      "Add walk-in patients",
      "View daily schedule",
    ],
  },
  {
    title: "Billing",
    icon: CreditCard,
    points: [
      "Generate invoices",
      "Track payments",
      "See pending dues",
    ],
  },
  {
    title: "Patient History",
    icon: ClipboardList,
    points: [
      "View past visits",
      "Access records",
      "Track patient details",
    ],
  },
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    points: [
      "Today appointments",
      "Today revenue",
      "Pending payments",
      "Clinic reports",
    ],
  },
  {
    title: "AI Assistant",
    icon: Bot,
    points: [
      "Ask operational questions in plain English",
      "Get answers from your real data",
      "Patient-aware assistant context",
    ],
  },
  {
    title: "Reminders",
    icon: BellRing,
    points: [
      "One-click WhatsApp reminders",
      "Follow-up tracking",
      "Appointment reminder flow",
    ],
  },
  {
    title: "Smart Insights",
    icon: TrendingUp,
    points: [
      "Patients who did not return",
      "Most common issue",
      "Weekly and monthly revenue",
    ],
  },
];

const flowSteps = [
  "Add patient",
  "Book appointment / walk-in",
  "Complete consultation",
  "Send reminder",
  "Generate bill",
  "Ask AI assistant",
];

const reasons = [
  "Easy to use",
  "No training required",
  "Saves time",
  "Works on any device",
];

const aiHighlights = [
  {
    title: "AI Patient Summary",
    icon: Sparkles,
    description: "Give doctors a quick view of last visit, recurring issue, follow-up status, and last prescription."
  },
  {
    title: "One-click Reminders",
    icon: BellRing,
    description: "Open WhatsApp with a ready reminder message for follow-up and appointment communication."
  },
  {
    title: "Smart Insights",
    icon: TrendingUp,
    description: "See return gaps, common issues, revenue, and follow-ups due without opening multiple screens."
  },
  {
    title: "MedSyra Copilot",
    icon: Bot,
    description: "Ask questions like total income this month or unpaid invoices and get a direct answer from your data."
  }
];

const pricingPlans = [
  {
    name: "Starter",
    price: "Rs. 799 / month",
    description: "Entry plan for solo doctors and small clinics that need the full operating workflow without a heavy monthly commitment.",
    points: [
      "Appointments, patients, billing, reminders, and core reports",
      "Designed for one doctor with a light staff setup",
      "Simple monthly plan for smaller practices"
    ]
  },
  {
    name: "Growth",
    price: "Rs. 1499 / month",
    description: "For growing clinics with multiple doctors, more staff coordination, and higher reporting and automation needs.",
    points: [
      "Advanced reporting, MedSyra Copilot, and fuller staff workflows",
      "Built for multi-doctor practices and busier front desks",
      "Best fit for clinics ready to scale daily operations"
    ]
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For hospital groups, chains, or multi-location setups that need onboarding support, custom rollout, and tailored commercials.",
    points: [
      "Custom pricing, onboarding, and operational setup",
      "Flexible commercials for larger account structures",
      "Best for chains, hospital groups, and special integrations"
    ]
  },
  {
    name: "Usage Credits",
    price: "Upsell as needed",
    description: "Keep AI and messaging monetization separate from the core subscription so clinics only pay more when usage expands.",
    points: [
      "One shared wallet across AI and messaging features",
      "Top up credits only when usage grows beyond the included bundle",
      "Simple rule: metered automation consumes credits from the same wallet"
    ]
  }
];

type ActivationMode = "demo" | "trial";

type LeadActivationResponse = {
  success: boolean;
  message: string;
  data: {
    activationType: ActivationMode;
    status: string;
    leadId: string;
    nextFollowUpAt: string;
    email?: string;
  };
};

export default function Home() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [activationMode, setActivationMode] = useState<ActivationMode>("demo");
  const [demoForm, setDemoForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    clinicName: "",
    city: "",
    demoDate: "",
    demoTime: "",
    demoTimezone: "Asia/Calcutta",
    message: ""
  });
  const [trialForm, setTrialForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    clinicName: "",
    city: "",
    requestedPlanTier: "starter",
    password: "",
    message: ""
  });
  const [isSubmittingActivation, setIsSubmittingActivation] = useState(false);
  const [activationSuccess, setActivationSuccess] = useState("");
  const [activationError, setActivationError] = useState("");

  useEffect(() => {
    const token = getAuthToken();

    if (token) {
      router.replace("/dashboard");
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setIsReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  if (!isReady) {
    return (
      <div className="theme-auth-bg min-h-screen flex items-center justify-center px-6 theme-copy">
        Opening your workspace...
      </div>
    );
  }

  const submitDemoRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActivationError("");
    setActivationSuccess("");
    setIsSubmittingActivation(true);

    try {
      const response = await apiRequest<LeadActivationResponse>("/leads", {
        method: "POST",
        body: {
          activationType: "demo",
          ...demoForm
        }
      });
      setActivationSuccess(response.message);
      setDemoForm({
        fullName: "",
        email: "",
        phone: "",
        clinicName: "",
        city: "",
        demoDate: "",
        demoTime: "",
        demoTimezone: "Asia/Calcutta",
        message: ""
      });
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : "Unable to schedule your demo right now");
    } finally {
      setIsSubmittingActivation(false);
    }
  };

  const submitTrialRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActivationError("");
    setActivationSuccess("");
    setIsSubmittingActivation(true);

    try {
      const response = await apiRequest<LeadActivationResponse>("/leads", {
        method: "POST",
        body: {
          activationType: "trial",
          ...trialForm
        }
      });
      setActivationSuccess(response.message);
      setTrialForm({
        fullName: "",
        email: "",
        phone: "",
        clinicName: "",
        city: "",
        requestedPlanTier: "starter",
        password: "",
        message: ""
      });

      if (response.data.email) {
        router.push(`/auth/verify-email?email=${encodeURIComponent(response.data.email)}`);
      }
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : "Unable to start your trial right now");
    } finally {
      setIsSubmittingActivation(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f4fbf8_0%,#ffffff_38%,#eef6f2_100%)] text-slate-900">
      <section className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.16),transparent_28%)]" />
        <div className="mx-auto w-full max-w-7xl px-6 pb-16 pt-6 lg:px-10">
          <header className="animate-fade-in flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <BrandLogo size={48} className="rounded-2xl shadow-[0_14px_40px_rgba(16,185,129,0.18)]" priority />
              <div>
                <p className="text-lg font-semibold tracking-[0.18em] text-emerald-700 uppercase">MedSyra</p>
                <p className="text-sm text-slate-600">Clinic management software for India</p>
              </div>
            </div>

            <nav className="hidden items-center gap-3 md:flex">
              <Link
                href="/auth/signin"
                className="rounded-full border border-emerald-200 bg-white/85 px-5 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                Sign In
              </Link>
              <Link
                href="#demo-form"
                onClick={() => setActivationMode("demo")}
                className="rounded-full bg-slate-950 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Book Free Demo
              </Link>
            </nav>
          </header>

          <div className="grid items-center gap-16 py-14 lg:min-h-[calc(100vh-6rem)] lg:grid-cols-[1.1fr_0.9fr]">
            <div className="max-w-3xl">
              <div className="animate-fade-up mb-6 inline-flex items-center rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm text-emerald-800 shadow-sm backdrop-blur">
                For independent doctors, clinics, and hospitals
              </div>
              <h1 className="animate-fade-up animation-delay-100 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-slate-950 md:text-6xl lg:text-7xl">
                Run your practice smoothly, without registers or manual work
              </h1>
              <p className="animate-fade-up animation-delay-200 mt-6 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
                Manage appointments, billing, reminders, patient records, reports, and AI workflows in one simple system.
              </p>

              <div className="animate-fade-up animation-delay-300 mt-10 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="#demo-form"
                  onClick={() => setActivationMode("demo")}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 py-4 text-base font-semibold text-white transition hover:bg-emerald-700"
                >
                  Book Free Demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="#demo-form"
                  onClick={() => setActivationMode("trial")}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-4 text-base font-semibold text-slate-800 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  Start Free Trial
                </Link>
              </div>

              <div className="animate-fade-up animation-delay-400 mt-8 flex flex-wrap gap-3 text-sm text-slate-600">
                <div className="hover-lift rounded-full border border-emerald-100 bg-white/80 px-4 py-2">Easy for doctors and reception</div>
                <div className="hover-lift rounded-full border border-emerald-100 bg-white/80 px-4 py-2">Works on laptop and mobile</div>
                <div className="hover-lift rounded-full border border-emerald-100 bg-white/80 px-4 py-2">Built for daily healthcare operations</div>
                <div className="hover-lift rounded-full border border-emerald-100 bg-white/80 px-4 py-2">AI summaries and reminders built in</div>
              </div>
            </div>

            <div className="animate-slide-in-right animation-delay-200 relative">
              <div className="animate-pulse-soft absolute -left-6 top-12 hidden h-24 w-24 rounded-full bg-emerald-200/50 blur-2xl lg:block" />
              <div className="animate-float-soft rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_30px_120px_rgba(15,23,42,0.12)] backdrop-blur">
                <div className="rounded-[1.5rem] bg-slate-950 p-6 text-white">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">Operations dashboard</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">See today clearly</h2>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-3 py-2 text-right">
                      <p className="text-xs text-slate-300">Today</p>
                      <p className="text-lg font-semibold">18 patients</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="hover-lift rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Today appointments</p>
                      <p className="mt-2 text-3xl font-semibold text-white">24</p>
                    </div>
                    <div className="hover-lift rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Today revenue</p>
                      <p className="mt-2 text-3xl font-semibold text-white">Rs. 18,500</p>
                    </div>
                    <div className="hover-lift rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2">
                      <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-300">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-base font-medium text-white">Pending payments</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            6 bills need follow-up today.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="hover-lift rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 md:col-span-2">
                      <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-white/10 p-3 text-emerald-200">
                          <Bot className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-base font-medium text-white">MedSyra Copilot</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            Ask: What is this month revenue? Who needs follow-up today? Which patient did not return?
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-18 lg:px-10">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Problem</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
            Common healthcare workflow problems, every day
          </h2>
          <div className="mt-8 space-y-3 text-lg text-slate-600">
            <p>Managing patients on paper or in registers?</p>
            <p>Losing track of payments and follow-ups?</p>
            <p>Doing too much work manually every day?</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up rounded-[2rem] bg-slate-950 px-8 py-12 text-white md:px-12">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">Solution</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
            One place to handle the full healthcare workflow
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
            MedSyra keeps appointments, billing, patient records, and reports together so your team can work faster and stay organized.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {solutionItems.map((item) => (
              <div key={item} className="hover-lift rounded-2xl border border-white/10 bg-white/5 px-5 py-5">
                <p className="text-lg font-medium">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Core features</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
            Simple tools healthcare teams will actually use
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {featureSections.map((section, index) => (
            <div
              key={section.title}
              className="animate-fade-up hover-lift rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
              style={{ animationDelay: `${index * 0.08 + 0.12}s` }}
            >
              <div className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <section.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-slate-950">{section.title}</h3>
              <ul className="mt-4 space-y-3">
                {section.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm leading-7 text-slate-600">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up rounded-[2rem] border border-emerald-100 bg-[linear-gradient(135deg,#f2fff8_0%,#ffffff_46%,#ecfeff_100%)] px-8 py-12 md:px-12">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">AI + Automation</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
              Modern healthcare workflows without extra complexity
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              MedSyra now includes doctor-friendly AI summaries, reminder workflows, smart insights, and an assistant that answers questions from your real data.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {aiHighlights.map((item, index) => (
              <div
                key={item.title}
                className="animate-fade-up hover-lift rounded-[1.5rem] border border-white/80 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
                style={{ animationDelay: `${index * 0.08 + 0.12}s` }}
              >
                <div className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">How it works</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
            A simple flow from patient entry to billing
          </h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-5">
          {flowSteps.map((step, index) => (
            <div
              key={step}
              className="animate-fade-up hover-lift relative rounded-[1.5rem] border border-slate-200 bg-white p-6 text-center shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
              style={{ animationDelay: `${index * 0.07 + 0.12}s` }}
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700">
                {index + 1}
              </div>
              <p className="mt-4 text-sm font-medium leading-6 text-slate-700">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Why choose this</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
            Made to reduce operational stress, not add to it
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {reasons.map((reason, index) => (
            <div
              key={reason}
              className="animate-fade-up hover-lift rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
              style={{ animationDelay: `${index * 0.08 + 0.1}s` }}
            >
              <div className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-slate-950">{reason}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {reason === "Easy to use" && "Clean screens and simple actions for busy healthcare staff."}
                {reason === "No training required" && "Your team can start using it without long onboarding."}
                {reason === "Saves time" && "Reduce repetitive front-desk work and manual tracking."}
                {reason === "Works on any device" && "Use it on laptop, desktop, or mobile during the day."}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="animate-fade-up hover-lift rounded-[2rem] border border-emerald-100 bg-emerald-50 p-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Trust</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Built for doctors, clinics, and hospitals
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              Designed for daily use by doctors, reception, and staff.
            </p>
          </div>
          <div className="animate-fade-up hover-lift animation-delay-150 rounded-[2rem] border border-slate-200 bg-white p-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Pricing</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Start with a free trial
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              Free trial available with simple clinic plans and optional usage add-ons.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Pricing Logic</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
            Simple plans for every clinic stage
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-600">
            Choose Starter, Growth, or Enterprise based on your clinic size. AI and messaging usage can be added separately as your workflow expands.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {pricingPlans.map((plan, index) => (
            <div
              key={plan.name}
              className="animate-fade-up hover-lift rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
              style={{ animationDelay: `${index * 0.08 + 0.1}s` }}
            >
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">{plan.name}</p>
              <h3 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{plan.price}</h3>
              <p className="mt-4 text-sm leading-7 text-slate-600">{plan.description}</p>
              <ul className="mt-6 space-y-3">
                {plan.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm leading-7 text-slate-600">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 animate-fade-up rounded-[1.5rem] border border-emerald-100 bg-emerald-50 px-6 py-5 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">Usage Add-On</p>
          <p className="mt-3 text-base leading-7 text-slate-700">
            Optional credits are available for higher AI and messaging usage, so clinics only pay more when they actually need more automation.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="animate-fade-up rounded-[2rem] bg-slate-950 px-8 py-12 text-white md:px-12">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">Get started</p>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
                Make your practice easier to manage
              </h2>
              <p className="mt-4 text-base leading-8 text-slate-300">
                Book a free demo or start your free trial today.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="#demo-form"
                onClick={() => setActivationMode("demo")}
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                Book a Free Demo
              </Link>
              <Link
                href="#demo-form"
                onClick={() => setActivationMode("trial")}
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:border-emerald-300 hover:text-emerald-300"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="demo-form" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-28 lg:px-10">
        <div className="animate-fade-up grid gap-8 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)] lg:grid-cols-[0.9fr_1.1fr] md:p-10">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Activation flow</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
              {activationMode === "demo"
                ? "Pick a demo slot and we will confirm it"
                : "Start a clinic trial immediately"}
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              {activationMode === "demo"
                ? "Choose your preferred demo date and time. We will record it, schedule follow-up automatically, and confirm the session on email or phone."
                : "Create your clinic admin account here. Your trial is provisioned immediately and you only need to verify your email to continue."}
            </p>
            <div className="mt-8 space-y-3 text-sm text-slate-600">
              <p>Best for independent doctors, clinics, and small multi-doctor practices.</p>
              <p>{activationMode === "demo" ? "Use this if you want a guided walkthrough first." : "Use this if you want direct product access without waiting for a callback."}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 rounded-[1.5rem] bg-slate-100 p-2">
              <button
                type="button"
                onClick={() => {
                  setActivationMode("demo");
                  setActivationError("");
                  setActivationSuccess("");
                }}
                className={`rounded-[1rem] px-4 py-3 text-sm font-semibold transition ${
                  activationMode === "demo" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
                }`}
              >
                Book Demo
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivationMode("trial");
                  setActivationError("");
                  setActivationSuccess("");
                }}
                className={`rounded-[1rem] px-4 py-3 text-sm font-semibold transition ${
                  activationMode === "trial" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"
                }`}
              >
                Start Trial
              </button>
            </div>

            {activationMode === "demo" ? (
              <form onSubmit={submitDemoRequest} className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Full Name</label>
                    <input
                      type="text"
                      value={demoForm.fullName}
                      onChange={(e) => setDemoForm((current) => ({ ...current, fullName: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="Dr. Amit Sharma"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Clinic Name</label>
                    <input
                      type="text"
                      value={demoForm.clinicName}
                      onChange={(e) => setDemoForm((current) => ({ ...current, clinicName: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="Sharma Care Clinic"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Email</label>
                    <input
                      type="email"
                      value={demoForm.email}
                      onChange={(e) => setDemoForm((current) => ({ ...current, email: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="doctor@practice.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Phone Number</label>
                    <input
                      type="tel"
                      value={demoForm.phone}
                      onChange={(e) => setDemoForm((current) => ({ ...current, phone: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="+91 9876543210"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Preferred Date</label>
                    <input
                      type="date"
                      value={demoForm.demoDate}
                      onChange={(e) => setDemoForm((current) => ({ ...current, demoDate: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Preferred Time</label>
                    <input
                      type="time"
                      value={demoForm.demoTime}
                      onChange={(e) => setDemoForm((current) => ({ ...current, demoTime: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">City</label>
                    <input
                      type="text"
                      value={demoForm.city}
                      onChange={(e) => setDemoForm((current) => ({ ...current, city: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="Mumbai"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-700">What do you want to see in the demo?</label>
                  <textarea
                    rows={4}
                    value={demoForm.message}
                    onChange={(e) => setDemoForm((current) => ({ ...current, message: e.target.value }))}
                    className="theme-input w-full rounded-xl px-4 py-3"
                    placeholder="Appointments, billing, reminders, doctor workflows, or multi-doctor reporting."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingActivation}
                  className="theme-button-primary w-full rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {isSubmittingActivation ? "Scheduling..." : "Schedule My Demo"}
                </button>
              </form>
            ) : (
              <form onSubmit={submitTrialRequest} className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Full Name</label>
                    <input
                      type="text"
                      value={trialForm.fullName}
                      onChange={(e) => setTrialForm((current) => ({ ...current, fullName: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="Dr. Amit Sharma"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Clinic Name</label>
                    <input
                      type="text"
                      value={trialForm.clinicName}
                      onChange={(e) => setTrialForm((current) => ({ ...current, clinicName: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="Sharma Care Clinic"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Email</label>
                    <input
                      type="email"
                      value={trialForm.email}
                      onChange={(e) => setTrialForm((current) => ({ ...current, email: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="doctor@practice.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Phone Number</label>
                    <input
                      type="tel"
                      value={trialForm.phone}
                      onChange={(e) => setTrialForm((current) => ({ ...current, phone: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="+91 9876543210"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">City</label>
                    <input
                      type="text"
                      value={trialForm.city}
                      onChange={(e) => setTrialForm((current) => ({ ...current, city: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="Mumbai"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Preferred Plan</label>
                    <select
                      value={trialForm.requestedPlanTier}
                      onChange={(e) => setTrialForm((current) => ({ ...current, requestedPlanTier: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                    >
                      <option value="starter">Starter</option>
                      <option value="growth">Growth</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-700">Create Password</label>
                    <input
                      type="password"
                      value={trialForm.password}
                      onChange={(e) => setTrialForm((current) => ({ ...current, password: e.target.value }))}
                      className="theme-input w-full rounded-xl px-4 py-3"
                      placeholder="Minimum 8 characters"
                      minLength={8}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-700">Notes</label>
                  <textarea
                    rows={4}
                    value={trialForm.message}
                    onChange={(e) => setTrialForm((current) => ({ ...current, message: e.target.value }))}
                    className="theme-input w-full rounded-xl px-4 py-3"
                    placeholder="Tell us about your clinic size or any onboarding help you need."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingActivation}
                  className="theme-button-primary w-full rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {isSubmittingActivation ? "Provisioning..." : "Create My Trial"}
                </button>
              </form>
            )}

            {activationSuccess && <p className="text-sm text-emerald-700">{activationSuccess}</p>}
            {activationError && <p className="text-sm text-red-600">{activationError}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
