"use client";

import { Users, Calendar, UserRound, DollarSign } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import StatCard from "../components/StatCard";
import AppointmentCalendar from "../components/AppointmentCalendar";
import RecentPatientsTable from "../components/RecentPatientsTable";
import UpcomingAppointments from "../components/UpcomingAppointments";
import PatientActivityTimeline from "../components/PatientActivityTimeline";
import { apiRequest } from "@/lib/api";
import { ActivityLog, Appointment, Patient } from "@/types/api";

type DashboardResponse = {
  success: boolean;
  data: {
    stats: {
      totalPatients: number;
      todaysAppointments: number;
      availableDoctors: number;
      monthlyRevenue: number;
    };
    recentActivity: ActivityLog[];
  };
};

type AppointmentsResponse = {
  success: boolean;
  data: {
    items: Appointment[];
  };
};

type PatientsResponse = {
  success: boolean;
  data: {
    items: Patient[];
  };
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    totalPatients: 0,
    todaysAppointments: 0,
    availableDoctors: 0,
    monthlyRevenue: 0
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  useEffect(() => {
    Promise.all([
      apiRequest<DashboardResponse>("/dashboard/summary", { authenticated: true }),
      apiRequest<AppointmentsResponse>("/appointments?limit=6", { authenticated: true }),
      apiRequest<PatientsResponse>("/patients?limit=5", { authenticated: true })
    ])
      .then(([dashboardRes, appointmentsRes, patientsRes]) => {
        setStats(dashboardRes.data.stats);
        setActivities(dashboardRes.data.recentActivity || []);
        setAppointments(appointmentsRes.data.items || []);
        setPatients(patientsRes.data.items || []);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load dashboard data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }, []);

  if (loading) {
    return <p className="text-gray-600">Loading dashboard...</p>;
  }

  if (error) {
    return <p className="text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-gray-900 space-y-1">Dashboard</h1>
        <p className="text-gray-600 mt-1">Overview of your clinic operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Patients" value={String(stats.totalPatients)} change="Live" trend="up" icon={Users} color="blue" />
        <StatCard title="Today's Appointments" value={String(stats.todaysAppointments)} change="Live" trend="up" icon={Calendar} color="cyan" />
        <StatCard title="Available Doctors" value={String(stats.availableDoctors)} change="Live" trend="up" icon={UserRound} color="teal" />
        <StatCard title="Monthly Revenue" value={`$${stats.monthlyRevenue.toLocaleString()}`} change="Live" trend="up" icon={DollarSign} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AppointmentCalendar appointments={appointments.slice(0, 5)} currentDateLabel={todayLabel} />
        </div>

        <div>
          <UpcomingAppointments items={appointments.slice(0, 5)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentPatientsTable patients={patients} />
        </div>

        <div>
          <PatientActivityTimeline items={activities} />
        </div>
      </div>
    </div>
  );
}
