import { TrendingUp, TrendingDown, LucideIcon } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string;
    change: string;
    trend: "up" | "down";
    icon: LucideIcon;
    color: "blue" | "cyan" | "teal" | "green";
}

const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    cyan: "bg-cyan-50 text-cyan-600",
    teal: "bg-teal-50 text-teal-600",
    green: "bg-green-50 text-green-600"
};

export default function StatCard({ title, value, change, trend, icon: Icon, color }: StatCardProps) {
    return (
        <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-sm text-gray-600">{title}</p>
                    <p className="text-2xl mt-2 text-gray-900">{value}</p>
                    <div className="flex items-center gap-1 mt-2">
                        {trend === "up" ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                        )}
                        <span className={`text-sm ${trend === "up" ? "text-green-600" : "text-red-600"}`}>{change}</span>
                        <span className="text-sm text-gray-500 ml-1">vs last month</span>
                    </div>
                </div>
                <div className={`w-12 h-12 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
        </div>
    )
}