"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccessBilling, canManageAppointments, isFullAccessRole, isReceptionRole } from "@/lib/roles";
import { AuthUser } from "@/types/api";

type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

type TourStep = {
  id: string;
  path: string;
  selector: string;
  title: string;
  description: string;
  placement?: TourPlacement;
};

type TourRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type DashboardTourProps = {
  currentUser: AuthUser | null;
  isOpen: boolean;
  stepIndex: number;
  onStepIndexChange: (nextIndex: number) => void;
  onClose: () => void;
};

const TOUR_CARD_WIDTH = 360;
const TOUR_CARD_HEIGHT = 224;
const TOUR_GAP = 20;
const TOUR_MARGIN = 16;
const SPOTLIGHT_PADDING = 10;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const buildTourSteps = (role?: string | null): TourStep[] => {
  const steps: TourStep[] = [];

  steps.push(
    {
      id: "sidebar",
      path: "/dashboard",
      selector: '[data-tour-id="tour-sidebar"]',
      title: "Navigate from one place",
      description: "This sidebar is the main workflow. Use it to move between dashboard, patients, calendar, records, billing, reports, settings, and AI.",
      placement: "right"
    },
    {
      id: "dashboard-stats",
      path: "/dashboard",
      selector: '[data-tour-id="tour-dashboard-stats"]',
      title: "Start with the live summary",
      description: "These cards show today's appointments, revenue, pending payments, and no-shows so staff know what needs attention first.",
      placement: "bottom"
    },
    {
      id: "dashboard-insights",
      path: "/dashboard",
      selector: '[data-tour-id="tour-dashboard-insights"]',
      title: "See the important patterns",
      description: "Smart Insights surfaces patients who did not return, common issues, weekly revenue, and follow-ups due today.",
      placement: "bottom"
    },
    {
      id: "assistant-chat",
      path: "/dashboard/assistant",
      selector: '[data-tour-id="tour-assistant-chat"]',
      title: "Ask the AI Assistant directly",
      description: "Use MedSyra Copilot for quick operational questions like revenue, appointments, unpaid invoices, and patient summaries.",
      placement: "top"
    },
    {
      id: "patients-add",
      path: "/dashboard/patients",
      selector: '[data-tour-id="tour-patients-add"]',
      title: "Add and manage patients",
      description: "This is the fastest entry point for patient registration. The page also keeps search and patient actions in one clean place.",
      placement: "bottom"
    },
    {
      id: "appointments-calendar",
      path: "/dashboard/appointments",
      selector: '[data-tour-id="tour-appointments-calendar"]',
      title: "Run the appointment workflow here",
      description: "The calendar is your day-to-day schedule view. Staff can track time slots, completed visits, and daily workload from this screen.",
      placement: "bottom"
    }
  );

  if (canManageAppointments(role)) {
    steps.push({
      id: "appointments-add",
      path: "/dashboard/appointments",
      selector: '[data-tour-id="tour-appointments-add"]',
      title: "Book appointments and walk-ins",
      description: "Use this action to add a new appointment. This page also supports walk-ins, consultation completion, and reminder flow.",
      placement: "bottom"
    });
  }

  steps.push({
    id: "records-list",
    path: "/dashboard/medical-records",
    selector: '[data-tour-id="tour-records-list"]',
    title: "Medical records stay structured here",
    description: "Consultations, diagnoses, prescriptions, and documents are stored here so clinical history stays easy to review.",
    placement: "top"
  });

  if (isFullAccessRole(role) || isReceptionRole(role)) {
    steps.push({
      id: "doctors-add",
      path: "/dashboard/doctors",
      selector: '[data-tour-id="tour-doctors-add"]',
      title: "Manage doctor profiles",
      description: "This page is for doctor setup, scheduling preferences, and linking staff accounts to doctor profiles.",
      placement: "bottom"
    });
  }

  if (canAccessBilling(role)) {
    steps.push(
      {
        id: "billings-overview",
        path: "/dashboard/billings",
        selector: '[data-tour-id="tour-billings-overview"]',
        title: "Track billing and collections",
        description: "Billing shows revenue, pending invoices, and payment status so your team can follow money without leaving the workflow.",
        placement: "bottom"
      },
      {
        id: "reports-overview",
        path: "/dashboard/reports",
        selector: '[data-tour-id="tour-reports-overview"]',
        title: "Use reports for business visibility",
        description: "Reports combine operational cards, trends, doctor performance, invoices, and clinical workload so you can review the organization in one place.",
        placement: "bottom"
      }
    );
  }

  if (isFullAccessRole(role) || isReceptionRole(role)) {
    steps.push({
      id: "settings-tabs",
      path: "/dashboard/settings",
      selector: '[data-tour-id="tour-settings-tabs"]',
      title: "Settings are grouped clearly",
      description: "Profile, notifications, organization preferences, and security actions are managed from these settings tabs.",
      placement: "right"
    });
  }

  return steps;
};

const getCardStyle = (placement: TourPlacement, rect: TourRect | null): CSSProperties => {
  if (typeof window === "undefined" || !rect || placement === "center") {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: TOUR_CARD_WIDTH
    };
  }

  const maxLeft = Math.max(TOUR_MARGIN, window.innerWidth - TOUR_CARD_WIDTH - TOUR_MARGIN);
  const maxTop = Math.max(TOUR_MARGIN, window.innerHeight - TOUR_CARD_HEIGHT - TOUR_MARGIN);
  const rectRight = rect.left + rect.width;
  const rectBottom = rect.top + rect.height;
  const centeredLeft = clamp(rect.left + rect.width / 2 - TOUR_CARD_WIDTH / 2, TOUR_MARGIN, maxLeft);
  const centeredTop = clamp(rect.top + rect.height / 2 - TOUR_CARD_HEIGHT / 2, TOUR_MARGIN, maxTop);

  switch (placement) {
    case "top":
      return {
        top: clamp(rect.top - TOUR_CARD_HEIGHT - TOUR_GAP, TOUR_MARGIN, maxTop),
        left: centeredLeft,
        width: TOUR_CARD_WIDTH
      };
    case "left":
      return {
        top: centeredTop,
        left: clamp(rect.left - TOUR_CARD_WIDTH - TOUR_GAP, TOUR_MARGIN, maxLeft),
        width: TOUR_CARD_WIDTH
      };
    case "right":
      return {
        top: centeredTop,
        left: clamp(rectRight + TOUR_GAP, TOUR_MARGIN, maxLeft),
        width: TOUR_CARD_WIDTH
      };
    case "bottom":
    default:
      return {
        top: clamp(rectBottom + TOUR_GAP, TOUR_MARGIN, maxTop),
        left: centeredLeft,
        width: TOUR_CARD_WIDTH
      };
  }
};

export default function DashboardTour({
  currentUser,
  isOpen,
  stepIndex,
  onStepIndexChange,
  onClose
}: DashboardTourProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);

  const tourSteps = useMemo(() => buildTourSteps(currentUser?.role), [currentUser?.role]);
  const activeStep = isOpen ? tourSteps[stepIndex] || null : null;
  const visibleTargetRect = pathname === activeStep?.path ? targetRect : null;

  useEffect(() => {
    if (!isOpen || !activeStep || pathname !== activeStep.path) {
      return undefined;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let timeoutId = 0;
    let didScrollIntoView = false;
    let attempts = 0;

    const readTargetRect = () => {
      const element = document.querySelector(activeStep.selector) as HTMLElement | null;
      if (!element) {
        if (attempts < 90) {
          attempts += 1;
          animationFrameId = window.requestAnimationFrame(readTargetRect);
        }
        return;
      }

      const rect = element.getBoundingClientRect();

      if (!didScrollIntoView && (rect.top < 96 || rect.bottom > window.innerHeight - 96)) {
        didScrollIntoView = true;
        element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        timeoutId = window.setTimeout(() => {
          if (!cancelled) {
            readTargetRect();
          }
        }, 260);
        return;
      }

      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    };

    const updateTargetRect = () => {
      const element = document.querySelector(activeStep.selector) as HTMLElement | null;
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    };

    readTargetRect();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [activeStep, isOpen, pathname]);

  const closeTour = useCallback(() => {
    setTargetRect(null);
    onClose();
  }, [onClose]);

  const goToNextStep = useCallback(() => {
    if (!activeStep) {
      closeTour();
      return;
    }

    const nextIndex = stepIndex + 1;
    if (nextIndex >= tourSteps.length) {
      closeTour();
      return;
    }

    const nextStep = tourSteps[nextIndex];
    setTargetRect(null);
    onStepIndexChange(nextIndex);

    if (pathname !== nextStep.path) {
      router.push(nextStep.path);
    }
  }, [activeStep, closeTour, onStepIndexChange, pathname, router, stepIndex, tourSteps]);

  if (!currentUser || !isOpen || !activeStep) {
    return null;
  }

  const spotlightRect = visibleTargetRect
    ? {
        top: Math.max(8, visibleTargetRect.top - SPOTLIGHT_PADDING),
        left: Math.max(8, visibleTargetRect.left - SPOTLIGHT_PADDING),
        width: visibleTargetRect.width + SPOTLIGHT_PADDING * 2,
        height: visibleTargetRect.height + SPOTLIGHT_PADDING * 2
      }
    : null;

  const cardStyle = getCardStyle(pathname === activeStep.path ? activeStep.placement || "bottom" : "center", visibleTargetRect);
  const isLastStep = stepIndex >= tourSteps.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {spotlightRect ? (
        <div
          className="fixed rounded-[28px] border-2 border-emerald-400 bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.58)] transition-all duration-300"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/58" aria-hidden="true" />
      )}

      <div
        className="pointer-events-auto fixed rounded-[1.75rem] border border-emerald-100 bg-white p-6 shadow-[0_28px_80px_rgba(15,23,42,0.24)]"
        style={cardStyle}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Product Tour</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{activeStep.title}</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">{activeStep.description}</p>

        <div className="mt-6 flex items-center gap-2">
          {tourSteps.map((step, index) => (
            <span
              key={step.id}
              className={`h-2.5 rounded-full transition-all ${index === stepIndex ? "w-8 bg-emerald-600" : "w-2.5 bg-slate-300"}`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Step {stepIndex + 1} of {tourSteps.length}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeTour}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm text-slate-600 hover:bg-slate-50"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={goToNextStep}
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm text-white hover:bg-emerald-700"
            >
              {isLastStep ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
