"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import BrandLogo from "../../components/BrandLogo";

type ApiMessage = { success: boolean; message: string };

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

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
      const response = await apiRequest<ApiMessage>("/auth/verify-email", {
        method: "POST",
        body: { email, token }
      });
      setMessage(response.message);
      const params = new URLSearchParams();
      if (email) {
        params.set("email", email);
      }
      params.set("verified", "1");
      window.setTimeout(() => {
        router.replace(`/auth/signin?${params.toString()}`);
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify email");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError("");
    setMessage("");
    setResending(true);

    try {
      const response = await apiRequest<ApiMessage>("/auth/resend-verification", {
        method: "POST",
        body: { email }
      });
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend verification");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="theme-auth-bg min-h-screen flex items-center justify-center p-4">
      <div className="theme-surface w-full max-w-md rounded-2xl p-8">
        <div className="text-center mb-6">
          <div className="mb-4 flex justify-center">
            <BrandLogo size={72} className="rounded-[20px] shadow-[0_0_36px_rgba(16,185,129,0.24)]" priority />
          </div>
          <h1 className="text-2xl theme-heading">Verify Email</h1>
          <p className="theme-copy mt-1 text-sm">Enter your email and verification token.</p>
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
            placeholder="Verification token"
            className="theme-input w-full px-4 py-3 rounded-lg"
          />

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="theme-button-primary w-full py-3 rounded-lg disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Verify Email"}
          </button>

          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="theme-button-secondary w-full py-3 rounded-lg disabled:opacity-60"
          >
            {resending ? "Resending..." : "Resend Token"}
          </button>
        </form>

        <p className="text-center text-sm theme-copy mt-6">
          Continue to <Link href="/auth/signin" className="text-emerald-600">Sign In</Link>
        </p>
      </div>
    </div>
  );
}

