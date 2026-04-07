import type { Metadata } from "next";
import DashboardLayout from "@/app/components/DashboardLayout";

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

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
