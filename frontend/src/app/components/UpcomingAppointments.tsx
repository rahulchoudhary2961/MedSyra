import { Clock } from "lucide-react";
import { Appointment } from "@/types/api";

type Props = {
  items: Appointment[];
};

export default function UpcomingAppointments({ items }: Props) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <h3 className="text-gray-900 mb-6">Upcoming Appointments</h3>
      <div className="space-y-4">
        {items.length === 0 && <p className="text-sm text-gray-500">No upcoming appointments.</p>}
        {items.map((apt) => (
          <div key={apt.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="w-10 h-10 bg-cyan-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-cyan-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-900">{apt.patient_name}</p>
              <p className="text-sm text-gray-600 mt-0.5">{apt.appointment_time?.slice(0, 5)} with {apt.doctor_name}</p>
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">{apt.appointment_date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
