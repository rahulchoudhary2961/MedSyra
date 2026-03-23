"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { apiRequest } from "@/lib/api";

type ApiMessage = { success: boolean; message: string };

export default function VerifyEmailPage() {
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
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-cyan-600 rounded-2xl mb-4">
            <Heart className="w-7 h-7 text-white" fill="white" />
          </div>
          <h1 className="text-2xl text-gray-900">Verify Email</h1>
          <p className="text-gray-600 mt-1 text-sm">Enter your email and verification token.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          />
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            placeholder="Verification token"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          />

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Verify Email"}
          </button>

          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="w-full py-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            {resending ? "Resending..." : "Resend Token"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Continue to <Link href="/auth/signin" className="text-cyan-600">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
