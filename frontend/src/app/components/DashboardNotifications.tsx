"use client";

import { useRef, useState } from "react";
import { Bell } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useDashboardUI } from "@/app/context/DashboardUIContext";

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

export default function DashboardNotifications() {
  const { notificationsOpen, setNotificationsOpen } = useDashboardUI();
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [recentActivity, setRecentActivity] = useState<DashboardSummaryResponse["data"]["recentActivity"]>([]);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={notificationsRef} className="relative flex items-center gap-3">
      <button
        type="button"
        onClick={openNotifications}
        className="theme-action-button relative rounded-lg p-2 hover:bg-white/80"
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
    </div>
  );
}
