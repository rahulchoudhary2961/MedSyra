import type { Metadata } from "next";
import DashboardLayout from "@/app/components/DashboardLayout";
import { AuthProvider } from "@/app/context/AuthContext";
import { BranchProvider } from "@/app/context/BranchContext";
import { DashboardUIProvider } from "@/app/context/DashboardUIContext";

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
  return (
    <AuthProvider>
      <BranchProvider>
        <DashboardUIProvider>
          <DashboardLayout>{children}</DashboardLayout>
        </DashboardUIProvider>
      </BranchProvider>
    </AuthProvider>
  );
}
