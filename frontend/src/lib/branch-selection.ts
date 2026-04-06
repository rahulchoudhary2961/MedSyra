const BRANCH_STORAGE_KEY = "medsyra_selected_branch_id";

export const getSelectedBranchId = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(BRANCH_STORAGE_KEY);
};

export const setSelectedBranchId = (branchId: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  if (!branchId) {
    window.localStorage.removeItem(BRANCH_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
};

export const clearSelectedBranchId = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(BRANCH_STORAGE_KEY);
};
