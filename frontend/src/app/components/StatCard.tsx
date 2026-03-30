import { TrendingUp, TrendingDown, LucideIcon } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string;
    change: string;
    trend: "up" | "down";
    icon: LucideIcon;
    color: "blue" | "emerald" | "teal" | "green";
}

const colorClasses = {
    blue: "bg-teal-50 text-teal-700",
    emerald: "bg-emerald-50 text-emerald-600",
    teal: "bg-teal-50 text-teal-700",
    green: "bg-emerald-50 text-emerald-700"
};

export default function StatCard({ title, value, change, trend, icon: Icon, color }: StatCardProps) {
    return (
        <div className="theme-panel rounded-xl p-6">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-sm theme-copy">{title}</p>
                    <p className="text-2xl mt-2 theme-heading">{value}</p>
                    <div className="flex items-center gap-1 mt-2">
                        {trend === "up" ? (
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`text-sm ${trend === "up" ? "text-emerald-600" : "text-red-600"}`}>{change}</span>
                        <span className="text-sm theme-muted ml-1">vs last month</span>
                    </div>
                </div>
                <div className={`w-12 h-12 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
        </div>
    )
}
