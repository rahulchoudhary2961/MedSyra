"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/app/context/AuthContext";

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

export default function DoctorAppointmentCount({
  children
}: {
  children: (count: number) => React.ReactNode;
}) {
  const { currentUser } = useAuth();
  const [count, setCount] = useState(0);

  const fetchUpcomingAppointmentsCount = useCallback(() => {
    if (currentUser?.role !== "doctor") {
      return;
    }

    const todayKey = toDateKey(new Date());
    apiRequest<UpcomingAppointmentsResponse>(`/appointments?date=${todayKey}&limit=100`, { authenticated: true })
      .then((response) => {
        setCount(countUpcomingAppointments(response.data.items || []));
      })
      .catch(() => {
        setCount(0);
      });
  }, [currentUser?.role]);

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

  if (currentUser?.role !== "doctor") {
    return children(0);
  }

  return children(count);
}
