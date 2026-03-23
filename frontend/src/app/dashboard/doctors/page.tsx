"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Mail, Phone, Plus, Search, Star } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { Doctor } from "@/types/api";

type DoctorsResponse = {
  success: boolean;
  data: {
    items: Doctor[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type CreateDoctorResponse = {
  success: boolean;
  data: Doctor;
};

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDoctors, setTotalDoctors] = useState(0);
  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [availability, setAvailability] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const loadDoctors = useCallback((currentPage: number, currentQuery: string) => {
    setLoading(true);
    setError("");
    const q = currentQuery.trim() ? `&q=${encodeURIComponent(currentQuery.trim())}` : "";

    apiRequest<DoctorsResponse>(`/doctors?page=${currentPage}&limit=12${q}`, { authenticated: true })
      .then((response) => {
        setDoctors(response.data.items || []);
        setPage(response.data.pagination?.page || currentPage);
        setTotalPages(response.data.pagination?.totalPages || 1);
        setTotalDoctors(response.data.pagination?.total || 0);
      })
      .catch((err: Error) => setError(err.message || "Failed to load doctors"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDoctors(1, "");
  }, [loadDoctors]);

  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await apiRequest<CreateDoctorResponse>("/doctors", {
        method: "POST",
        authenticated: true,
        body: {
          fullName,
          specialty,
          experienceYears: experienceYears ? Number(experienceYears) : null,
          availability: availability || null,
          phone: phone || null,
          email: email || null,
          status: "available"
        }
      });
      setShowCreate(false);
      setFullName("");
      setSpecialty("");
      setExperienceYears("");
      setAvailability("");
      setPhone("");
      setEmail("");
      loadDoctors(1, query);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create doctor";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const runSearch = () => {
    setQuery(search);
    setPage(1);
    loadDoctors(1, search);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-gray-900">Doctors</h1>
          <p className="text-gray-600 mt-1">Manage medical staff and view doctor profiles</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add New Doctor
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-4 py-2 flex-1">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search by name, specialty, email or phone"
              className="bg-transparent border-none outline-none flex-1 text-sm"
            />
          </div>
          <button onClick={runSearch} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Search
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading doctors...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {doctors.map((doctor) => (
          <div key={doctor.id} className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white text-xl">
                  {doctor.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h3 className="text-gray-900">{doctor.full_name}</h3>
                  <p className="text-sm text-cyan-600 mt-0.5">{doctor.specialty}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm text-gray-600">{doctor.rating || 0}</span>
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-1 text-xs rounded-full ${
                  doctor.status === "available"
                    ? "bg-green-50 text-green-700"
                    : doctor.status === "busy"
                      ? "bg-yellow-50 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {doctor.status}
              </span>
            </div>
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>{doctor.availability || "-"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{doctor.phone || "-"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4" />
                <span>{doctor.email || "-"}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-gray-200">
              <div>
                <p className="text-sm text-gray-600">Experience</p>
                <p className="text-gray-900 mt-1">{doctor.experience_years ? `${doctor.experience_years} years` : "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Patients</p>
                <p className="text-gray-900 mt-1">{doctor.patient_count}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 flex items-center justify-between">
        <p className="text-sm text-gray-600">Total doctors: {totalDoctors}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDoctors(Math.max(1, page - 1), query)}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => loadDoctors(Math.min(totalPages, page + 1), query)}
            disabled={page >= totalPages || loading}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateDoctor} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg text-gray-900">Add New Doctor</h2>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Specialty</label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Experience (Years)</label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Availability</label>
                <input
                  type="text"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Mon-Fri, 10:00-18:00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="10-digit number"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="doctor@example.com"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setFullName("");
                  setSpecialty("");
                  setExperienceYears("");
                  setAvailability("");
                  setPhone("");
                  setEmail("");
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg disabled:opacity-60"
              >
                {isSubmitting ? "Adding..." : "Add Doctor"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

