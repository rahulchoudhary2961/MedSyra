"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import DashboardHeaderSearch from "./DashboardHeaderSearch";
import DashboardNotifications from "./DashboardNotifications";
import DashboardBranchSelector from "./DashboardBranchSelector";
import { useDashboardUI } from "@/app/context/DashboardUIContext";
import { useAuth } from "@/app/context/AuthContext";

export default function DashboardHeader() {
  const pathname = usePathname();
  const { setSidebarOpen } = useDashboardUI();
  const { currentUser } = useAuth();

  return (
    <header className="theme-topbar h-16 sticky top-0 z-30">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="theme-action-button lg:hidden rounded-lg p-2 hover:bg-white/80"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {pathname === "/dashboard" && (
            <DashboardHeaderSearch />
          )}
        </div>

        <div className="relative flex items-center gap-3">
          <DashboardBranchSelector />
          <DashboardNotifications />
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center text-white text-sm">
            {(currentUser?.full_name || "U").slice(0, 1).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
