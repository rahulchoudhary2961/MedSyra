"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Users,
  Calendar,
  UserRound,
  FileText,
  CreditCard,
  BarChart3,
  FlaskConical,
  Boxes,
  Pill,
  Settings,
  Search,
  Bell,
  Menu,
  LogOut
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { clearAuthToken, getAuthToken } from "@/lib/auth";
import { clearLoginIntroPending, shouldShowLoginIntro } from "@/lib/onboarding";
import {
  canAccessAssistant,
  canAccessBilling,
  canAccessCrm,
  canAccessInventory,
  canAccessLab,
  canAccessPharmacy,
  canAccessMedicalRecords,
  canAccessPatients,
  canAccessReports,
  canAccessSettings,
  canManageAppointments,
  canManageDoctors,
  isFullAccessRole,
  isReceptionRole
} from "@/lib/roles";
import { AuthUser } from "@/types/api";
import BrandLogo from "./BrandLogo";
import DashboardTour from "./DashboardTour";

const navigation = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "AI Assistant", path: "/dashboard/assistant", icon: Bot },
  { name: "Patients", path: "/dashboard/patients", icon: Users },
  { name: "Calendar", path: "/dashboard/appointments", icon: Calendar },
  { name: "Doctors", path: "/dashboard/doctors", icon: UserRound },
  { name: "Medical Records", path: "/dashboard/medical-records", icon: FileText },
  { name: "CRM", path: "/dashboard/crm", icon: Bell },
  { name: "Lab", path: "/dashboard/lab", icon: FlaskConical },
  { name: "Pharmacy", path: "/dashboard/pharmacy", icon: Pill },
  { name: "Inventory", path: "/dashboard/inventory", icon: Boxes },
  { name: "Billings", path: "/dashboard/billings", icon: CreditCard },
  { name: "Reports", path: "/dashboard/reports", icon: BarChart3 },
  { name: "Settings", path: "/dashboard/settings", icon: Settings }
];

type MeResponse = {
  success: boolean;
  data: AuthUser;
};

type DashboardSummaryResponse = {
  success: boolean;
  data: {
    recentActivity: Array<{
      id: string;
      title: string;
      entity_name: string | null;
      event_time: string;
    }>;
  };
};

type SearchPatientsResponse = {
  success: boolean;
  data: {
    items: Array<{
      id: string;
      full_name: string;
      phone: string;
    }>;
  };
};

type SearchDoctorsResponse = {
  success: boolean;
  data: {
    items: Array<{
      id: string;
      full_name: string;
      specialty: string;
    }>;
  };
};

type UpcomingAppointmentsResponse = {
  success: boolean;
  data: {
    items: Array<{
      id: string;
      status: string;
      appointment_date: string;
      appointment_time: string;
    }>;
  };
};

const pad = (value: number) => String(value).padStart(2, "0");

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const toMinutes = (value: string) => {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};

const countUpcomingAppointments = (items: UpcomingAppointmentsResponse["data"]["items"]) => {
  const now = new Date();
  const todayKey = toDateKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return items.filter((appointment) => {
    const status = (appointment.status || "").toLowerCase();
    if (["completed", "cancelled", "no-show"].includes(status)) {
      return false;
    }

    const appointmentDate = appointment.appointment_date.slice(0, 10);
    if (appointmentDate !== todayKey) {
      return false;
    }

    if (status === "checked-in") {
      return true;
    }

    return toMinutes(appointment.appointment_time) >= currentMinutes;
  }).length;
};

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [headerSearch, setHeaderSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ patients: SearchPatientsResponse["data"]["items"]; doctors: SearchDoctorsResponse["data"]["items"] }>({
    patients: [],
    doctors: []
  });
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [recentActivity, setRecentActivity] = useState<DashboardSummaryResponse["data"]["recentActivity"]>([]);
  const [upcomingAppointmentsCount, setUpcomingAppointmentsCount] = useState(0);
  const [showTour, setShowTour] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token = getAuthToken();

    if (!token) {
      router.replace("/auth/signin");
      return;
    }

    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then((response) => {
        setCurrentUser(response.data);
        if (shouldShowLoginIntro()) {
          setTourStepIndex(0);
          setShowTour(true);
        }
      })
      .catch(() => {
        clearAuthToken();
        router.replace("/auth/signin");
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });
  }, [router]);

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(path);
  };

  const handleLogout = () => {
    clearAuthToken();
    router.replace("/auth/signin");
  };

  const fetchUpcomingAppointmentsCount = useCallback(() => {
    if (currentUser?.role !== "doctor") {
      return;
    }

    const todayKey = toDateKey(new Date());
    apiRequest<UpcomingAppointmentsResponse>(`/appointments?date=${todayKey}&limit=100`, { authenticated: true })
      .then((response) => {
        setUpcomingAppointmentsCount(countUpcomingAppointments(response.data.items || []));
      })
      .catch(() => {
        setUpcomingAppointmentsCount(0);
      });
  }, [currentUser?.role]);

  useEffect(() => {
    const term = headerSearch.trim();

    if (term.length < 2) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);

      Promise.all([
        apiRequest<SearchPatientsResponse>(`/patients?limit=5&q=${encodeURIComponent(term)}`, { authenticated: true }).catch(() => ({
          success: true,
          data: { items: [] }
        })),
        isFullAccessRole(currentUser?.role) || isReceptionRole(currentUser?.role)
          ? apiRequest<SearchDoctorsResponse>(`/doctors?limit=5&q=${encodeURIComponent(term)}`, { authenticated: true }).catch(() => ({
              success: true,
              data: { items: [] }
            }))
          : Promise.resolve({ success: true, data: { items: [] } })
      ])
        .then(([patientsResponse, doctorsResponse]) => {
          setSearchResults({
            patients: patientsResponse.data.items || [],
            doctors: doctorsResponse.data.items || []
          });
        })
        .finally(() => setIsSearching(false));
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [headerSearch, currentUser?.role]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSearchResults(false);
      }

      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (currentUser?.role !== "doctor") {
      return undefined;
    }

    const refresh = () => {
      fetchUpcomingAppointmentsCount();
    };

    refresh();

    const intervalId = window.setInterval(refresh, 60 * 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUser?.role, fetchUpcomingAppointmentsCount]);

  const openNotifications = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);

    if (!nextOpen || recentActivity.length > 0) {
      return;
    }

    setNotificationsLoading(true);
    apiRequest<DashboardSummaryResponse>("/dashboard/summary", { authenticated: true })
      .then((response) => setRecentActivity(response.data.recentActivity || []))
      .catch(() => setRecentActivity([]))
      .finally(() => setNotificationsLoading(false));
  };

  const submitHeaderSearch = () => {
    const term = headerSearch.trim();
    if (!term) {
      return;
    }

    setShowSearchResults(false);
    router.push(`/dashboard/patients?q=${encodeURIComponent(term)}`);
  };

  const closeTour = useCallback(() => {
    clearLoginIntroPending();
    setShowTour(false);
    setTourStepIndex(0);
  }, []);

  const visibleNavigation = navigation.filter((item) => {
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
      <DashboardTour
        currentUser={currentUser}
        isOpen={showTour}
        stepIndex={tourStepIndex}
        onStepIndexChange={setTourStepIndex}
        onClose={closeTour}
      />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        data-tour-id="tour-sidebar"
        className={`theme-sidebar fixed top-0 left-0 h-full w-64 z-50 transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="h-16 flex items-center px-6 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <BrandLogo size={34} className="rounded-xl shadow-[0_0_24px_rgba(16,185,129,0.28)]" priority />
              <span className="font-semibold text-white">medsyra</span>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 overflow-y-auto">
            <ul className="space-y-1">
              {visibleNavigation.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <li key={item.path}>
                    <Link
                      href={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                        active ? "bg-emerald-500/14 text-emerald-300" : "text-slate-300 hover:bg-white/6 hover:text-white"
                      }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.name}</span>
                      {item.path === "/dashboard/appointments" && currentUser?.role === "doctor" && upcomingAppointmentsCount > 0 && (
                        <span className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-medium text-white">
                          {upcomingAppointmentsCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

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
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-white/4 text-sm text-slate-200 hover:bg-white/8 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="theme-topbar h-16 sticky top-0 z-30">
          <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <button
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="lg:hidden p-2 rounded-lg hover:bg-white/80"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div ref={searchRef} className="relative hidden sm:block flex-1 max-w-md">
                <div className="theme-surface flex items-center gap-2 rounded-lg px-4 py-2">
                  <Search className="w-4 h-4 theme-muted" />
                  <input
                    type="text"
                    value={headerSearch}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setHeaderSearch(nextValue);
                      setShowSearchResults(nextValue.trim().length >= 2);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitHeaderSearch();
                      }
                    }}
                    placeholder="Search patients, doctors..."
                    className="bg-transparent border-none outline-none flex-1 text-sm theme-heading"
                  />
                </div>

                {showSearchResults && (headerSearch.trim().length >= 2 || isSearching) && (
                  <div className="theme-surface-strong absolute left-0 right-0 top-full mt-2 rounded-xl overflow-hidden z-40">
                    {isSearching ? (
                      <div className="px-4 py-3 text-sm theme-muted">Searching...</div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        <div className="border-b border-slate-100 px-4 py-2 text-xs uppercase tracking-wide text-slate-400">Patients</div>
                        {searchResults.patients.length === 0 ? (
                          <div className="px-4 py-3 text-sm theme-muted">No patient matches</div>
                        ) : (
                          searchResults.patients.map((patient) => (
                            <button
                              key={patient.id}
                              type="button"
                              onClick={() => {
                                setShowSearchResults(false);
                                router.push(`/dashboard/patients/${patient.id}`);
                              }}
                              className="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-emerald-50/60"
                            >
                              <p className="text-sm theme-heading">{patient.full_name}</p>
                              <p className="text-xs theme-muted">{patient.phone}</p>
                            </button>
                          ))
                        )}

                        {(isFullAccessRole(currentUser?.role) || isReceptionRole(currentUser?.role)) && (
                          <>
                            <div className="border-b border-t border-slate-100 px-4 py-2 text-xs uppercase tracking-wide text-slate-400">Doctors</div>
                            {searchResults.doctors.length === 0 ? (
                              <div className="px-4 py-3 text-sm theme-muted">No doctor matches</div>
                            ) : (
                              searchResults.doctors.map((doctor) => (
                                <button
                                  key={doctor.id}
                                  type="button"
                                  onClick={() => {
                                    setShowSearchResults(false);
                                    router.push(`/dashboard/doctors?q=${encodeURIComponent(doctor.full_name)}`);
                                  }}
                                  className="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-emerald-50/60 last:border-b-0"
                                >
                                  <p className="text-sm theme-heading">{doctor.full_name}</p>
                                  <p className="text-xs theme-muted">{doctor.specialty}</p>
                                </button>
                              ))
                            )}
                          </>
                        )}

                        <button
                          type="button"
                          onClick={submitHeaderSearch}
                          className="block w-full px-4 py-3 text-left text-sm text-emerald-700 hover:bg-emerald-50"
                        >
                          Search all for &quot;{headerSearch.trim()}&quot;
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div ref={notificationsRef} className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={openNotifications}
                className="p-2 rounded-lg hover:bg-white/80 relative"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 theme-copy" />
                {recentActivity.length > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />}
              </button>
              {notificationsOpen && (
                <div className="theme-surface-strong absolute right-12 top-full mt-2 w-80 rounded-xl z-40 overflow-hidden">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm theme-heading">Notifications</p>
                    <p className="text-xs theme-muted">Recent activity from your organization</p>
                  </div>
                  {notificationsLoading ? (
                    <div className="px-4 py-4 text-sm theme-muted">Loading notifications...</div>
                  ) : recentActivity.length === 0 ? (
                    <div className="px-4 py-4 text-sm theme-muted">No recent activity yet.</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {recentActivity.map((item) => (
                        <div key={item.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
                          <p className="text-sm theme-heading">{item.title}</p>
                          {item.entity_name && <p className="mt-1 text-xs theme-copy">{item.entity_name}</p>}
                          <p className="mt-1 text-xs text-slate-400">{new Date(item.event_time).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center text-white text-sm">
                {(currentUser?.full_name || "U").slice(0, 1).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

