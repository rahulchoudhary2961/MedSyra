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
  CheckCircle2
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { AuthUser } from "@/types/api";

type MeResponse = {
  success: boolean;
  data: AuthUser;
};

type SettingsTab = "profile" | "notifications" | "security" | "clinic";

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
        <div className="bg-white rounded-xl p-4 border border-gray-200 h-fit">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("profile")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === "profile" ? "bg-cyan-50 text-cyan-700" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <User className="w-5 h-5" />
              <span>Profile</span>
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === "notifications"
                  ? "bg-cyan-50 text-cyan-700"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <Bell className="w-5 h-5" />
              <span>Notifications</span>
            </button>
            <button
              onClick={() => setActiveTab("clinic")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === "clinic" ? "bg-cyan-50 text-cyan-700" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <Building2 className="w-5 h-5" />
              <span>Clinic</span>
            </button>
            <button
              onClick={() => setActiveTab("security")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${
                activeTab === "security" ? "bg-cyan-50 text-cyan-700" : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <Shield className="w-5 h-5" />
              <span>Security</span>
            </button>
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
                    <div className="w-20 h-20 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white text-2xl">
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
                  className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
            </div>
          )}

          {activeTab === "clinic" && (
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-gray-900 mb-6">Clinic Preferences</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-700 mb-2">Clinic Name</label>
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
                  <label className="block text-sm text-gray-700 mb-2">Clinic Phone</label>
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
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
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
                  className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
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
        </div>
      </div>
    </div>
  );
}
