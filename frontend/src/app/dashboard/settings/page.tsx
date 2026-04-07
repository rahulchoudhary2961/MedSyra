"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Shield,
  Search,
  Clock3,
  Megaphone,
  MessageSquareText,
  Plus,
  User,
  Save,
  Send,
  RotateCcw,
  LogOut,
  Trash2,
  CheckCircle2,
  Users
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { canAccessSettings, isFullAccessRole } from "@/lib/roles";
import {
  AuditLogEntry,
  AuthUser,
  Branch,
  NotificationCampaign,
  NotificationLog,
  NotificationPreferencesData,
  NotificationTemplate,
  SecurityOverviewData
} from "@/types/api";

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

type NotificationPreferencesResponse = {
  success: boolean;
  data: NotificationPreferencesData;
};

type NotificationLogsResponse = {
  success: boolean;
  data: {
    items: NotificationLog[];
  };
};

type NotificationTemplatesResponse = {
  success: boolean;
  data: {
    items: NotificationTemplate[];
  };
};

type NotificationCampaignsResponse = {
  success: boolean;
  data: {
    items: NotificationCampaign[];
  };
};

type SecurityOverviewResponse = {
  success: boolean;
  data: SecurityOverviewData;
};

type AuditLogsResponse = {
  success: boolean;
  data: {
    items: AuditLogEntry[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type StaffForm = {
  fullName: string;
  phone: string;
  email: string;
  role: "admin" | "receptionist" | "nurse" | "billing" | "management";
  branchId: string;
  smsDailySchedule: boolean;
  emailDailySchedule: boolean;
};

type TemplateForm = {
  name: string;
  notificationType: "appointment_reminder" | "follow_up_reminder" | "marketing_campaign";
  channel: "whatsapp" | "sms";
  conditionTag: string;
  body: string;
};

type CampaignForm = {
  name: string;
  audienceType: "all_active" | "dormant_30" | "dormant_60" | "follow_up_due" | "chronic";
  templateId: string;
  sendWhatsapp: boolean;
  sendSms: boolean;
  notes: string;
};

type BranchesResponse = {
  success: boolean;
  data: {
    items: Branch[];
  };
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
  branchId: "",
  smsDailySchedule: true,
  emailDailySchedule: true
};

const DEFAULT_TEMPLATE_FORM: TemplateForm = {
  name: "",
  notificationType: "marketing_campaign",
  channel: "whatsapp",
  conditionTag: "",
  body: ""
};

const DEFAULT_CAMPAIGN_FORM: CampaignForm = {
  name: "",
  audienceType: "all_active",
  templateId: "",
  sendWhatsapp: true,
  sendSms: false,
  notes: ""
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
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staffForm, setStaffForm] = useState<StaffForm>(DEFAULT_STAFF_FORM);
  const [staffError, setStaffError] = useState("");
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [resendingStaffId, setResendingStaffId] = useState<string | null>(null);
  const [savingNotificationStaffId, setSavingNotificationStaffId] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [notificationCenter, setNotificationCenter] = useState<NotificationPreferencesData | null>(null);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [notificationTemplates, setNotificationTemplates] = useState<NotificationTemplate[]>([]);
  const [notificationCampaigns, setNotificationCampaigns] = useState<NotificationCampaign[]>([]);
  const [notificationError, setNotificationError] = useState("");
  const [isLoadingNotificationCenter, setIsLoadingNotificationCenter] = useState(false);
  const [isSavingNotificationCenter, setIsSavingNotificationCenter] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(DEFAULT_TEMPLATE_FORM);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(DEFAULT_CAMPAIGN_FORM);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);
  const [securityOverview, setSecurityOverview] = useState<SecurityOverviewData | null>(null);
  const [securityLogs, setSecurityLogs] = useState<AuditLogEntry[]>([]);
  const [securityError, setSecurityError] = useState("");
  const [isLoadingSecurityOverview, setIsLoadingSecurityOverview] = useState(false);
  const [isLoadingSecurityLogs, setIsLoadingSecurityLogs] = useState(false);
  const [securityModuleFilter, setSecurityModuleFilter] = useState("all");
  const [securityOutcomeFilter, setSecurityOutcomeFilter] = useState("all");
  const [securityDestructiveOnly, setSecurityDestructiveOnly] = useState(false);

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
    if (!currentUser || !isFullAccessRole(currentUser.role) || activeTab !== "staff") {
      return;
    }

    setIsLoadingStaff(true);
    Promise.all([
      apiRequest<StaffUsersResponse>("/auth/users", { authenticated: true }),
      apiRequest<BranchesResponse>("/branches?activeOnly=true", { authenticated: true })
    ])
      .then(([staffResponse, branchesResponse]) => {
        const branchItems = branchesResponse.data.items || [];
        setStaffUsers(staffResponse.data.items || []);
        setBranches(branchItems);
        setStaffForm((current) => ({
          ...current,
          branchId: current.branchId || branchItems[0]?.id || ""
        }));
      })
      .catch((error: Error) => {
        setStaffError(error.message || "Failed to load staff");
      })
      .finally(() => {
        setIsLoadingStaff(false);
      });
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (!currentUser || !isFullAccessRole(currentUser.role) || activeTab !== "security") {
      return;
    }

    setIsLoadingSecurityOverview(true);
    setSecurityError("");

    apiRequest<SecurityOverviewResponse>("/security/overview?days=30", { authenticated: true })
      .then((response) => {
        setSecurityOverview(response.data);
      })
      .catch((error: Error) => {
        setSecurityError(error.message || "Failed to load security overview");
      })
      .finally(() => {
        setIsLoadingSecurityOverview(false);
      });
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (!currentUser || !isFullAccessRole(currentUser.role) || activeTab !== "security") {
      return;
    }

    const params = new URLSearchParams({ limit: "25" });
    if (securityModuleFilter !== "all") {
      params.set("module", securityModuleFilter);
    }
    if (securityOutcomeFilter !== "all") {
      params.set("outcome", securityOutcomeFilter);
    }
    if (securityDestructiveOnly) {
      params.set("isDestructive", "true");
    }

    setIsLoadingSecurityLogs(true);
    setSecurityError("");

    apiRequest<AuditLogsResponse>(`/security/audit-logs?${params.toString()}`, { authenticated: true })
      .then((response) => {
        setSecurityLogs(response.data.items || []);
      })
      .catch((error: Error) => {
        setSecurityError(error.message || "Failed to load audit logs");
      })
      .finally(() => {
        setIsLoadingSecurityLogs(false);
      });
  }, [activeTab, currentUser, securityModuleFilter, securityOutcomeFilter, securityDestructiveOnly]);

  useEffect(() => {
    if (!currentUser || !isFullAccessRole(currentUser.role) || activeTab !== "notifications") {
      return;
    }

    setIsLoadingNotificationCenter(true);
    setNotificationError("");

    Promise.all([
      apiRequest<NotificationPreferencesResponse>("/notifications/preferences", { authenticated: true }),
      apiRequest<NotificationLogsResponse>("/notifications/logs?limit=20", { authenticated: true }),
      apiRequest<NotificationTemplatesResponse>("/notifications/templates", { authenticated: true }),
      apiRequest<NotificationCampaignsResponse>("/notifications/campaigns?limit=20", { authenticated: true })
    ])
      .then(([preferencesResponse, logsResponse, templatesResponse, campaignsResponse]) => {
        const marketingTemplate = (templatesResponse.data.items || []).find(
          (item) => item.notification_type === "marketing_campaign"
        );
        setNotificationCenter(preferencesResponse.data);
        setNotificationLogs(logsResponse.data.items || []);
        setNotificationTemplates(templatesResponse.data.items || []);
        setNotificationCampaigns(campaignsResponse.data.items || []);
        setCampaignForm((current) => ({
          ...current,
          templateId: current.templateId || marketingTemplate?.id || ""
        }));
      })
      .catch((error: Error) => {
        setNotificationError(error.message || "Failed to load notification settings");
      })
      .finally(() => {
        setIsLoadingNotificationCenter(false);
      });
  }, [activeTab, currentUser]);

  const userInitials = useMemo(() => {
    const name = currentUser?.full_name || "User";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [currentUser]);
  const filteredStaffUsers = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) {
      return staffUsers;
    }

    return staffUsers.filter((staff) => {
      const haystack = `${staff.full_name} ${staff.email} ${staff.phone} ${staff.role}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [staffSearch, staffUsers]);
  const readyStaffCount = useMemo(
    () => staffUsers.filter((staff) => Boolean(staff.email_verified_at)).length,
    [staffUsers]
  );
  const doctorRoleCount = useMemo(
    () => staffUsers.filter((staff) => staff.role === "doctor").length,
    [staffUsers]
  );
  const auditModules = useMemo(() => {
    const modules = new Set<string>();
    (securityOverview?.moduleBreakdown || []).forEach((item) => modules.add(item.module));
    securityLogs.forEach((item) => modules.add(item.module));
    return Array.from(modules).sort((a, b) => a.localeCompare(b));
  }, [securityOverview, securityLogs]);

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
          branchId: staffForm.branchId,
          notifyDailyScheduleSms: staffForm.smsDailySchedule,
          notifyDailyScheduleEmail: staffForm.emailDailySchedule
        }
      });

      setStaffUsers((current) =>
        [response.data, ...current.filter((user) => user.id !== response.data.id)].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      setStaffForm({
        ...DEFAULT_STAFF_FORM,
        branchId: branches[0]?.id || ""
      });
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

  const formatAuditDate = (value?: string | null) => {
    if (!value) {
      return "Never";
    }

    return new Date(value).toLocaleString();
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

  const updateReminderPreference = <K extends keyof NotificationPreferencesData["preferences"]>(
    key: K,
    value: NotificationPreferencesData["preferences"][K]
  ) => {
    setNotificationCenter((current) =>
      current
        ? {
            ...current,
            preferences: {
              ...current.preferences,
              [key]: value
            }
          }
        : current
    );
  };

  const handleSaveNotificationCenter = async () => {
    if (!notificationCenter) {
      return;
    }

    setIsSavingNotificationCenter(true);
    setNotificationError("");

    try {
      const response = await apiRequest<NotificationPreferencesResponse>("/notifications/preferences", {
        method: "PATCH",
        authenticated: true,
        body: {
          appointmentWhatsappEnabled: notificationCenter.preferences.appointment_whatsapp_enabled,
          appointmentSmsEnabled: notificationCenter.preferences.appointment_sms_enabled,
          followUpWhatsappEnabled: notificationCenter.preferences.follow_up_whatsapp_enabled,
          followUpSmsEnabled: notificationCenter.preferences.follow_up_sms_enabled,
          staffScheduleEmailEnabled: notificationCenter.preferences.staff_schedule_email_enabled,
          staffScheduleSmsEnabled: notificationCenter.preferences.staff_schedule_sms_enabled,
          smartTimingEnabled: notificationCenter.preferences.smart_timing_enabled,
          appointmentLeadMinutes: notificationCenter.preferences.appointment_lead_minutes,
          followUpSendHour: notificationCenter.preferences.follow_up_send_hour,
          conditionBasedFollowUpEnabled: notificationCenter.preferences.condition_based_follow_up_enabled,
          campaignWhatsappEnabled: notificationCenter.preferences.campaign_whatsapp_enabled,
          campaignSmsEnabled: notificationCenter.preferences.campaign_sms_enabled
        }
      });

      setNotificationCenter(response.data);
      showSaved("Reminder settings saved");
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Failed to save reminder settings");
    } finally {
      setIsSavingNotificationCenter(false);
    }
  };

  const handleCreateTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingTemplate(true);
    setNotificationError("");

    try {
      const response = await apiRequest<{ success: boolean; data: NotificationTemplate }>("/notifications/templates", {
        method: "POST",
        authenticated: true,
        body: {
          name: templateForm.name,
          notificationType: templateForm.notificationType,
          channel: templateForm.channel,
          conditionTag: templateForm.conditionTag || undefined,
          body: templateForm.body
        }
      });

      setNotificationTemplates((current) =>
        [...current, response.data].sort((left, right) => left.name.localeCompare(right.name))
      );
      setTemplateForm(DEFAULT_TEMPLATE_FORM);
      setCampaignForm((current) => ({
        ...current,
        templateId:
          current.templateId ||
          (response.data.notification_type === "marketing_campaign" ? response.data.id : "")
      }));
      showSaved("Notification template added");
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Failed to create notification template");
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const handleCreateCampaign = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingCampaign(true);
    setNotificationError("");

    try {
      const selectedTemplate = notificationTemplates.find((item) => item.id === campaignForm.templateId);
      const response = await apiRequest<{ success: boolean; data: NotificationCampaign }>("/notifications/campaigns", {
        method: "POST",
        authenticated: true,
        body: {
          name: campaignForm.name,
          audienceType: campaignForm.audienceType,
          templateId: campaignForm.templateId,
          sendWhatsapp: campaignForm.sendWhatsapp,
          sendSms: campaignForm.sendSms,
          notes: campaignForm.notes || undefined
        }
      });

      setNotificationCampaigns((current) => [
        {
          ...response.data,
          template_name: selectedTemplate?.name || response.data.template_name || null,
          template_channel: selectedTemplate?.channel || response.data.template_channel || null
        },
        ...current
      ]);
      setCampaignForm((current) => ({
        ...DEFAULT_CAMPAIGN_FORM,
        templateId: current.templateId || response.data.template_id
      }));
      showSaved("Campaign created");
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Failed to create campaign");
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const handleSendCampaign = async (campaignId: string) => {
    setSendingCampaignId(campaignId);
    setNotificationError("");

    try {
      const response = await apiRequest<{ success: boolean; data: { campaign: NotificationCampaign } }>(
        `/notifications/campaigns/${campaignId}/send`,
        {
          method: "POST",
          authenticated: true,
          body: {}
        }
      );

      setNotificationCampaigns((current) =>
        current.map((item) => (item.id === campaignId ? response.data.campaign : item))
      );

      const logsResponse = await apiRequest<NotificationLogsResponse>("/notifications/logs?limit=20", {
        authenticated: true
      });
      setNotificationLogs(logsResponse.data.items || []);
      showSaved("Campaign processed");
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "Failed to send campaign");
    } finally {
      setSendingCampaignId(null);
    }
  };

  const formatNotificationTypeLabel = (value: string) => value.replace(/_/g, " ");
  const formatCampaignAudience = (value: CampaignForm["audienceType"] | NotificationCampaign["audience_type"]) => {
    if (value === "all_active") return "All active patients";
    if (value === "dormant_30") return "No visit in 30+ days";
    if (value === "dormant_60") return "No visit in 60+ days";
    if (value === "follow_up_due") return "Follow-ups due";
    return "Chronic patients";
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
                    This section shows your current account details.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="space-y-6">
                <div>
                  <h3 className="text-gray-900">Notification Preferences</h3>
                  <p className="mt-1 text-sm text-gray-600">Control reminder channels and review recent reminder activity.</p>
                </div>

                {notificationError && <p className="text-sm text-red-600">{notificationError}</p>}
                {isLoadingNotificationCenter && <p className="text-sm text-gray-500">Loading reminder settings...</p>}

                {notificationCenter && (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-500">WhatsApp</p>
                        <p className="mt-2 text-sm text-gray-900">
                          {notificationCenter.providers.whatsapp.enabled
                            ? notificationCenter.providers.whatsapp.configured
                              ? "Configured"
                              : "Not configured"
                            : "Disabled"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-500">SMS</p>
                        <p className="mt-2 text-sm text-gray-900">
                          {notificationCenter.providers.sms.enabled
                            ? notificationCenter.providers.sms.configured
                              ? "Configured"
                              : "Not configured"
                            : "Disabled"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Email</p>
                        <p className="mt-2 text-sm text-gray-900">
                          {notificationCenter.providers.email.configured ? "Configured" : "Not configured"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="grid grid-cols-[1.3fr_0.6fr_0.6fr] bg-gray-50 px-4 py-3 text-xs uppercase tracking-[0.14em] text-gray-500">
                        <span>Reminder Type</span>
                        <span>Primary</span>
                        <span>Secondary</span>
                      </div>
                      <div className="divide-y divide-gray-200">
                        <div className="grid grid-cols-[1.3fr_0.6fr_0.6fr] items-center px-4 py-4 text-sm text-gray-700">
                          <div>
                            <p className="text-gray-900">Appointment reminders</p>
                            <p className="mt-1 text-xs text-gray-500">Same-day reminder flow from the appointments calendar.</p>
                          </div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={notificationCenter.preferences.appointment_whatsapp_enabled}
                              onChange={(e) => updateReminderPreference("appointment_whatsapp_enabled", e.target.checked)}
                            />
                            <span>WhatsApp</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={notificationCenter.preferences.appointment_sms_enabled}
                              onChange={(e) => updateReminderPreference("appointment_sms_enabled", e.target.checked)}
                            />
                            <span>SMS</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-[1.3fr_0.6fr_0.6fr] items-center px-4 py-4 text-sm text-gray-700">
                          <div>
                            <p className="text-gray-900">Follow-up reminders</p>
                            <p className="mt-1 text-xs text-gray-500">Manual and scheduled follow-up reminders from medical records.</p>
                          </div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={notificationCenter.preferences.follow_up_whatsapp_enabled}
                              onChange={(e) => updateReminderPreference("follow_up_whatsapp_enabled", e.target.checked)}
                            />
                            <span>WhatsApp</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={notificationCenter.preferences.follow_up_sms_enabled}
                              onChange={(e) => updateReminderPreference("follow_up_sms_enabled", e.target.checked)}
                            />
                            <span>SMS</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-[1.3fr_0.6fr_0.6fr] items-center px-4 py-4 text-sm text-gray-700">
                          <div>
                            <p className="text-gray-900">Staff daily schedules</p>
                            <p className="mt-1 text-xs text-gray-500">Controls daily staff schedule delivery on top of individual staff preferences.</p>
                          </div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={notificationCenter.preferences.staff_schedule_email_enabled}
                              onChange={(e) => updateReminderPreference("staff_schedule_email_enabled", e.target.checked)}
                            />
                            <span>Email</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={notificationCenter.preferences.staff_schedule_sms_enabled}
                              onChange={(e) => updateReminderPreference("staff_schedule_sms_enabled", e.target.checked)}
                            />
                            <span>SMS</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-[1.3fr_0.6fr_0.6fr] items-center px-4 py-4 text-sm text-gray-700">
                          <div>
                            <p className="text-gray-900">Bulk campaigns</p>
                            <p className="mt-1 text-xs text-gray-500">Revenue-driven campaigns like free checkup camps and dormant-patient recalls.</p>
                          </div>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={notificationCenter.preferences.campaign_whatsapp_enabled}
                              onChange={(e) => updateReminderPreference("campaign_whatsapp_enabled", e.target.checked)}
                            />
                            <span>WhatsApp</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={notificationCenter.preferences.campaign_sms_enabled}
                              onChange={(e) => updateReminderPreference("campaign_sms_enabled", e.target.checked)}
                            />
                            <span>SMS</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                        <div className="flex items-start gap-3">
                          <Clock3 className="mt-0.5 h-5 w-5 text-emerald-600" />
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-gray-900">Smart Timing</h4>
                              <p className="mt-1 text-sm text-gray-600">
                                Keep reminders closer to the visit window instead of sending them randomly during the day.
                              </p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={notificationCenter.preferences.smart_timing_enabled}
                                onChange={(e) => updateReminderPreference("smart_timing_enabled", e.target.checked)}
                              />
                              <span>Enable smart timing guardrail</span>
                            </label>
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">
                                  Appointment lead
                                </label>
                                <input
                                  type="number"
                                  min={15}
                                  max={720}
                                  value={notificationCenter.preferences.appointment_lead_minutes}
                                  onChange={(e) =>
                                    updateReminderPreference(
                                      "appointment_lead_minutes",
                                      Number.parseInt(e.target.value, 10) || 120
                                    )
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                                <p className="mt-1 text-xs text-gray-500">Minutes before appointment when manual reminder becomes available.</p>
                              </div>
                              <div>
                                <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">
                                  Follow-up send hour
                                </label>
                                <input
                                  type="number"
                                  min={6}
                                  max={22}
                                  value={notificationCenter.preferences.follow_up_send_hour}
                                  onChange={(e) =>
                                    updateReminderPreference(
                                      "follow_up_send_hour",
                                      Number.parseInt(e.target.value, 10) || 9
                                    )
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                                <p className="mt-1 text-xs text-gray-500">Scheduled follow-up reminders wait until this hour.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                        <div className="flex items-start gap-3">
                          <MessageSquareText className="mt-0.5 h-5 w-5 text-emerald-600" />
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-gray-900">Condition-Based Follow-up</h4>
                              <p className="mt-1 text-sm text-gray-600">
                                Switch reminder copy automatically for diabetes, dental, hypertension, and other tracked conditions.
                              </p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={notificationCenter.preferences.condition_based_follow_up_enabled}
                                onChange={(e) =>
                                  updateReminderPreference("condition_based_follow_up_enabled", e.target.checked)
                                }
                              />
                              <span>Use diagnosis-aware follow-up templates</span>
                            </label>
                            <div className="rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm text-gray-600">
                              Templates tagged with a condition are chosen first. If nothing matches, the general follow-up template is used.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveNotificationCenter}
                        disabled={isSavingNotificationCenter}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Save className="w-4 h-4" />
                        {isSavingNotificationCenter ? "Saving..." : "Save Reminder Settings"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="border-b border-gray-200 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <MessageSquareText className="h-4 w-4 text-emerald-600" />
                            <h4 className="text-gray-900">Predefined Templates</h4>
                          </div>
                          <p className="mt-1 text-sm text-gray-500">
                            Manage WhatsApp/SMS copy for reminders and campaigns.
                          </p>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {notificationTemplates.length === 0 && (
                            <div className="px-4 py-4 text-sm text-gray-500">No templates available yet.</div>
                          )}
                          {notificationTemplates.map((template) => (
                            <div key={template.id} className="px-4 py-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm text-gray-900">{template.name}</p>
                                    {template.is_default && (
                                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-emerald-700">
                                        Default
                                      </span>
                                    )}
                                    {template.condition_tag && (
                                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-blue-700">
                                        {template.condition_tag}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {formatNotificationTypeLabel(template.notification_type)} | {template.channel.toUpperCase()}
                                  </p>
                                  <p className="mt-2 text-xs leading-6 text-gray-600">{template.body}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <form onSubmit={handleCreateTemplate} className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <Plus className="h-4 w-4 text-emerald-600" />
                          <h4 className="text-gray-900">Add Template</h4>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Template name</label>
                          <input
                            type="text"
                            value={templateForm.name}
                            onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Free Checkup Camp"
                            required
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Type</label>
                            <select
                              value={templateForm.notificationType}
                              onChange={(e) =>
                                setTemplateForm((prev) => ({
                                  ...prev,
                                  notificationType: e.target.value as TemplateForm["notificationType"]
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="appointment_reminder">Appointment reminder</option>
                              <option value="follow_up_reminder">Follow-up reminder</option>
                              <option value="marketing_campaign">Marketing campaign</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Channel</label>
                            <select
                              value={templateForm.channel}
                              onChange={(e) =>
                                setTemplateForm((prev) => ({
                                  ...prev,
                                  channel: e.target.value as TemplateForm["channel"]
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            >
                              <option value="whatsapp">WhatsApp</option>
                              <option value="sms">SMS</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Condition tag</label>
                          <input
                            type="text"
                            value={templateForm.conditionTag}
                            onChange={(e) => setTemplateForm((prev) => ({ ...prev, conditionTag: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Optional: diabetes, dental"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Message body</label>
                          <textarea
                            rows={5}
                            value={templateForm.body}
                            onChange={(e) => setTemplateForm((prev) => ({ ...prev, body: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Use placeholders like {{firstName}}, {{clinicName}}, {{doctorName}}, {{followUpDate}}, {{campaignName}}"
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isCreatingTemplate}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Plus className="h-4 w-4" />
                          {isCreatingTemplate ? "Saving..." : "Add Template"}
                        </button>
                      </form>
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                      <form onSubmit={handleCreateCampaign} className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4">
                        <div className="flex items-center gap-2">
                          <Megaphone className="h-4 w-4 text-emerald-600" />
                          <h4 className="text-gray-900">Bulk Campaign</h4>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Campaign name</label>
                          <input
                            type="text"
                            value={campaignForm.name}
                            onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Free Checkup Camp"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Audience</label>
                          <select
                            value={campaignForm.audienceType}
                            onChange={(e) =>
                              setCampaignForm((prev) => ({
                                ...prev,
                                audienceType: e.target.value as CampaignForm["audienceType"]
                              }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          >
                            <option value="all_active">All active patients</option>
                            <option value="dormant_30">Patients not visited in 30+ days</option>
                            <option value="dormant_60">Patients not visited in 60+ days</option>
                            <option value="follow_up_due">Follow-ups due</option>
                            <option value="chronic">Chronic patients</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Template</label>
                          <select
                            value={campaignForm.templateId}
                            onChange={(e) => setCampaignForm((prev) => ({ ...prev, templateId: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            required
                          >
                            <option value="" disabled>
                              Select template
                            </option>
                            {notificationTemplates
                              .filter((template) => template.notification_type === "marketing_campaign")
                              .map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={campaignForm.sendWhatsapp}
                              onChange={(e) => setCampaignForm((prev) => ({ ...prev, sendWhatsapp: e.target.checked }))}
                            />
                            <span>WhatsApp</span>
                          </label>
                          <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={campaignForm.sendSms}
                              onChange={(e) => setCampaignForm((prev) => ({ ...prev, sendSms: e.target.checked }))}
                            />
                            <span>SMS</span>
                          </label>
                        </div>
                        <div>
                          <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Campaign note</label>
                          <textarea
                            rows={3}
                            value={campaignForm.notes}
                            onChange={(e) => setCampaignForm((prev) => ({ ...prev, notes: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            placeholder="Optional CTA or offer details"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isCreatingCampaign}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <Megaphone className="h-4 w-4" />
                          {isCreatingCampaign ? "Saving..." : "Create Campaign"}
                        </button>
                      </form>

                      <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="border-b border-gray-200 px-4 py-3">
                          <h4 className="text-gray-900">Campaign Queue</h4>
                          <p className="mt-1 text-sm text-gray-500">Create once, then send when the offer is ready.</p>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {notificationCampaigns.length === 0 && (
                            <div className="px-4 py-4 text-sm text-gray-500">No campaigns created yet.</div>
                          )}
                          {notificationCampaigns.map((campaign) => (
                            <div key={campaign.id} className="px-4 py-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="text-sm text-gray-900">{campaign.name}</p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {formatCampaignAudience(campaign.audience_type)} | {campaign.template_name || "Template missing"}
                                  </p>
                                  <p className="mt-2 text-xs text-gray-600">
                                    Sent {campaign.successful_recipients} / {campaign.total_recipients} | Failed {campaign.failed_recipients}
                                  </p>
                                  {campaign.notes && <p className="mt-2 text-xs text-gray-600">{campaign.notes}</p>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-gray-700">
                                    {campaign.status}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void handleSendCampaign(campaign.id)}
                                    disabled={sendingCampaignId === campaign.id}
                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    <Send className="h-4 w-4" />
                                    {sendingCampaignId === campaign.id ? "Sending..." : "Send now"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="border-b border-gray-200 px-4 py-3">
                        <h4 className="text-gray-900">Recent Reminder Activity</h4>
                        <p className="mt-1 text-sm text-gray-500">Latest reminder and notification delivery attempts.</p>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {notificationLogs.length === 0 && (
                          <div className="px-4 py-4 text-sm text-gray-500">No reminder activity logged yet.</div>
                        )}
                        {notificationLogs.map((log) => (
                          <div key={log.id} className="px-4 py-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm text-gray-900">
                                  {log.notification_type.replace(/_/g, " ")} | {log.channel.toUpperCase()}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">{log.recipient || "No recipient"} | {new Date(log.created_at).toLocaleString()}</p>
                                {log.message_preview && <p className="mt-2 text-xs text-gray-600">{log.message_preview}</p>}
                                {log.error_message && <p className="mt-2 text-xs text-red-600">{log.error_message}</p>}
                              </div>
                              <span
                                className={`rounded-full px-3 py-1 text-xs ${
                                  log.status === "sent"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : log.status === "failed"
                                      ? "bg-red-50 text-red-700"
                                      : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {log.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="border-t border-gray-200 pt-6">
                  <h4 className="text-gray-900">Workspace Preferences</h4>
                  <p className="mt-1 text-sm text-gray-600">Local browser-only preferences for this workstation.</p>
                </div>

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

                <div className="flex justify-end gap-3">
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
            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-6">
                <div>
                  <h3 className="text-gray-900">Security & Audit</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Review privileged activity, permission denials, and protected destructive actions.
                  </p>
                </div>

                {securityError && <p className="text-sm text-red-600">{securityError}</p>}
                {(isLoadingSecurityOverview || isLoadingSecurityLogs) && (
                  <p className="text-sm text-gray-500">Loading security activity...</p>
                )}

                {securityOverview && (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Audit Events</p>
                        <p className="mt-2 text-2xl text-gray-900">{securityOverview.summary.totalEvents}</p>
                        <p className="mt-1 text-xs text-gray-500">Last {securityOverview.summary.windowDays} days</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-amber-700">Destructive Actions</p>
                        <p className="mt-2 text-2xl text-amber-900">{securityOverview.summary.destructiveActions}</p>
                        <p className="mt-1 text-xs text-amber-700">Deletes, bulk cancellations, stock loss</p>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-rose-700">Permission Denials</p>
                        <p className="mt-2 text-2xl text-rose-900">{securityOverview.summary.deniedActions}</p>
                        <p className="mt-1 text-xs text-rose-700">Blocked access attempts logged centrally</p>
                      </div>
                      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-violet-700">Critical Events</p>
                        <p className="mt-2 text-2xl text-violet-900">{securityOverview.summary.criticalEvents}</p>
                        <p className="mt-1 text-xs text-violet-700">Reserved for highest-severity actions</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Locked Accounts</p>
                        <p className="mt-2 text-2xl text-slate-900">{securityOverview.summary.lockedAccounts}</p>
                        <p className="mt-1 text-xs text-slate-500">Users currently locked after failed logins</p>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-emerald-700">Active Accounts</p>
                        <p className="mt-2 text-2xl text-emerald-900">{securityOverview.summary.activeAccounts7d}</p>
                        <p className="mt-1 text-xs text-emerald-700">Users signed in during the last 7 days</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="mb-4">
                          <h4 className="text-gray-900">Protected Actions</h4>
                          <p className="mt-1 text-sm text-gray-600">High-risk operations now require full access.</p>
                        </div>
                        <div className="space-y-3">
                          {securityOverview.protectedActions.map((item) => (
                            <div key={item.action} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                              <p className="text-sm text-gray-900">{item.action}</p>
                              <p className="mt-1 text-xs text-gray-600">{item.description}</p>
                              <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-gray-500">
                                Allowed Roles: {item.roles.map((role) => formatStaffRole(role)).join(", ")}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 p-4">
                        <div className="mb-4">
                          <h4 className="text-gray-900">Recent Destructive Activity</h4>
                          <p className="mt-1 text-sm text-gray-600">Newest deletes and irreversible operational changes.</p>
                        </div>
                        <div className="space-y-3">
                          {securityOverview.recentDestructive.length === 0 && (
                            <p className="text-sm text-gray-500">No destructive actions logged yet.</p>
                          )}
                          {securityOverview.recentDestructive.map((item) => (
                            <div key={item.id} className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm text-red-900">{item.summary}</p>
                                <span className="rounded-full bg-white px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-red-700">
                                  {item.module}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-red-700">
                                {item.actor_name || "System"}{item.actor_role ? ` • ${formatStaffRole(item.actor_role)}` : ""}
                              </p>
                              <p className="mt-1 text-xs text-red-700">{formatAuditDate(item.created_at)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 p-4">
                      <div className="mb-4">
                        <h4 className="text-gray-900">Role Access Snapshot</h4>
                        <p className="mt-1 text-sm text-gray-600">User verification, recent sign-in, and lock status by role.</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.14em] text-gray-500">
                            <tr>
                              <th className="px-2 py-3">Role</th>
                              <th className="px-2 py-3">Users</th>
                              <th className="px-2 py-3">Verified</th>
                              <th className="px-2 py-3">Signed In</th>
                              <th className="px-2 py-3">Locked</th>
                              <th className="px-2 py-3">Latest Login</th>
                            </tr>
                          </thead>
                          <tbody>
                            {securityOverview.userAccess.map((item) => (
                              <tr key={item.role} className="border-b border-gray-100 last:border-0">
                                <td className="px-2 py-3 text-sm text-gray-900">{formatStaffRole(item.role)}</td>
                                <td className="px-2 py-3 text-sm text-gray-700">{item.total}</td>
                                <td className="px-2 py-3 text-sm text-gray-700">{item.verifiedTotal}</td>
                                <td className="px-2 py-3 text-sm text-gray-700">{item.loggedInTotal}</td>
                                <td className="px-2 py-3 text-sm text-gray-700">{item.lockedTotal}</td>
                                <td className="px-2 py-3 text-sm text-gray-500">{formatAuditDate(item.latestLoginAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h4 className="text-gray-900">Audit Trail</h4>
                    <p className="mt-1 text-sm text-gray-600">Cross-module write activity with actor, route, and outcome.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Module</label>
                      <select
                        value={securityModuleFilter}
                        onChange={(e) => setSecurityModuleFilter(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="all">All modules</option>
                        {auditModules.map((module) => (
                          <option key={module} value={module}>
                            {module}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs uppercase tracking-[0.14em] text-gray-500">Outcome</label>
                      <select
                        value={securityOutcomeFilter}
                        onChange={(e) => setSecurityOutcomeFilter(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="all">All outcomes</option>
                        <option value="success">Success</option>
                        <option value="denied">Denied</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={securityDestructiveOnly}
                        onChange={(e) => setSecurityDestructiveOnly(e.target.checked)}
                      />
                      <span>Destructive only</span>
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.14em] text-gray-500">
                      <tr>
                        <th className="px-2 py-3">When</th>
                        <th className="px-2 py-3">Action</th>
                        <th className="px-2 py-3">Module</th>
                        <th className="px-2 py-3">Actor</th>
                        <th className="px-2 py-3">Outcome</th>
                        <th className="px-2 py-3">Route</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!isLoadingSecurityLogs && securityLogs.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-2 py-4 text-sm text-gray-500">
                            No audit events matched the current filters.
                          </td>
                        </tr>
                      )}
                      {securityLogs.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0 align-top">
                          <td className="px-2 py-3 text-sm text-gray-500">{formatAuditDate(item.created_at)}</td>
                          <td className="px-2 py-3">
                            <p className="text-sm text-gray-900">{item.summary}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.entity_label || item.entity_type}
                              {item.is_destructive ? " • destructive" : ""}
                            </p>
                          </td>
                          <td className="px-2 py-3 text-sm text-gray-700">{item.module}</td>
                          <td className="px-2 py-3 text-sm text-gray-700">
                            <p>{item.actor_name || "System"}</p>
                            <p className="mt-1 text-xs text-gray-500">{item.actor_role ? formatStaffRole(item.actor_role) : "-"}</p>
                          </td>
                          <td className="px-2 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] uppercase tracking-[0.14em] ${
                                item.outcome === "denied"
                                  ? "bg-rose-50 text-rose-700"
                                  : item.outcome === "failed"
                                    ? "bg-amber-50 text-amber-700"
                                    : item.severity === "critical"
                                      ? "bg-violet-50 text-violet-700"
                                      : item.is_destructive
                                        ? "bg-orange-50 text-orange-700"
                                        : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {item.outcome}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-xs text-gray-500">
                            <p>{item.method || "-"}</p>
                            <p className="mt-1 break-all">{item.path || "-"}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 space-y-6">
                <div>
                  <h4 className="text-gray-900">Session Controls</h4>
                  <p className="text-sm text-gray-600 mt-1">Manage your current browser session and local settings cache.</p>
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
                    <div className="sm:col-span-2">
                      <label className="block text-sm text-gray-700 mb-2">Assigned Branch *</label>
                      <select
                        value={staffForm.branchId}
                        onChange={(e) => setStaffForm((prev) => ({ ...prev, branchId: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2"
                        required
                      >
                        <option value="" disabled>
                          Select branch
                        </option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
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

                <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2">
                    <Search className="h-4 w-4 text-gray-500" />
                    <input
                      type="text"
                      value={staffSearch}
                      onChange={(e) => setStaffSearch(e.target.value)}
                      className="flex-1 border-none bg-transparent text-sm outline-none"
                      placeholder="Search by name, email, phone, or role"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="mt-1 text-lg text-gray-900">{staffUsers.length}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                      <p className="text-xs text-gray-500">Ready</p>
                      <p className="mt-1 text-lg text-gray-900">{readyStaffCount}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                      <p className="text-xs text-gray-500">Doctors</p>
                      <p className="mt-1 text-lg text-gray-900">{doctorRoleCount}</p>
                    </div>
                  </div>
                </div>

                {isLoadingStaff && <p className="text-sm text-gray-500">Loading staff...</p>}
                {!isLoadingStaff && staffUsers.length === 0 && <p className="text-sm text-gray-500">No staff accounts yet.</p>}
                {!isLoadingStaff && staffUsers.length > 0 && filteredStaffUsers.length === 0 && (
                  <p className="text-sm text-gray-500">No staff matched the current search.</p>
                )}

                {!isLoadingStaff && filteredStaffUsers.length > 0 && (
                  <div className="space-y-3">
                    {filteredStaffUsers.map((staff) => (
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

