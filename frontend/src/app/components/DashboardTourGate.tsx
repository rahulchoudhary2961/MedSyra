"use client";

import { useCallback, useEffect } from "react";
import { clearLoginIntroPending, shouldShowLoginIntro } from "@/lib/onboarding";
import DashboardTour from "./DashboardTour";
import { useAuth } from "@/app/context/AuthContext";
import { useDashboardUI } from "@/app/context/DashboardUIContext";

export default function DashboardTourGate() {
  const { currentUser } = useAuth();
  const { showTour, setShowTour, tourStepIndex, setTourStepIndex } = useDashboardUI();

  useEffect(() => {
    if (currentUser && shouldShowLoginIntro()) {
      setTourStepIndex(0);
      setShowTour(true);
    }
  }, [currentUser, setShowTour, setTourStepIndex]);

  const closeTour = useCallback(() => {
    clearLoginIntroPending();
    setShowTour(false);
    setTourStepIndex(0);
  }, [setShowTour, setTourStepIndex]);

  return (
    <DashboardTour
      currentUser={currentUser}
      isOpen={showTour}
      stepIndex={tourStepIndex}
      onStepIndexChange={setTourStepIndex}
      onClose={closeTour}
    />
  );
}
