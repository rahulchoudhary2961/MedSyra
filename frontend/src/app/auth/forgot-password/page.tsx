"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { apiRequest } from "@/lib/api";
import BrandLogo from "../../components/BrandLogo";

type ApiMessage = { success: boolean; message: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await apiRequest<ApiMessage>("/auth/request-password-reset", {
        method: "POST",
        body: { email }
      });
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-6">
          <div className="mb-4 flex justify-center">
            <BrandLogo size={72} className="rounded-[20px] shadow-[0_0_36px_rgba(16,185,129,0.24)]" priority />
          </div>
          <h1 className="text-2xl text-gray-900">Reset Password</h1>
          <p className="text-gray-600 mt-1 text-sm">Enter your email to receive a reset token.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg"
            />
          </div>

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send Reset Token"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Have a token?{" "}
          <Link href={`/auth/reset-password?email=${encodeURIComponent(email)}`} className="text-emerald-600">
            Reset Password
          </Link>
          {" "}or{" "}
          <Link href="/auth/signin" className="text-emerald-600">Sign In</Link>
        </p>
      </div>
    </div>
  );
}

