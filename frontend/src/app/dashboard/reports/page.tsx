"use client"

import { useEffect, useMemo, useState } from "react";
import { Calendar, DollarSign, Download, TrendingUp, Users } from "lucide-react";
import { BarChart, Bar, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, ResponsiveContainer } from "recharts";
import { apiRequest } from "@/lib/api";

type ReportsResponse = {
  success: boolean;
  data: {
    stats: {
      totalPatients: number;
      totalAppointments: number;
      revenue3m: number;
      growthRate: number;
    };
    monthlyData: Array<{
      month: string;
      patients: number;
      revenue: number;
      appointments: number;
    }>;
    departmentData: Array<{
      name: string;
      value: number;
    }>;
    appointmentTypes: Array<{
      type: string;
      count: number;
    }>;
  };
};

const PIE_COLORS = ["#06b6d4", "#3b82f6", "#14b8a6", "#0ea5e9", "#22c55e", "#f59e0b", "#f97316", "#8b5cf6"];

export default function Reports() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({
    totalPatients: 0,
    totalAppointments: 0,
    revenue3m: 0,
    growthRate: 0
  });
  const [monthlyData, setMonthlyData] = useState<Array<{ month: string; patients: number; revenue: number; appointments: number }>>([]);
  const [departmentData, setDepartmentData] = useState<Array<{ name: string; value: number }>>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<Array<{ type: string; count: number }>>([]);

  useEffect(() => {
    apiRequest<ReportsResponse>("/dashboard/reports", { authenticated: true })
      .then((response) => {
        setStats(response.data.stats);
        setMonthlyData(response.data.monthlyData || []);
        setDepartmentData(response.data.departmentData || []);
        setAppointmentTypes(response.data.appointmentTypes || []);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load reports");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const coloredDepartmentData = useMemo(
    () =>
      departmentData.map((entry, index) => ({
        ...entry,
        color: PIE_COLORS[index % PIE_COLORS.length]
      })),
    [departmentData]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-1">View detailed insights and performance metrics</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
          <Download className="w-4 h-4" />
          Export Reports
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Patients</p>
              <p className="text-2xl text-gray-900 mt-1">{stats.totalPatients.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-50 text-cyan-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Appointments (3M)</p>
              <p className="text-2xl text-gray-900 mt-1">{stats.totalAppointments.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Revenue (3M)</p>
              <p className="text-2xl text-gray-900 mt-1">${stats.revenue3m.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Growth Rate</p>
              <p className="text-2xl text-gray-900 mt-1">{stats.growthRate >= 0 ? "+" : ""}{stats.growthRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 text-gray-600">Loading reports...</div>
      )}
      {error && (
        <div className="bg-red-50 rounded-xl p-6 border border-red-200 text-red-700">{error}</div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-gray-900 mb-6">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#6b7280" />
              <YAxis stroke="#6b7280"/>
              <Tooltip formatter={(value) => `$${value}`} />
              <Line type="monotone" dataKey="revenue" stroke="#06b6d4" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Patient Distribution by Department */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-gray-900 mb-6">Patient Distribution by Department</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={coloredDepartmentData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {coloredDepartmentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => value} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Appointment Types */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-gray-900 mb-6">Appointments by Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={appointmentTypes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="type" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip formatter={(value) => value} />
              <Bar dataKey="count" fill="#06b6d4" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Metrics */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-gray-900 mb-6">Monthly Patient Growth</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#6b7280" />
              <YAxis stroke="#6b7280"/>
              <Tooltip formatter={(value) => value} />
              <Legend />
              <Bar key="patients-bar" dataKey="patients" fill="#06b6d4"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
