"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Heart, Mail, Phone, User, Lock, EyeOff, Eye } from "lucide-react";
import { apiRequest } from "@/lib/api";

const roles = [
  { id: "admin", label: "Clinic Admin / Reception", icon: Building2 },
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
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-teal-50 flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-600 rounded-2xl mb-4">
            <Heart className="w-8 h-8 text-white" fill="white" />
          </div>
          <h1 className="text-3xl text-gray-900 mb-2">Create Your Account</h1>
          <p className="text-gray-600">Join medsyra to manage your practice efficiently</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border rounded-lg"
                    placeholder="Dr. John"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border rounded-lg"
                    placeholder="john@gmail.com"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border rounded-lg"
                    placeholder="+91 9876543210"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Hospital / Clinic Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.hospitalName}
                    onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border rounded-lg"
                    placeholder="City General Hospital"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-3">Select Your Role</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {roles.map((role) => (
                  <label
                    key={role.id}
                    className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer ${
                      formData.role === role.id ? "border-cyan-500 bg-cyan-50" : "border-gray-200"
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
                    <role.icon className="w-5 h-5" />
                    <span className="text-sm">{role.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-10 pr-10 py-3 border rounded-lg"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full pl-10 pr-10 py-3 border rounded-lg"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <label className="flex items-center text-sm text-gray-600">
              <input
                type="checkbox"
                checked={formData.agreeToTerms}
                onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
                className="mr-2"
                required
              />
              <span className="ml-2 text-sm text-gray-600">
                I agree to the <a href="#" className="text-cyan-600 hover:text-cyan-700">Terms of Service</a>
                {" "}and{" "}
                <a href="#" className="text-cyan-600 hover:text-cyan-700">Privacy Policy</a>
              </span>
            </label>

            {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
            {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-60"
            >
              {isSubmitting ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-cyan-600 hover:text-cyan-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
