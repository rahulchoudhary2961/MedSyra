import { ChevronLeft, ChevronRight } from "lucide-react";
import { Appointment } from "@/types/api";

type Props = {
  appointments: Appointment[];
  currentDateLabel: string;
};

export default function AppointmentCalendar({ appointments, currentDateLabel }: Props) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-gray-900">Today&apos;s Schedule</h3>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{currentDateLabel}</span>
          <div className="flex items-center gap-1">
            <button className="p-1 rounded hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button className="p-1 rounded hover:bg-gray-100">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {appointments.length === 0 && (
          <p className="text-sm text-gray-500">No appointments scheduled for today.</p>
        )}

        {appointments.map((apt) => (
          <div
            key={apt.id}
            className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-cyan-300 transition-colors"
          >
            <div className="text-center min-w-[60px]">
              <div className="text-sm text-cyan-600">{apt.appointment_time?.slice(0, 5)}</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-gray-900">{apt.patient_name}</p>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                  {apt.appointment_type}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-0.5">{apt.doctor_name}</p>
            </div>
            <span className="px-2 py-1 text-xs rounded-full bg-cyan-50 text-cyan-700">{apt.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
