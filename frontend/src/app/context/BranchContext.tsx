"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { clearSelectedBranchId, getSelectedBranchId, setSelectedBranchId } from "@/lib/branch-selection";
import { isFullAccessRole } from "@/lib/roles";
import { AuthUser, Branch } from "@/types/api";
import { useAuth } from "./AuthContext";

type BranchesResponse = {
  success: boolean;
  data: {
    items: Branch[];
  };
};

type BranchContextValue = {
  branches: Branch[];
  selectedBranchId: string | null;
  selectedBranchLabel: string;
  isLoadingBranches: boolean;
  setSelectedBranchId: Dispatch<SetStateAction<string | null>>;
  refreshBranches: () => Promise<void>;
};

const BranchContext = createContext<BranchContextValue | null>(null);

const resolveBranchLabel = (branchId: string | null, branches: Branch[], currentUser: AuthUser | null) =>
  branchId === "all"
    ? "All Branches"
    : branches.find((branch) => branch.id === branchId)?.name || currentUser?.branch_name || "Current Branch";

export function BranchProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  const refreshBranches = useCallback(async () => {
    if (!currentUser) {
      setBranches([]);
      setSelectedBranchIdState(null);
      clearSelectedBranchId();
      return;
    }

    if (!isFullAccessRole(currentUser.role)) {
      const lockedBranchId = currentUser.branch_id || null;
      setBranches([]);
      setSelectedBranchIdState(lockedBranchId);
      if (lockedBranchId) {
        setSelectedBranchId(lockedBranchId);
      } else {
        clearSelectedBranchId();
      }
      return;
    }

    setIsLoadingBranches(true);
    try {
      const response = await apiRequest<BranchesResponse>("/branches?activeOnly=true", { authenticated: true });
      const items = response.data.items || [];
      setBranches(items);

      const stored = getSelectedBranchId();
      const hasStored = stored === "all" || items.some((branch) => branch.id === stored);
      const fallback = currentUser.branch_id && items.some((branch) => branch.id === currentUser.branch_id)
        ? currentUser.branch_id
        : items[0]?.id || "all";
      const nextSelection = hasStored ? stored : fallback;

      setSelectedBranchIdState(nextSelection);
      if (nextSelection) {
        setSelectedBranchId(nextSelection);
      } else {
        clearSelectedBranchId();
      }
    } catch {
      setBranches([]);
      setSelectedBranchIdState(currentUser.branch_id || "all");
    } finally {
      setIsLoadingBranches(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void refreshBranches();
  }, [refreshBranches]);

  useEffect(() => {
    if (!currentUser || isFullAccessRole(currentUser.role)) {
      return;
    }

    const lockedBranchId = currentUser.branch_id || null;
    setSelectedBranchIdState(lockedBranchId);
  }, [currentUser]);

  const setSelectedBranchIdValue = useCallback((value: SetStateAction<string | null>) => {
    setSelectedBranchIdState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      if (next) {
        setSelectedBranchId(next);
      } else {
        clearSelectedBranchId();
      }
      return next;
    });
  }, []);

  const selectedBranchLabel = resolveBranchLabel(selectedBranchId, branches, currentUser);

  return (
    <BranchContext.Provider
      value={{
        branches,
        selectedBranchId,
        selectedBranchLabel,
        isLoadingBranches,
        setSelectedBranchId: setSelectedBranchIdValue,
        refreshBranches
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error("useBranch must be used within BranchProvider");
  }

  return context;
}
