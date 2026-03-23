// src/app/(dashboard)/layout.tsx
import DashboardLayout from "@/app/components/DashboardLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
