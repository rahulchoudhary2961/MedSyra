import { UserPlus, FileText, Calendar, CreditCard } from "lucide-react";
import { ActivityLog } from "@/types/api";

type Props = {
  items: ActivityLog[];
};

const iconByType = {
  registration: UserPlus,
  record: FileText,
  appointment: Calendar,
  payment: CreditCard
};

const colorClasses = {
  registration: "bg-green-50 text-green-600",
  record: "bg-teal-50 text-teal-600",
  appointment: "bg-emerald-50 text-emerald-600",
  payment: "bg-teal-50 text-teal-600"
};

export default function PatientActivityTimeline({ items }: Props) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <h3 className="text-gray-900 mb-6">Recent Activity</h3>
      <div className="space-y-4">
        {items.length === 0 && <p className="text-sm text-gray-500">No activity yet.</p>}
        {items.map((activity, index) => {
          const type = (activity.event_type as keyof typeof iconByType) || "record";
          const Icon = iconByType[type] || FileText;
          const colorClass = colorClasses[type] || colorClasses.record;

          return (
            <div key={activity.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                {index < items.length - 1 && <div className="w-px h-full bg-gray-200 my-1" />}
              </div>
              <div className="flex-1 pb-4">
                <p className="text-sm text-gray-900">{activity.title}</p>
                <p className="text-sm text-gray-600 mt-0.5">{activity.entity_name || "-"}</p>
                <p className="text-xs text-gray-500 mt-1">{new Date(activity.event_time).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

