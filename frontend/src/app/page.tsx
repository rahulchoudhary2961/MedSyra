"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Boxes,
  FlaskConical,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import BrandLogo from "./components/BrandLogo";
import { apiRequest } from "@/lib/api";

const whatItDoes = [
  {
    title: "Patients",
    icon: Users,
    description: "Keep patient details, visit history, and contact information in one place."
  },
  {
    title: "Appointments",
    icon: CalendarDays,
    description: "Book consultations, walk-ins, and follow-ups without manual registers."
  },
  {
    title: "Medical Records",
    icon: FileText,
    description: "Store consultation notes, prescriptions, and reports together."
  },
  {
    title: "Billing",
    icon: CreditCard,
    description: "Generate bills, track payments, and see pending dues quickly."
  },
  {
    title: "Reminders",
    icon: BellRing,
    description: "Send appointment and follow-up reminders to reduce missed visits."
  },
  {
    title: "Smart Assistant",
    icon: Sparkles,
    description: "Ask simple questions like revenue, unpaid bills, or today's workload."
  }
];

const moreTools = [
  {
    title: "CRM",
    icon: MessageSquareText,
    image: "/pexels-saulozayas-4966406.jpg",
    description: "Track follow-ups, tasks, and reminders so the front desk can stay organized."
  },
  {
    title: "Lab",
    icon: FlaskConical,
    image: "/pexels-tima-miroshnichenko-6010795.jpg",
    description: "Create lab tests and keep orders connected to the patient record."
  },
  {
    title: "Pharmacy",
    icon: ClipboardList,
    image: "/pexels-alejandro-j-paredes-perez-633417416-36897678.jpg",
    description: "Manage medicine stock and dispensing without separate registers."
  },
  {
    title: "Inventory",
    icon: Boxes,
    image: "/pexels-gorden-murah-surabaya-28799425-7563452.jpg",
    description: "Monitor stock movements and keep supplies available for daily work."
  },
  {
    title: "Insurance",
    icon: ShieldCheck,
    image: "/pediatrician-doctor-nurse-sitting-desk-medical-office-talking-with-child-healthcare-practitioner-specialist-medicine-providing-professional-radiographic-treatment-hospital-clinic.jpg",
    description: "Record claims and approvals in the same workflow as the patient visit."
  }
];

const simpleSteps = [
  "Add a patient",
  "Book an appointment",
  "Complete the visit",
  "Send a reminder",
  "Generate the bill"
];

const trustPoints = [
  "Easy for doctors and reception staff",
  "Works on desktop and mobile",
  "Built for daily clinic operations"
];

type PricingPlan = {
  name: string;
  price: string;
  cadence: string;
  description: string;
  value: "starter" | "growth" | "enterprise";
  badge: string;
  featured?: boolean;
  features: string[];
};

const pricingPlans: PricingPlan[] = [
  {
    name: "Starter",
    price: "Rs. 999",
    cadence: "/month",
    description: "For solo doctors and small clinics that need the core outpatient workflow.",
    value: "starter",
    badge: "Best to start",
    features: [
      "Patients, doctors, appointments, records, and billing",
      "Basic reminders and CRM follow-up",
      "1 branch and 3 staff users",
      "5 GB storage and 100 AI or WhatsApp credits"
    ]
  },
  {
    name: "Growth",
    price: "Rs. 1,499",
    cadence: "/month",
    description: "For multi-doctor clinics that want stronger coordination and reporting.",
    value: "growth",
    badge: "Most clinics choose this",
    featured: true,
    features: [
      "Everything in Starter",
      "Lab module and stronger CRM workflows",
      "1 branch and 10 staff users",
      "25 GB storage and 300 AI or WhatsApp credits"
    ]
  },
  {
    name: "Pro / Branch",
    price: "Rs. 2,499",
    cadence: "/month",
    description: "For larger clinics that need branch-aware operations and heavier workflows.",
    value: "enterprise",
    badge: "Advanced operations",
    features: [
      "Everything in Growth",
      "Pharmacy, inventory, and insurance",
      "Up to 3 branches and 25 staff users",
      "100 GB storage and 800 AI or WhatsApp credits"
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

type MeResponse = {
  success: boolean;
  data: {
    id: string;
  };
};

export default function Home() {
  const router = useRouter();
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
    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then(() => {
        router.replace("/dashboard");
      })
      .catch(() => undefined);
  }, [router]);

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

  const pickPlan = (planTier: "starter" | "growth" | "enterprise") => {
    setTrialForm((current) => ({ ...current, requestedPlanTier: planTier }));
    setActivationMode("trial");
    setActivationError("");
    setActivationSuccess("");
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f5fbf8_0%,#ffffff_42%,#eef6f2_100%)] text-slate-900">
      <section className="relative isolate">
        <div className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.14),transparent_30%)]" />
        <div className="mx-auto w-full max-w-7xl px-6 pb-16 pt-6 lg:px-10">
          <header className="animate-fade-in flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <BrandLogo size={48} className="rounded-2xl shadow-[0_14px_40px_rgba(16,185,129,0.18)]" priority />
              <div>
                <p className="text-lg font-semibold tracking-[0.18em] text-emerald-700 uppercase">MedSyra</p>
                <p className="text-sm text-slate-600">Simple clinic software for doctors and staff</p>
              </div>
            </div>

            <nav className="hidden items-center gap-3 md:flex">
              <Link
                href="/auth/signin"
                className="rounded-full border border-emerald-200 bg-white/90 px-5 py-2 text-sm font-medium text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                Sign In
              </Link>
              <Link
                href="#contact-form"
                onClick={() => setActivationMode("demo")}
                className="rounded-full bg-slate-950 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Book Free Demo
              </Link>
            </nav>
          </header>

          <div className="grid items-center gap-12 py-12 lg:min-h-[calc(100vh-6rem)] lg:grid-cols-[1.02fr_0.98fr]">
            <div className="max-w-3xl">
              <div className="animate-fade-up mb-6 inline-flex items-center rounded-full border border-emerald-200 bg-white/85 px-4 py-2 text-sm text-emerald-800 shadow-sm backdrop-blur">
                Built for independent doctors, clinics, and small hospitals
              </div>
              <h1 className="animate-fade-up animation-delay-100 max-w-4xl text-5xl font-semibold leading-[1.03] tracking-[-0.04em] text-slate-950 md:text-6xl lg:text-7xl">
                One simple place for patients, appointments, billing, and records
              </h1>
              <p className="animate-fade-up animation-delay-200 mt-6 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
                MedSyra helps your clinic run without paper registers and scattered spreadsheets. Your team can book visits, keep records, send reminders, and track payments in one system.
              </p>

              <div className="animate-fade-up animation-delay-300 mt-10 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="#contact-form"
                  onClick={() => setActivationMode("demo")}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 py-4 text-base font-semibold text-white transition hover:bg-emerald-700"
                >
                  Book Free Demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="#contact-form"
                  onClick={() => setActivationMode("trial")}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-7 py-4 text-base font-semibold text-slate-800 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  Start Free Trial
                </Link>
              </div>

              <div className="animate-fade-up animation-delay-400 mt-8 flex flex-wrap gap-3 text-sm text-slate-600">
                {trustPoints.map((point) => (
                  <div key={point} className="hover-lift rounded-full border border-emerald-100 bg-white/85 px-4 py-2">
                    {point}
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-slide-in-right animation-delay-200 relative">
              <div className="animate-pulse-soft absolute -left-6 top-8 hidden h-24 w-24 rounded-full bg-emerald-200/50 blur-2xl lg:block" />
              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
                  <Image
                    src="/physician-meeting-with-patient-discuss-medical-test-results-cabinet.jpg"
                    alt="Doctor discussing patient test results"
                    width={900}
                    height={1100}
                    priority
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="grid gap-5">
                  <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
                    <Image
                      src="/pediatrician-doctor-nurse-sitting-desk-medical-office-talking-with-child-healthcare-practitioner-specialist-medicine-providing-professional-radiographic-treatment-hospital-clinic.jpg"
                      alt="Clinic staff speaking with a child and family"
                      width={900}
                      height={700}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-3">
                      <BrandLogo size={42} className="rounded-xl" />
                      <div>
                        <p className="text-sm font-medium text-slate-500">Clinic operations</p>
                        <p className="text-lg font-semibold text-slate-950">Everything stays connected</p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-600">
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3">Patients</div>
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3">Appointments</div>
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3">Billing</div>
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3">Reminders</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">What it does</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
            Built around the daily work of a clinic
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-600">
            The product is organized around the things staff actually do every day, not around technical menus.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {whatItDoes.map((item, index) => (
            <div
              key={item.title}
              className="animate-fade-up hover-lift rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
              style={{ animationDelay: `${index * 0.07 + 0.1}s` }}
            >
              <div className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-slate-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20 lg:px-10">
        <div className="rounded-[2rem] bg-slate-950 px-8 py-12 text-white md:px-12">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">How it works</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-4xl">
            A simple flow your staff can remember
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            {simpleSteps.map((step, index) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-5">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-semibold text-slate-950">
                  {index + 1}
                </div>
                <p className="text-sm font-medium">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
            <Image
              src="/physician-meeting-with-patient-discuss-medical-test-results-cabinet.jpg"
              alt="Clinic consultation scene"
              width={1200}
              height={800}
              className="h-72 w-full object-cover"
            />
            <div className="p-6">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">For doctors</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">See the patient story in one place</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Open the latest visit, review notes, and continue care without searching through registers or paper files.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
            <Image
              src="/pediatrician-doctor-nurse-sitting-desk-medical-office-talking-with-child-healthcare-practitioner-specialist-medicine-providing-professional-radiographic-treatment-hospital-clinic.jpg"
              alt="Reception and care team at a clinic"
              width={1200}
              height={800}
              className="h-72 w-full object-cover"
            />
            <div className="p-6">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">For staff</p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Handle bookings, reminders, and payments faster</p>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Reception and billing staff can work from one screen instead of switching between separate tools.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">More tools</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
            CRM, Lab, Pharmacy, Inventory, and Insurance are included too
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-600">
            These modules stay simple for the user, but they still connect back to the same patient and appointment data.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          {moreTools.map((tool, index) => (
            <div
              key={tool.title}
              className="animate-fade-up overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
              style={{ animationDelay: `${index * 0.06 + 0.1}s` }}
            >
              <div className="relative h-40 overflow-hidden">
                <Image src={tool.image} alt={tool.title} fill className="object-cover" />
              </div>
              <div className="p-6">
                <div className="inline-flex rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <tool.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{tool.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{tool.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-10">
        <div className="animate-fade-up mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Pricing</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-5xl">
            Clear plans for clinics at different stages
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-600">
            The core workflow stays simple. Scale, storage, credits, and advanced operations increase as the clinic grows.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {pricingPlans.map((plan, index) => (
            <div
              key={plan.name}
              className={`animate-fade-up flex h-full flex-col rounded-[2rem] border p-8 shadow-[0_20px_60px_rgba(15,23,42,0.05)] ${
                plan.featured
                  ? "border-emerald-300 bg-[linear-gradient(180deg,#f4fff9_0%,#ffffff_100%)]"
                  : "border-slate-200 bg-white"
              }`}
              style={{ animationDelay: `${index * 0.08 + 0.1}s` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-slate-950">{plan.name}</p>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{plan.description}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                    plan.featured ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {plan.badge}
                </span>
              </div>

              <div className="mt-8 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-[-0.05em] text-slate-950 md:text-5xl">{plan.price}</span>
                <span className="pb-1 text-sm text-slate-500">{plan.cadence}</span>
              </div>

              <div className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-1 items-end">
                <Link
                  href="#contact-form"
                  onClick={() => pickPlan(plan.value)}
                  className={`inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition ${
                    plan.featured
                      ? "bg-slate-950 text-white hover:bg-emerald-700"
                      : "border border-slate-300 bg-white text-slate-900 hover:border-emerald-300 hover:text-emerald-700"
                  }`}
                >
                  Start {plan.name}
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-[1.75rem] border border-emerald-100 bg-emerald-50/70 px-6 py-5 text-sm leading-7 text-slate-700">
          Extra AI, WhatsApp, storage, branches, and onboarding can be added separately so you only pay for the scale you actually use.
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-10">
        <div className="rounded-[2rem] border border-emerald-100 bg-[linear-gradient(135deg,#f2fff8_0%,#ffffff_46%,#ecfeff_100%)] px-8 py-12 md:px-12">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Get started</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
                Keep the clinic simple for everyone on the team
              </h2>
              <p className="mt-4 text-base leading-8 text-slate-600">
                Book a free demo if you want us to walk you through the product. Start a free trial if you want to explore it yourself.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="#contact-form"
                onClick={() => setActivationMode("demo")}
                className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Book a Free Demo
              </Link>
              <Link
                href="#contact-form"
                onClick={() => setActivationMode("trial")}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-emerald-300 hover:text-emerald-700"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="contact-form" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-28 lg:px-10">
        <div className="animate-fade-up grid gap-8 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)] lg:grid-cols-[0.9fr_1.1fr] md:p-10">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-700">Start here</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">
              {activationMode === "demo"
                ? "Tell us a little about your clinic and we will schedule a demo"
                : "Create your clinic trial account"}
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              {activationMode === "demo"
                ? "Choose a preferred date and time, and we will follow up with confirmation."
                : "Use the trial if you want to try the product directly with your team."}
            </p>
            <div className="mt-8 space-y-3 text-sm text-slate-600">
              <p>Best for doctors, receptionists, billing staff, and clinic owners.</p>
              <p>{activationMode === "demo" ? "A demo is useful if you want someone to show the workflow first." : "A trial is useful if you want to explore it on your own."}</p>
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
                  <label className="mb-2 block text-sm text-slate-700">What would you like to see?</label>
                  <textarea
                    rows={4}
                    value={demoForm.message}
                    onChange={(e) => setDemoForm((current) => ({ ...current, message: e.target.value }))}
                    className="theme-input w-full rounded-xl px-4 py-3"
                    placeholder="Appointments, billing, records, reminders, or reporting."
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
                      <option value="enterprise">Pro / Branch</option>
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
                    placeholder="Tell us about your clinic size or onboarding help."
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
