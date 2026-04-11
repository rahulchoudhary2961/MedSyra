import type { Metadata } from "next";
import { Suspense } from "react";
import DashboardBootstrap from "./DashboardBootstrap";
import RouteLoading from "../components/RouteLoading";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | MedSyra Dashboard"
  },
  description: "Operational dashboard for MedSyra clinic staff and doctors.",
  robots: {
    index: false,
    follow: false
  }
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<RouteLoading fullScreen message="Preparing your dashboard..." />}>
      <DashboardBootstrap />
    </Suspense>
  );
}
