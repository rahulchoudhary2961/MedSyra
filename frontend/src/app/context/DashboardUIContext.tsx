"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useContext, useState } from "react";

type DashboardUIContextValue = {
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  isSidebarExpanded: boolean;
  setIsSidebarExpanded: Dispatch<SetStateAction<boolean>>;
  showSearchResults: boolean;
  setShowSearchResults: Dispatch<SetStateAction<boolean>>;
  notificationsOpen: boolean;
  setNotificationsOpen: Dispatch<SetStateAction<boolean>>;
  showTour: boolean;
  setShowTour: Dispatch<SetStateAction<boolean>>;
  tourStepIndex: number;
  setTourStepIndex: Dispatch<SetStateAction<number>>;
};

const DashboardUIContext = createContext<DashboardUIContextValue | null>(null);

export function DashboardUIProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);

  return (
    <DashboardUIContext.Provider
      value={{
        sidebarOpen,
        setSidebarOpen,
        isSidebarExpanded,
        setIsSidebarExpanded,
        showSearchResults,
        setShowSearchResults,
        notificationsOpen,
        setNotificationsOpen,
        showTour,
        setShowTour,
        tourStepIndex,
        setTourStepIndex
      }}
    >
      {children}
    </DashboardUIContext.Provider>
  );
}

export function useDashboardUI() {
  const context = useContext(DashboardUIContext);
  if (!context) {
    throw new Error("useDashboardUI must be used within DashboardUIProvider");
  }

  return context;
}
