"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { isFullAccessRole } from "@/lib/roles";
import { useBranch } from "@/app/context/BranchContext";
import { useAuth } from "@/app/context/AuthContext";

export default function DashboardBranchSelector() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { selectedBranchId, selectedBranchLabel, branches, setSelectedBranchId } = useBranch();

  if (!currentUser) {
    return null;
  }

  const handleBranchSelection = (value: string) => {
    const normalized = value || null;
    setSelectedBranchId(normalized);
    router.refresh();
  };

  return (
    <div className="hidden lg:flex items-center gap-2 rounded-lg border border-white/50 bg-white/70 px-3 py-2">
      <Building2 className="h-4 w-4 text-emerald-700" />
      {isFullAccessRole(currentUser.role) ? (
        <select
          value={selectedBranchId || "all"}
          onChange={(e) => handleBranchSelection(e.target.value)}
          className="bg-transparent text-sm text-slate-700 outline-none"
        >
          <option value="all">All Branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-slate-700">{selectedBranchLabel}</span>
      )}
    </div>
  );
}
