"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Shield,
  User,
  Save,
  RotateCcw,
  LogOut,
  Trash2,
  CheckCircle2,
  Users
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { canAccessSettings, isFullAccessRole } from "@/lib/roles";
import { AuthUser } from "@/types/api";

type MeResponse = {
  success: boolean;
  data: AuthUser;
};

type SettingsTab = "profile" | "notifications" | "security" | "clinic" | "staff";

type NotificationSettings = {
  emailAppointments: boolean;
  emailBilling: boolean;
  browserAlerts: boolean;
  dailyDigest: boolean;
};

type ClinicSettings = {
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  emergencyLine: string;
  timezone: string;
  currency: string;
};

type StaffUser = AuthUser & {
  email_verified_at?: string | null;
  created_at?: string;
};

type StaffUsersResponse = {
  success: boolean;
  data: {
    items: StaffUser[];
  };
};

type CreateStaffResponse = {
  success: boolean;
  message: string;
  data: StaffUser;
};

type StaffSetupResponse = {
  success: boolean;
  message: string;
  data: StaffUser;
};

type StaffNotificationPreferencesResponse = {
  success: boolean;
  message: string;
  data: StaffUser;
};

type StaffForm = {
  fullName: string;
  phone: string;
  email: string;
  role: "admin" | "receptionist" | "nurse" | "billing" | "management";
  smsDailySchedule: boolean;
  emailDailySchedule: boolean;
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailAppointments: true,
  emailBilling: true,
  browserAlerts: true,
  dailyDigest: false
};

const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  clinicName: "City General Hospital",
  clinicAddress: "",
  clinicPhone: "",
  emergencyLine: "",
  timezone: "Asia/Kolkata",
  currency: "INR"
};

const DEFAULT_STAFF_FORM: StaffForm = {
  fullName: "",
  phone: "",
  email: "",
  role: "admin",
  smsDailySchedule: true,
  emailDailySchedule: true
};

const STAFF_ACCESS_OPTIONS = [
  {
    value: "admin",
    label: "Administrator",
    description: "Complete access"
  },
  {
    value: "receptionist",
    label: "Receptionist",
    description: "Access to day-to-day front office workflows"
  },
  {
    value: "nurse",
    label: "Front Desk",
    description: "No access to reports or settings"
  },
  {
    value: "billing",
    label: "Billing",
    description: "Billing and payment workflows"
  },
  {
    value: "management",
    label: "Management",
    description: "Administrative overview and controls"
  }
] as const;

const SETTINGS_KEYS = {
  notifications: "healthcare_settings_notifications",
  clinic: "healthcare_settings_clinic"
};

const readLocalSettings = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
};

const writeLocalSettings = <T,>(key: string, value: T) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
};

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() =>
    readLocalSettings(SETTINGS_KEYS.notifications, DEFAULT_NOTIFICATION_SETTINGS)
  );
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings>(() =>
    readLocalSettings(SETTINGS_KEYS.clinic, DEFAULT_CLINIC_SETTINGS)
  );
  const [successMessage, setSuccessMessage] = useState("");
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [staffForm, setStaffForm] = useState<StaffForm>(DEFAULT_STAFF_FORM);
  const [staffError, setStaffError] = useState("");
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [resendingStaffId, setResendingStaffId] = useState<string | null>(null);
  const [savingNotificationStaffId, setSavingNotificationStaffId] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<MeResponse>("/auth/me", { authenticated: true })
      .then((response) => {
        setCurrentUser(response.data);
      })
      .catch((error: Error) => {
        setProfileError(error.message || "Failed to load profile");
      })
      .finally(() => {
        setIsLoadingProfile(false);
      });
  }, []);

  useEffect(() => {
    if (!currentUser || !isFullAccessRole(currentUser.role)) {
      return;
    }

    setIsLoadingStaff(true);
    apiRequest<StaffUsersResponse>("/auth/users", { authenticated: true })
      .then((response) => {
        setStaffUsers(response.data.items || []);
      })
      .catch((error: Error) => {
        setStaffError(error.message || "Failed to load staff");
      })
      .finally(() => {
        setIsLoadingStaff(false);
      });
  }, [currentUser]);

  const userInitials = useMemo(() => {
    const name = currentUser?.full_name || "User";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [currentUser]);

  const showSaved = (message: string) => {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(""), 2000);
  };

  const saveNotifications = () => {
    writeLocalSettings(SETTINGS_KEYS.notifications, notificationSettings);
    showSaved("Notification settings saved");
  };

  const resetNotifications = () => {
    setNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
    writeLocalSettings(SETTINGS_KEYS.notifications, DEFAULT_NOTIFICATION_SETTINGS);
    showSaved("Notification settings reset");
  };

  const saveClinic = () => {
    writeLocalSettings(SETTINGS_KEYS.clinic, clinicSettings);
    showSaved("Clinic settings saved");
  };

  const resetClinic = () => {
    setClinicSettings(DEFAULT_CLINIC_SETTINGS);
    writeLocalSettings(SETTINGS_KEYS.clinic, DEFAULT_CLINIC_SETTINGS);
    showSaved("Clinic settings reset");
  };

  const clearLocalSettings = () => {
    localStorage.removeItem(SETTINGS_KEYS.notifications);
    localStorage.removeItem(SETTINGS_KEYS.clinic);
    setNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
    setClinicSettings(DEFAULT_CLINIC_SETTINGS);
    showSaved("Local settings cleared");
  };

  const handleLogout = () => {
    clearAuthToken();
    router.push("/auth/signin");
  };

  const handleCreateStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStaffError("");
    setIsCreatingStaff(true);

    try {
      const response = await apiRequest<CreateStaffResponse>("/auth/staff", {
        method: "POST",
        authenticated: true,
        body: {
          fullName: staffForm.fullName.trim(),
          phone: staffForm.phone.trim(),
          email: staffForm.email.trim(),
          role: staffForm.role,
          notifyDailyScheduleSms: staffForm.smsDailySchedule,
          notifyDailyScheduleEmail: staffForm.emailDailySchedule
        }
      });

      setStaffUsers((current) =>
        [response.data, ...current.filter((user) => user.id !== response.data.id)].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      setStaffForm(DEFAULT_STAFF_FORM);
      showSaved("Staff member added");
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : "Failed to add staff");
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const formatStaffRole = (role: string) => {
    if (role === "admin") return "Administrator";
    if (role === "receptionist") return "Receptionist";
    if (role === "nurse") return "Front Desk";
    if (role === "billing") return "Billing";
    if (role === "management") return "Management";
    return role;
  };

  const handleResendSetup = async (staffId: string) => {
    setStaffError("");
    setResendingStaffId(staffId);

    try {
      await apiRequest<StaffSetupResponse>(`/auth/staff/${staffId}/resend-setup`, {
        method: "POST",
        authenticated: true,
        body: {}
      });
      showSaved("Setup email sent");
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : "Failed to resend setup email");
    } finally {
      setResendingStaffId(null);
    }
  };

  const handleStaffPreferenceChange = (
    staffId: string,
    key: "notify_daily_schedule_sms" | "notify_daily_schedule_email",
    checked: boolean
  ) => {
    setStaffUsers((current) =>
      current.map((staff) => (staff.id === staffId ? { ...staff, [key]: checked } : staff))
    );
  };

  const handleSaveStaffNotifications = async (staff: StaffUser) => {
    setStaffError("");
    setSavingNotificationStaffId(staff.id);

    try {
      const response = await apiRequest<StaffNotificationPreferencesResponse>(`/auth/staff/${staff.id}/notifications`, {
        method: "PATCH",
        authenticated: true,
        body: {
          notifyDailyScheduleSms: staff.notify_daily_schedule_sms === true,
          notifyDailyScheduleEmail: staff.notify_daily_schedule_email === true
        }
      });
      setStaffUsers((current) => current.map((item) => (item.id === staff.id ? response.data : item)));
      showSaved("Staff notification preferences updated");
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : "Failed to update staff notification preferences");
    } finally {
      setSavingNotificationStaffId(null);
    }
  };

  if (!isLoadingProfile && currentUser && !canAccessSettings(currentUser.role)) {
    return <p className="text-red-600">You do not have access to settings.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your account and application preferences</p>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div data-tour-id="tour-settings-tabs" className="bg-white rounded-xl p-4 border border-gray-200 h-fit">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("profile")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === "profile" ? "bg-emerald-50 text-emerald-700" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <User className="w-5 h-5" />
              <span>Profile</span>
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === "notifications"
                  ? "bg-emerald-50 text-emerald-700"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <Bell className="w-5 h-5" />
              <span>Notifications</span>
            </button>
            <button
              onClick={() => setActiveTab("clinic")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === "clinic" ? "bg-emerald-50 text-emerald-700" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <Building2 className="w-5 h-5" />
              <span>Organization</span>
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === "security" ? "bg-emerald-50 text-emerald-700" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <Shield className="w-5 h-5" />
              <span>Security</span>
            </button>
            {isFullAccessRole(currentUser?.role) && (
              <button
                onClick={() => setActiveTab("staff")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                  activeTab === "staff" ? "bg-emerald-50 text-emerald-700" : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <Users className="w-5 h-5" />
                <span>Staff</span>
              </button>
            )}
          </nav>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {activeTab === "profile" && (
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-gray-900 mb-6">Profile Information</h3>

              {isLoadingProfile && <p className="text-sm text-gray-500">Loading profile...</p>}
              {profileError && <p className="text-sm text-red-600">{profileError}</p>}

              {!isLoadingProfile && currentUser && (
                <div className="space-y-4">
                  <div className="flex items-center gap-6 pb-6 border-b border-gray-200">
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center text-white text-2xl">
                      {userInitials}
                    </div>
                    <div>
                      <p className="text-gray-900">{currentUser.full_name}</p>
                      <p className="text-sm text-gray-500">{currentUser.role}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Full Name</label>
                      <input
                        type="text"
                        value={currentUser.full_name}
                        readOnly
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Role</label>
                      <input
                        type="text"
                        value={currentUser.role}
                        readOnly
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Email</label>
                      <input
                        type="email"
                        value={currentUser.email}
                        readOnly
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Phone</label>
                      <input
                        type="tel"
                        value={currentUser.phone}
                        readOnly
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    Profile updates API is not exposed yet. This section currently reflects live account data from
                    `/auth/me`.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-gray-900 mb-6">Notification Preferences</h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                  <span className="text-gray-700">Email for appointments</span>
                  <input
                    type="checkbox"
                    checked={notificationSettings.emailAppointments}
                    onChange={(e) =>
                      setNotificationSettings((prev) => ({ ...prev, emailAppointments: e.target.checked }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                  <span className="text-gray-700">Email for billing events</span>
                  <input
                    type="checkbox"
                    checked={notificationSettings.emailBilling}
                    onChange={(e) =>
                      setNotificationSettings((prev) => ({ ...prev, emailBilling: e.target.checked }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                  <span className="text-gray-700">Browser alerts</span>
                  <input
                    type="checkbox"
                    checked={notificationSettings.browserAlerts}
                    onChange={(e) =>
                      setNotificationSettings((prev) => ({ ...prev, browserAlerts: e.target.checked }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                  <span className="text-gray-700">Daily digest</span>
                  <input
                    type="checkbox"
                    checked={notificationSettings.dailyDigest}
                    onChange={(e) =>
                      setNotificationSettings((prev) => ({ ...prev, dailyDigest: e.target.checked }))
                    }
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button
                  onClick={resetNotifications}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
                <button
                  onClick={saveNotifications}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          )}

          {activeTab === "clinic" && (
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-gray-900 mb-6">Organization Preferences</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Doctor / Clinic / Hospital Name</label>
                  <input
                    type="text"
                    value={clinicSettings.clinicName}
                    onChange={(e) => setClinicSettings((prev) => ({ ...prev, clinicName: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Address</label>
                  <textarea
                    rows={3}
                    value={clinicSettings.clinicAddress}
                    onChange={(e) => setClinicSettings((prev) => ({ ...prev, clinicAddress: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Primary Phone</label>
                  <input
                    type="tel"
                    value={clinicSettings.clinicPhone}
                    onChange={(e) => setClinicSettings((prev) => ({ ...prev, clinicPhone: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Emergency Line</label>
                  <input
                    type="tel"
                    value={clinicSettings.emergencyLine}
                    onChange={(e) => setClinicSettings((prev) => ({ ...prev, emergencyLine: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Timezone</label>
                  <select
                    value={clinicSettings.timezone}
                    onChange={(e) => setClinicSettings((prev) => ({ ...prev, timezone: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="Europe/London">Europe/London</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Currency</label>
                  <select
                    value={clinicSettings.currency}
                    onChange={(e) => setClinicSettings((prev) => ({ ...prev, currency: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="INR">INR (Rs.)</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button
                  onClick={resetClinic}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
                <button
                  onClick={saveClinic}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-6">
              <div>
                <h3 className="text-gray-900">Session & Security</h3>
                <p className="text-sm text-gray-600 mt-1">Manage your current browser session and local data.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={clearLocalSettings}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Local Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}

          {activeTab === "staff" && isFullAccessRole(currentUser?.role) && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="mb-6">
                  <h3 className="text-gray-900">Add Staff</h3>
                  <p className="mt-1 text-sm text-gray-600">Create login access for staff in your organization.</p>
                </div>

                <form onSubmit={handleCreateStaff} className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm text-gray-700 mb-2">Name *</label>
                      <input
                        type="text"
                        value={staffForm.fullName}
                        onChange={(e) => setStaffForm((prev) => ({ ...prev, fullName: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                        placeholder="Nishant Kumar"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Mobile Number *</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={staffForm.phone}
                        onChange={(e) =>
                          setStaffForm((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                        placeholder="9887867898"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-700 mb-2">Email ID *</label>
                      <input
                        type="email"
                        value={staffForm.email}
                        onChange={(e) => setStaffForm((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                        placeholder="nishant@gmail.com"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-gray-900 mb-3">Access</p>
                    <div className="space-y-3">
                      {STAFF_ACCESS_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="staff-role"
                            value={option.value}
                            checked={staffForm.role === option.value}
                            onChange={(e) =>
                              setStaffForm((prev) => ({
                                ...prev,
                                role: e.target.value as StaffForm["role"]
                              }))
                            }
                            className="mt-1"
                          />
                          <span className="text-sm text-gray-700">
                            {option.label} <span className="text-gray-500">({option.description})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm text-gray-900 mb-3">Notifications</p>
                    <div className="overflow-hidden rounded-xl border border-gray-200">
                      <div className="grid grid-cols-[1.5fr_0.5fr_0.5fr] bg-gray-50 px-4 py-3 text-xs uppercase tracking-[0.14em] text-gray-500">
                        <span>Type</span>
                        <span>SMS</span>
                        <span>Email</span>
                      </div>
                      <div className="grid grid-cols-[1.5fr_0.5fr_0.5fr] items-center px-4 py-4 text-sm text-gray-700">
                        <span>Daily Schedule</span>
                        <input
                          type="checkbox"
                          checked={staffForm.smsDailySchedule}
                          onChange={(e) =>
                            setStaffForm((prev) => ({ ...prev, smsDailySchedule: e.target.checked }))
                          }
                        />
                        <input
                          type="checkbox"
                          checked={staffForm.emailDailySchedule}
                          onChange={(e) =>
                            setStaffForm((prev) => ({ ...prev, emailDailySchedule: e.target.checked }))
                          }
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Staff setup email is sent immediately. Daily schedule delivery now uses these saved preferences.
                    </p>
                  </div>

                  {staffError && <p className="text-sm text-red-600">{staffError}</p>}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isCreatingStaff}
                      className="rounded-lg bg-emerald-600 px-5 py-2.5 text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isCreatingStaff ? "Adding..." : "Add Staff"}
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="mb-4">
                  <h3 className="text-gray-900">Staff Directory</h3>
                  <p className="mt-1 text-sm text-gray-600">Current accounts in this organization.</p>
                </div>

                {isLoadingStaff && <p className="text-sm text-gray-500">Loading staff...</p>}
                {!isLoadingStaff && staffUsers.length === 0 && <p className="text-sm text-gray-500">No staff accounts yet.</p>}

                {!isLoadingStaff && staffUsers.length > 0 && (
                  <div className="space-y-3">
                    {staffUsers.map((staff) => (
                      <div key={staff.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm text-gray-900">{staff.full_name}</p>
                          <p className="mt-1 text-xs text-gray-500">{staff.email} • {staff.phone}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Daily schedule: {staff.notify_daily_schedule_sms ? "SMS on" : "SMS off"} /{" "}
                            {staff.notify_daily_schedule_email ? "Email on" : "Email off"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                            {formatStaffRole(staff.role)}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs ${staff.email_verified_at ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {staff.email_verified_at ? "Ready" : "Pending setup"}
                          </span>
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={staff.notify_daily_schedule_sms === true}
                              onChange={(e) =>
                                handleStaffPreferenceChange(staff.id, "notify_daily_schedule_sms", e.target.checked)
                              }
                            />
                            SMS
                          </label>
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={staff.notify_daily_schedule_email === true}
                              onChange={(e) =>
                                handleStaffPreferenceChange(staff.id, "notify_daily_schedule_email", e.target.checked)
                              }
                            />
                            Email
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleSaveStaffNotifications(staff)}
                            disabled={savingNotificationStaffId === staff.id}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            {savingNotificationStaffId === staff.id ? "Saving..." : "Save Preferences"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleResendSetup(staff.id)}
                            disabled={resendingStaffId === staff.id}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            {resendingStaffId === staff.id ? "Sending..." : "Resend Setup"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

