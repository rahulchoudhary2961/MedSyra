"use client";

import Link from "next/link";
import { Eye, Edit2 } from "lucide-react";
import { Patient } from "@/types/api";

type Props = {
  patients: Patient[];
  onView: (patient: Patient) => void;
  onEdit: (patient: Patient) => void;
  maxVisibleRows?: number;
  moreHref?: string;
};

const getStatusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "active") return "bg-emerald-50 text-emerald-700";
  if (normalized.includes("follow")) return "bg-teal-50 text-teal-700";
  return "bg-yellow-50 text-yellow-700";
};

export default function RecentPatientsTable({ patients, onView, onEdit, maxVisibleRows = 6, moreHref }: Props) {
  const visiblePatients = patients.slice(0, maxVisibleRows);
  const hasMore = patients.length > maxVisibleRows;

  return (
    <div className="theme-panel rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="theme-heading">Recent Patients</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left text-sm theme-copy pb-3">Patient Name</th>
              <th className="text-left text-sm theme-copy pb-3">Age</th>
              <th className="text-left text-sm theme-copy pb-3">Phone</th>
              <th className="text-left text-sm theme-copy pb-3">Last Visit</th>
              <th className="text-left text-sm theme-copy pb-3">Status</th>
              <th className="text-left text-sm theme-copy pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visiblePatients.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-sm theme-muted">
                  No recent patients found.
                </td>
              </tr>
            )}
            {visiblePatients.map((patient) => (
              <tr key={patient.id} className="border-b border-slate-100 last:border-0">
                <td className="py-4 theme-heading">{patient.full_name}</td>
                <td className="py-4 theme-copy">{patient.age ?? "-"}</td>
                <td className="py-4 theme-copy">{patient.phone}</td>
                <td className="py-4 theme-copy">{patient.last_visit_at || "-"}</td>
                <td className="py-4">
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusClass(patient.status)}`}>
                    {patient.status}
                  </span>
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onView(patient)}
                      className="p-1.5 rounded hover:bg-emerald-50 text-slate-600"
                      title="View patient profile"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(patient)}
                      className="p-1.5 rounded hover:bg-emerald-50 text-slate-600"
                      title="Edit patient"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="mt-4 flex justify-end">
          {moreHref ? (
            <Link
              href={moreHref}
              className="inline-flex items-center justify-center rounded-lg border border-emerald-200 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
            >
              More patients
            </Link>
          ) : (
            <p className="text-sm theme-muted">
              Showing {visiblePatients.length} of {patients.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
