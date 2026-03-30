"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Mail, Phone, User, Lock, EyeOff, Eye } from "lucide-react";
import { apiRequest } from "@/lib/api";
import BrandLogo from "../../components/BrandLogo";

const roles = [
  { id: "admin", label: "Clinic Admin", icon: Building2 },
  { id: "receptionist", label: "Receptionist", icon: Building2 },
  { id: "doctor", label: "Doctor", icon: User },
  { id: "nurse", label: "Nurse", icon: User },
  { id: "billing", label: "Billing Staff", icon: User },
  { id: "management", label: "Hospital Management", icon: Building2 }
];

type SignupResponse = {
  success: boolean;
  message: string;
  data: {
    email: string;
  };
};

export default function SignUp() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "",
    hospitalName: "",
    password: "",
    confirmPassword: "",
    agreeToTerms: false
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const response = await apiRequest<SignupResponse>("/auth/signup", {
        method: "POST",
        body: {
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          hospitalName: formData.hospitalName,
          password: formData.password
        }
      });

      setSuccessMessage(response.message || "Account created. Verify your email before signing in.");
      router.push(`/auth/verify-email?email=${encodeURIComponent(response.data.email)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign up";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="theme-auth-bg min-h-screen flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <BrandLogo size={80} className="rounded-[22px] shadow-[0_0_40px_rgba(16,185,129,0.28)]" priority />
          </div>
          <h1 className="text-3xl theme-heading mb-2">Create Your Account</h1>
          <p className="theme-copy">Join medsyra to manage your practice efficiently</p>
        </div>

        <div className="theme-surface rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm theme-copy mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="theme-input w-full pl-10 pr-4 py-3 rounded-lg"
                    placeholder="Dr. John"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm theme-copy mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="theme-input w-full pl-10 pr-4 py-3 rounded-lg"
                    placeholder="john@gmail.com"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm theme-copy mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="theme-input w-full pl-10 pr-4 py-3 rounded-lg"
                    placeholder="+91 9876543210"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm theme-copy mb-2">Hospital / Clinic Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={formData.hospitalName}
                    onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                    className="theme-input w-full pl-10 pr-4 py-3 rounded-lg"
                    placeholder="City General Hospital"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm theme-copy mb-3">Select Your Role</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer ${
                      formData.role === role.id
                        ? "border-emerald-500 bg-emerald-50 text-slate-900"
                        : "border-slate-200 bg-white/70 text-slate-900"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.id}
                      checked={formData.role === role.id}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      required
                    />
                    <role.icon className="w-5 h-5 text-slate-700" />
                    <span className="text-sm text-slate-900">{role.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm theme-copy mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="theme-input w-full pl-10 pr-10 py-3 rounded-lg"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-500"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm theme-copy mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="theme-input w-full pl-10 pr-10 py-3 rounded-lg"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-slate-500"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <label className="flex items-center text-sm theme-copy">
              <input
                type="checkbox"
                checked={formData.agreeToTerms}
                onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
                className="mr-2"
                required
              />
              <span className="ml-2 text-sm theme-copy">
                I agree to the <a href="#" className="text-emerald-600 hover:text-emerald-700">Terms of Service</a>
                {" "}and{" "}
                <a href="#" className="text-emerald-600 hover:text-emerald-700">Privacy Policy</a>
              </span>
            </label>

            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
            {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="theme-button-primary w-full py-3 rounded-lg disabled:opacity-60"
            >
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm theme-copy mt-6">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-emerald-600 hover:text-emerald-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

