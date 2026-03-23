import { Eye, Edit2 } from "lucide-react";
import { Patient } from "@/types/api";

type Props = {
  patients: Patient[];
};

const getStatusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-green-50 text-green-700";
  if (normalized.includes("follow")) return "bg-blue-50 text-blue-700";
  return "bg-yellow-50 text-yellow-700";
};

export default function RecentPatientsTable({ patients }: Props) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-gray-900">Recent Patients</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-sm text-gray-600 pb-3">Patient Name</th>
              <th className="text-left text-sm text-gray-600 pb-3">Age</th>
              <th className="text-left text-sm text-gray-600 pb-3">Phone</th>
              <th className="text-left text-sm text-gray-600 pb-3">Last Visit</th>
              <th className="text-left text-sm text-gray-600 pb-3">Status</th>
              <th className="text-left text-sm text-gray-600 pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-sm text-gray-500">
                  No recent patients found.
                </td>
              </tr>
            )}
            {patients.map((patient) => (
              <tr key={patient.id} className="border-b border-gray-100 last:border-0">
                <td className="py-4 text-gray-900">{patient.full_name}</td>
                <td className="py-4 text-gray-600">{patient.age ?? "-"}</td>
                <td className="py-4 text-gray-600">{patient.phone}</td>
                <td className="py-4 text-gray-600">{patient.last_visit_at || "-"}</td>
                <td className="py-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusClass(patient.status)}`}>
                    {patient.status}
                  </span>
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <button className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-gray-100 text-gray-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
