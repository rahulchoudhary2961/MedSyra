import {
  LayoutDashboard,
  Bot,
  Users,
  Calendar,
  UserRound,
  FileText,
  CreditCard,
  BarChart3,
  Building2,
  FlaskConical,
  Boxes,
  Pill,
  ShieldCheck,
  Settings,
  Bell
} from "lucide-react";

export const dashboardNavigation = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "AI Assistant", path: "/dashboard/assistant", icon: Bot },
  { name: "Patients", path: "/dashboard/patients", icon: Users },
  { name: "Calendar", path: "/dashboard/appointments", icon: Calendar },
  { name: "Doctors", path: "/dashboard/doctors", icon: UserRound },
  { name: "Medical Records", path: "/dashboard/medical-records", icon: FileText },
  { name: "CRM", path: "/dashboard/crm", icon: Bell },
  { name: "Lab", path: "/dashboard/lab", icon: FlaskConical },
  { name: "Pharmacy", path: "/dashboard/pharmacy", icon: Pill },
  { name: "Inventory", path: "/dashboard/inventory", icon: Boxes },
  { name: "Billings", path: "/dashboard/billings", icon: CreditCard },
  { name: "Insurance", path: "/dashboard/insurance", icon: ShieldCheck },
  { name: "Reports", path: "/dashboard/reports", icon: BarChart3 },
  { name: "Branches", path: "/dashboard/branches", icon: Building2 },
  { name: "Settings", path: "/dashboard/settings", icon: Settings }
];
