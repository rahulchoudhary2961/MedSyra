import { cookies } from "next/headers";
import DashboardClient, { type DashboardInitialData } from "./DashboardClient";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api/v1";
const AUTH_COOKIE_NAME = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME || "medsyra_session";
const GUEST_MODE_COOKIE_NAME = "medsyra_guest_mode";

type DashboardBootstrapResponse = {
  success: boolean;
  data: {
    stats: {
      todayAppointments: number;
      todayRevenue: number;
      pendingPayments: number;
      noShows: number;
    };
    insights: {
      patientsDidNotReturn: number;
      mostCommonIssue: {
        label: string;
        count: number;
      };
      weeklyRevenue: number;
      followUpsDueToday: number;
    };
    operations: {
      todayWaiting: number;
      pendingPayments: number;
      pendingPaymentAmount: number;
      followUpsDue: number;
      followUpsOverdue: number;
      labReportsReady: number;
      insuranceFollowUpsDue: number;
      actionRequired: Array<{
        key: string;
        label: string;
        count: number;
        href: string;
        tone: "blue" | "amber" | "emerald" | "rose" | "violet" | "slate" | "orange";
      }>;
    };
    crm: {
      followUpQueue: Array<unknown>;
      recallQueue: Array<unknown>;
    };
    recentActivity: Array<{
      id: string;
      title: string;
      entity_name: string | null;
      event_time: string;
    }>;
  };
};

type PatientsResponse = {
  success: boolean;
  data: {
    items: Array<unknown>;
  };
};

const buildCookieHeader = async () => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((entry) => `${entry.name}=${entry.value}`).join("; ");
  return cookieHeader || null;
};

const fetchInitialDashboardData = async () => {
  const cookieStore = await cookies();
  const guestModeEnabled = cookieStore.get(GUEST_MODE_COOKIE_NAME)?.value === "true";

  if (guestModeEnabled) {
    return null;
  }

  const authCookie = cookieStore.get(AUTH_COOKIE_NAME)?.value?.trim();
  const cookieHeader = await buildCookieHeader();

  if (!authCookie || !cookieHeader) {
    return null;
  }

  const headers = new Headers({
    Cookie: cookieHeader
  });

  const [dashboardResponse, patientsResponse] = await Promise.all([
    fetch(`${API_BASE_URL}/dashboard/summary`, {
      method: "GET",
      headers,
      cache: "no-store"
    }).then(async (response) => (response.ok ? (response.json() as Promise<DashboardBootstrapResponse>) : null)).catch(() => null),
    fetch(`${API_BASE_URL}/patients?limit=6`, {
      method: "GET",
      headers,
      cache: "no-store"
    }).then(async (response) => (response.ok ? (response.json() as Promise<PatientsResponse>) : null)).catch(() => null)
  ]);

  if (!dashboardResponse || !patientsResponse) {
    return null;
  }

  return {
    ...dashboardResponse.data,
    patients: patientsResponse.data.items || []
  };
};

export default async function DashboardBootstrap() {
  const initialData = await fetchInitialDashboardData();
  return <DashboardClient initialData={initialData as DashboardInitialData} />;
}
