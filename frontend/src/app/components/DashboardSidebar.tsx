"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { useEffect, useRef } from "react";
import { useDashboardUI } from "@/app/context/DashboardUIContext";
import BrandLogo from "./BrandLogo";

type NavigationItem = {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

type DashboardSidebarProps = {
  navigation: NavigationItem[];
  isActive: (path: string) => boolean;
  upcomingAppointmentsCount: number;
  currentUser: {
    full_name?: string | null;
    role?: string | null;
  } | null;
  onLogout: () => void;
};

export default function DashboardSidebar({
  navigation,
  isActive,
  upcomingAppointmentsCount,
  currentUser,
  onLogout
}: DashboardSidebarProps) {
  const { sidebarOpen, setSidebarOpen, isSidebarExpanded, setIsSidebarExpanded } = useDashboardUI();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarCloseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (window.innerWidth >= 1024 && sidebarRef.current && !sidebarRef.current.contains(target)) {
        if (sidebarCloseTimeoutRef.current !== null) {
          window.clearTimeout(sidebarCloseTimeoutRef.current);
          sidebarCloseTimeoutRef.current = null;
        }
        setIsSidebarExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (sidebarCloseTimeoutRef.current !== null) {
        window.clearTimeout(sidebarCloseTimeoutRef.current);
        sidebarCloseTimeoutRef.current = null;
      }
    };
  }, [setIsSidebarExpanded]);

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        ref={sidebarRef}
        data-tour-id="tour-sidebar"
        onMouseEnter={() => {
          if (sidebarCloseTimeoutRef.current !== null) {
            window.clearTimeout(sidebarCloseTimeoutRef.current);
            sidebarCloseTimeoutRef.current = null;
          }
          setIsSidebarExpanded(true);
        }}
        onMouseLeave={() => {
          if (window.innerWidth < 1024) {
            return;
          }

          if (sidebarCloseTimeoutRef.current !== null) {
            window.clearTimeout(sidebarCloseTimeoutRef.current);
          }

          sidebarCloseTimeoutRef.current = window.setTimeout(() => {
            setIsSidebarExpanded(false);
            sidebarCloseTimeoutRef.current = null;
          }, 70);
        }}
        className={`theme-sidebar fixed top-0 left-0 h-full w-[85vw] max-w-72 z-50 overflow-hidden transition-[transform,width] duration-[220ms] ease-out sm:w-72 lg:translate-x-0 lg:max-w-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${isSidebarExpanded ? "lg:w-72" : "lg:w-16"}`}
      >
        <div className="flex flex-col h-full">
          <div className={`h-16 flex items-center border-b border-slate-800 ${isSidebarExpanded ? "px-6" : "justify-center px-3 lg:px-0"}`}>
            <div className={`flex items-center gap-2 ${!isSidebarExpanded ? "lg:justify-center" : ""}`}>
              <BrandLogo size={34} className="rounded-xl shadow-[0_0_24px_rgba(16,185,129,0.28)]" priority />
              <span className={`font-semibold text-white transition-all duration-300 ${isSidebarExpanded ? "opacity-100 max-w-40" : "opacity-0 max-w-0 overflow-hidden lg:max-w-0"}`}>
                medsyra
              </span>
            </div>
          </div>

          <nav className={`flex-1 px-3 py-4 overflow-y-auto transition-opacity duration-[220ms] ease-out ${isSidebarExpanded ? "opacity-100" : "no-scrollbar opacity-100"}`}>
            <ul className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <li key={item.path}>
                    <Link
                      href={item.path}
                      prefetch={false}
                      className={`theme-nav-link flex items-center gap-3 rounded-lg px-3 py-3 ${
                        active ? "bg-emerald-500/14 text-emerald-300" : "text-slate-300 hover:bg-white/6 hover:text-white"
                      } ${isSidebarExpanded ? "lg:justify-start" : "lg:justify-center lg:px-2"}`}
                      onClick={() => {
                        setSidebarOpen(false);
                        setIsSidebarExpanded(false);
                      }}
                    >
                      <Icon className="h-7 w-7 shrink-0" />
                      <span className={`transition-all duration-[220ms] ease-out ${isSidebarExpanded ? "opacity-100 max-w-40" : "opacity-0 max-w-0 overflow-hidden lg:translate-x-[-8px]"}`}>
                        {item.name}
                      </span>
                      {item.path === "/dashboard/appointments" && currentUser?.role === "doctor" && upcomingAppointmentsCount > 0 && (
                        <span className={`ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white transition-all duration-[220ms] ease-out ${isSidebarExpanded ? "opacity-100 max-w-12" : "opacity-0 max-w-0 overflow-hidden"}`}>
                          {upcomingAppointmentsCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {isSidebarExpanded && (
            <div className="p-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center text-white">
                  {(currentUser?.full_name || "U")
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{currentUser?.full_name || "User"}</p>
                  <p className="text-xs text-slate-400 truncate">{currentUser?.role || "Staff"}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSidebarOpen(false);
                  setIsSidebarExpanded(false);
                  onLogout();
                }}
                className="theme-action-button w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-white/4 px-3 py-2 text-sm text-slate-200 hover:bg-white/8 hover:text-white"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
