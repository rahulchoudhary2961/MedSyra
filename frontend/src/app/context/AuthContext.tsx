"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiRequestError, apiRequest } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { clearGuestMode, isGuestModeEnabled } from "@/lib/guest-mode";
import { clearLoginIntroPending } from "@/lib/onboarding";
import { clearSelectedBranchId } from "@/lib/branch-selection";
import { AuthUser } from "@/types/api";

type MeResponse = {
  success: boolean;
  data: AuthUser;
};

type AuthContextValue = {
  currentUser: AuthUser | null;
  isLoading: boolean;
  refreshAuth: () => Promise<AuthUser | null>;
  signOut: () => Promise<void>;
  setCurrentUser: Dispatch<SetStateAction<AuthUser | null>>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const guestUser: AuthUser = {
  id: "22222222-2222-2222-2222-222222222222",
  organization_id: "11111111-1111-1111-1111-111111111111",
  organization_name: "City General Hospital",
  full_name: "Dr. Admin",
  email: "admin@citygeneral.com",
  phone: "(555) 101-0000",
  role: "admin",
  branch_id: null,
  branch_name: null
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    if (isGuestModeEnabled()) {
      setCurrentUser(guestUser);
      setIsLoading(false);
      return guestUser;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest<MeResponse>("/auth/me", { authenticated: true });
      setCurrentUser(response.data);
      return response.data;
    } catch (error) {
      if (error instanceof ApiRequestError && [401, 403].includes(error.status)) {
        clearAuthToken();
        setCurrentUser(null);
        router.replace("/auth/signin");
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const signOut = useCallback(async () => {
    try {
      if (!isGuestModeEnabled()) {
        await apiRequest<{ success: boolean; message: string }>("/auth/logout", {
          method: "POST",
          authenticated: true
        });
      }
    } catch {
      // Ignore logout failures and clear the local session anyway.
    } finally {
      clearAuthToken();
      clearGuestMode();
      clearLoginIntroPending();
      clearSelectedBranchId();
      setCurrentUser(null);
      router.replace("/auth/signin");
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, refreshAuth, signOut, setCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
