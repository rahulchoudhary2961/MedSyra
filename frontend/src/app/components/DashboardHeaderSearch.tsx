"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { isFullAccessRole, isReceptionRole } from "@/lib/roles";
import { useAuth } from "@/app/context/AuthContext";
import { useDashboardUI } from "@/app/context/DashboardUIContext";

type SearchPatientsResponse = {
  success: boolean;
  data: {
    items: Array<{
      id: string;
      full_name: string;
      phone: string;
    }>;
  };
};

type SearchDoctorsResponse = {
  success: boolean;
  data: {
    items: Array<{
      id: string;
      full_name: string;
      specialty: string;
    }>;
  };
};

export default function DashboardHeaderSearch() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { showSearchResults, setShowSearchResults } = useDashboardUI();
  const [headerSearch, setHeaderSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ patients: SearchPatientsResponse["data"]["items"]; doctors: SearchDoctorsResponse["data"]["items"] }>({
    patients: [],
    doctors: []
  });
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [setShowSearchResults]);

  useEffect(() => {
    const term = headerSearch.trim();

    if (term.length < 2) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);

      Promise.all([
        apiRequest<SearchPatientsResponse>(`/patients?limit=5&q=${encodeURIComponent(term)}`, { authenticated: true }).catch(() => ({
          success: true,
          data: { items: [] }
        })),
        isFullAccessRole(currentUser?.role) || isReceptionRole(currentUser?.role)
          ? apiRequest<SearchDoctorsResponse>(`/doctors?limit=5&q=${encodeURIComponent(term)}`, { authenticated: true }).catch(() => ({
              success: true,
              data: { items: [] }
            }))
          : Promise.resolve({ success: true, data: { items: [] } })
      ])
        .then(([patientsResponse, doctorsResponse]) => {
          setSearchResults({
            patients: patientsResponse.data.items || [],
            doctors: doctorsResponse.data.items || []
          });
        })
        .finally(() => setIsSearching(false));
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [headerSearch, currentUser?.role]);

  const submitHeaderSearch = () => {
    const term = headerSearch.trim();
    if (!term) {
      return;
    }

    setShowSearchResults(false);
    router.push(`/dashboard/patients?q=${encodeURIComponent(term)}`);
  };

  return (
    <div ref={searchRef} className="relative hidden sm:block flex-1 max-w-md">
      <div className="theme-surface flex items-center gap-2 rounded-lg px-4 py-2">
        <Search className="w-4 h-4 theme-muted" />
        <input
          type="text"
          value={headerSearch}
          onChange={(e) => {
            const nextValue = e.target.value;
            setHeaderSearch(nextValue);
            setShowSearchResults(nextValue.trim().length >= 2);
          }}
          onFocus={() => setShowSearchResults(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitHeaderSearch();
            }
          }}
          placeholder="Search patients, doctors..."
          data-suggest="off"
          className="bg-transparent border-none outline-none flex-1 text-sm theme-heading"
        />
      </div>

      {showSearchResults && (headerSearch.trim().length >= 2 || isSearching) && (
        <div className="theme-surface-strong absolute left-0 right-0 top-full mt-2 rounded-xl overflow-hidden z-40">
          {isSearching ? (
            <div className="px-4 py-3 text-sm theme-muted">Searching...</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <div className="border-b border-slate-100 px-4 py-2 text-xs uppercase tracking-wide text-slate-400">Patients</div>
              {searchResults.patients.length === 0 ? (
                <div className="px-4 py-3 text-sm theme-muted">No patient matches</div>
              ) : (
                searchResults.patients.map((patient) => (
                  <Link
                    key={patient.id}
                    href={`/dashboard/patients/${patient.id}`}
                    prefetch={false}
                    onClick={() => {
                      setShowSearchResults(false);
                    }}
                    className="theme-nav-result block w-full border-b border-slate-100 px-4 py-3 text-left"
                  >
                    <p className="text-sm theme-heading">{patient.full_name}</p>
                    <p className="text-xs theme-muted">{patient.phone}</p>
                  </Link>
                ))
              )}

              {(isFullAccessRole(currentUser?.role) || isReceptionRole(currentUser?.role)) && (
                <>
                  <div className="border-b border-t border-slate-100 px-4 py-2 text-xs uppercase tracking-wide text-slate-400">Doctors</div>
                  {searchResults.doctors.length === 0 ? (
                    <div className="px-4 py-3 text-sm theme-muted">No doctor matches</div>
                  ) : (
                    searchResults.doctors.map((doctor) => (
                      <Link
                        key={doctor.id}
                        href={`/dashboard/doctors?q=${encodeURIComponent(doctor.full_name)}`}
                        prefetch={false}
                        onClick={() => {
                          setShowSearchResults(false);
                        }}
                        className="theme-nav-result block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0"
                      >
                        <p className="text-sm theme-heading">{doctor.full_name}</p>
                        <p className="text-xs theme-muted">{doctor.specialty}</p>
                      </Link>
                    ))
                  )}
                </>
              )}

              <button
                type="button"
                onClick={submitHeaderSearch}
                className="theme-action-button block w-full px-4 py-3 text-left text-sm text-emerald-700 hover:bg-emerald-50"
              >
                Search all for &quot;{headerSearch.trim()}&quot;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
