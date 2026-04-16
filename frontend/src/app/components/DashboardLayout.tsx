"use client";

import { usePathname } from "next/navigation";
import { useCallback } from "react";
import {
  canAccessAssistant,
  canAccessBilling,
  canAccessBranches,
  canAccessCrm,
  canAccessInventory,
  canAccessInsurance,
  canAccessLab,
  canAccessPharmacy,
  canAccessMedicalRecords,
  canAccessPatients,
  canAccessReports,
  canAccessSettings,
  canManageAppointments,
  canManageDoctors
} from "@/lib/roles";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import DashboardTourGate from "./DashboardTourGate";
import DoctorAppointmentCount from "./DoctorAppointmentCount";
import { dashboardNavigation } from "./dashboard-navigation";
import { useAuth } from "@/app/context/AuthContext";
import { useDashboardUI } from "@/app/context/DashboardUIContext";

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { currentUser, isLoading: isCheckingAuth, signOut } = useAuth();
  const { isSidebarExpanded } = useDashboardUI();

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(path);
  };

  const handleLogout = async () => {
    await signOut();
  };

  const visibleNavigation = dashboardNavigation.filter((item) => {
    if (currentUser?.role === "doctor") {
      return [
        "/dashboard/assistant",
        "/dashboard/patients",
        "/dashboard/appointments",
        "/dashboard/medical-records",
        "/dashboard/crm",
        "/dashboard/lab",
        "/dashboard/pharmacy"
      ].includes(item.path);
    }

    if (item.path === "/dashboard/appointments") {
      return canManageAppointments(currentUser?.role);
    }

    if (item.path === "/dashboard/billings") {
      return canAccessBilling(currentUser?.role);
    }

    if (item.path === "/dashboard/reports") {
      return canAccessReports(currentUser?.role);
    }

    if (item.path === "/dashboard/doctors") {
      return canManageDoctors(currentUser?.role);
    }

    if (item.path === "/dashboard/settings") {
      return canAccessSettings(currentUser?.role);
    }

    if (item.path === "/dashboard/branches") {
      return canAccessBranches(currentUser?.role);
    }

    if (item.path === "/dashboard/medical-records") {
      return canAccessMedicalRecords(currentUser?.role);
    }

    if (item.path === "/dashboard/crm") {
      return canAccessCrm(currentUser?.role);
    }

    if (item.path === "/dashboard/lab") {
      return canAccessLab(currentUser?.role);
    }

    if (item.path === "/dashboard/pharmacy") {
      return canAccessPharmacy(currentUser?.role);
    }

    if (item.path === "/dashboard/inventory") {
      return canAccessInventory(currentUser?.role);
    }

    if (item.path === "/dashboard/insurance") {
      return canAccessInsurance(currentUser?.role);
    }

    if (item.path === "/dashboard/patients") {
      return canAccessPatients(currentUser?.role);
    }

    if (item.path === "/dashboard/assistant") {
      return canAccessAssistant(currentUser?.role);
    }

    return true;
  });

  if (isCheckingAuth) {
    return (
      <div className="theme-app-bg min-h-screen flex items-center justify-center px-6 theme-copy">
        Checking session...
      </div>
    );
  }

  return (
    <div className="theme-app-bg min-h-screen">
      <DashboardTourGate />
      <DoctorAppointmentCount>
        {(count) => (
          <DashboardSidebar
            navigation={visibleNavigation}
            isActive={isActive}
            upcomingAppointmentsCount={count}
            currentUser={currentUser}
            onLogout={() => {
              void handleLogout();
            }}
          />
        )}
      </DoctorAppointmentCount>

      <div className={`transition-[margin-left] duration-150 ease-out ${isSidebarExpanded ? "lg:ml-72" : "lg:ml-16"}`}>
        <DashboardHeader />

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

