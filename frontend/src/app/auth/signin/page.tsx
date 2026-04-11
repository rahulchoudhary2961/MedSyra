"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, EyeOff, Eye } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { clearAuthToken, setAuthToken, setFrontendSessionMarker } from "@/lib/auth";
import { clearGuestMode, enableGuestMode } from "@/lib/guest-mode";
import { markLoginIntroPending } from "@/lib/onboarding";
import BrandLogo from "../../components/BrandLogo";

type SigninResponse = {
  success: boolean;
  data: {
    token: string;
    user: {
      full_name: string;
      role: string;
    };
  };
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await apiRequest<SigninResponse>("/auth/signin", {
        method: "POST",
        body: {
          email: formData.email,
          password: formData.password
        }
      });

      clearGuestMode();
      clearAuthToken();
      setAuthToken(response.data.token);
      setFrontendSessionMarker();
      markLoginIntroPending();
      const callbackUrl = searchParams.get("callbackUrl");
      const safeDestination = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
      router.push(safeDestination);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueAsGuest = () => {
    enableGuestMode();
    clearAuthToken();
    markLoginIntroPending();
    const callbackUrl = searchParams.get("callbackUrl");
    const safeDestination = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
    router.push(safeDestination);
  };

  return (
    <div className="theme-auth-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <BrandLogo size={80} className="rounded-[22px] shadow-[0_0_40px_rgba(16,185,129,0.28)]" priority />
          </div>

          <h1 className="text-3xl theme-heading mb-2">Welcome Back</h1>
          <p className="theme-copy">Sign in to your medsyra account</p>
        </div>

        <div className="theme-surface rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm theme-copy mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="theme-input w-full pl-10 pr-4 py-3 rounded-lg"
                  placeholder="doctor@hospital.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm theme-copy mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="theme-input w-full pl-10 pr-12 py-3 rounded-lg"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-slate-400" />
                  ) : (
                    <Eye className="w-5 h-5 text-slate-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm theme-copy">Remember me</span>
              </label>

              <Link href="/auth/forgot-password" className="text-sm text-emerald-600 hover:text-emerald-700">
                Forgot password?
              </Link>
            </div>

            {errorMessage && (
              <div className="space-y-2">
                <p className="text-sm text-red-600">{errorMessage}</p>
                <p className="text-xs theme-muted">
                  If you have not verified your email yet, go to {" "}
                  <Link href="/auth/verify-email" className="text-emerald-600">Verify Email</Link>.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="theme-button-primary w-full py-3 rounded-lg disabled:opacity-60"
            >
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>

            <button
              type="button"
              onClick={continueAsGuest}
              className="w-full rounded-lg border border-emerald-200 bg-white py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              Continue as Guest
            </button>
          </form>

          <p className="text-center text-sm theme-copy mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-emerald-600 hover:text-emerald-700">
              Sign Up
            </Link>
          </p>
        </div>

        <p className="text-center text-sm theme-muted mt-6">
          By signing in, you agree to our <a className="text-emerald-600">Terms</a> and{" "}
          <a className="text-emerald-600">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

