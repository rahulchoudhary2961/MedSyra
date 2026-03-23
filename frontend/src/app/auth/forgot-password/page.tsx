"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Heart } from "lucide-react";
import { apiRequest } from "@/lib/api";

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
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-cyan-600 rounded-2xl mb-4">
            <Heart className="w-7 h-7 text-white" fill="white" />
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
            className="w-full py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send Reset Token"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Have a token?{" "}
          <Link href={`/auth/reset-password?email=${encodeURIComponent(email)}`} className="text-cyan-600">
            Reset Password
          </Link>
          {" "}or{" "}
          <Link href="/auth/signin" className="text-cyan-600">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
