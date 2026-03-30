"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/api";
import BrandLogo from "../../components/BrandLogo";

type ApiMessage = { success: boolean; message: string };

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailFromQuery = params.get("email") || "";
    setEmail(emailFromQuery);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await apiRequest<ApiMessage>("/auth/reset-password", {
        method: "POST",
        body: { email, token, newPassword }
      });
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="theme-auth-bg min-h-screen flex items-center justify-center p-4">
      <div className="theme-surface w-full max-w-md rounded-2xl p-8">
        <div className="text-center mb-6">
          <div className="mb-4 flex justify-center">
            <BrandLogo size={72} className="rounded-[20px] shadow-[0_0_36px_rgba(16,185,129,0.24)]" priority />
          </div>
          <h1 className="text-2xl theme-heading">Set New Password</h1>
          <p className="theme-copy mt-1 text-sm">Enter email, reset token and a new password.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="theme-input w-full px-4 py-3 rounded-lg"
          />
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            placeholder="Reset token"
            className="theme-input w-full px-4 py-3 rounded-lg"
          />
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="New password"
              className="theme-input w-full px-4 py-3 rounded-lg pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-3"
            >
              {showPassword ? <EyeOff className="w-5 h-5 text-slate-400" /> : <Eye className="w-5 h-5 text-slate-400" />}
            </button>
          </div>

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="theme-button-primary w-full py-3 rounded-lg disabled:opacity-60"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        <p className="text-center text-sm theme-copy mt-6">
          Back to <Link href="/auth/signin" className="text-emerald-600">Sign In</Link>
        </p>
      </div>
    </div>
  );
}

