"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  GraduationCap,
  BookOpen,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  Loader2,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, demoLogin } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const routeByRole = (role: string) => {
    switch (role) {
      case "STUDENT":
        return "/student/dashboard";
      case "FACULTY":
      case "MENTOR":
        return "/faculty/dashboard";
      case "HOD":
      case "ADMIN":
        return "/admin/dashboard";
      default:
        return "/student/dashboard";
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await login(email, password);
    setIsSubmitting(false);

    if (res.success) {
      // Determine redirection based on email prefix or redirect to role dashboard
      if (email.startsWith("student")) router.push("/student/dashboard");
      else if (email.startsWith("faculty") || email.startsWith("mentor"))
        router.push("/faculty/dashboard");
      else router.push("/admin/dashboard");
    } else {
      setError(res.error || "Invalid email or password");
    }
  };

  const handleDemoClick = async (
    role: "STUDENT" | "FACULTY" | "HOD" | "ADMIN",
  ) => {
    setError(null);
    setLoadingRole(role);

    const res = await demoLogin(role);
    setLoadingRole(null);

    if (res.success && res.user) {
      router.push(routeByRole(res.user.role));
    } else {
      setError(res.error || "Demo login failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-indigo-600/20 text-indigo-400 rounded-xl mb-3">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Student Academic AI
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Predictive academic monitoring & early intervention
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-lg flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleManualLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student01@demo.edu"
              required
              className="w-full px-3.5 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full px-3.5 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Sign In <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="relative my-8 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700"></div>
          </div>
          <span className="relative px-3 bg-slate-800 text-xs font-medium text-slate-400 uppercase tracking-wider">
            Or quick demo login
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleDemoClick("STUDENT")}
            disabled={Boolean(loadingRole)}
            className="flex items-center justify-center gap-2 p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-medium text-slate-200 transition hover:border-indigo-400 group disabled:opacity-50"
          >
            {loadingRole === "STUDENT" ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            ) : (
              <GraduationCap className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition" />
            )}
            <span>Student Demo</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemoClick("FACULTY")}
            disabled={Boolean(loadingRole)}
            className="flex items-center justify-center gap-2 p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-medium text-slate-200 transition hover:border-cyan-400 group disabled:opacity-50"
          >
            {loadingRole === "FACULTY" ? (
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            ) : (
              <BookOpen className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition" />
            )}
            <span>Faculty Demo</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemoClick("HOD")}
            disabled={Boolean(loadingRole)}
            className="flex items-center justify-center gap-2 p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-medium text-slate-200 transition hover:border-amber-400 group disabled:opacity-50"
          >
            {loadingRole === "HOD" ? (
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-amber-400 group-hover:scale-110 transition" />
            )}
            <span>HOD Demo</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemoClick("ADMIN")}
            disabled={Boolean(loadingRole)}
            className="flex items-center justify-center gap-2 p-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-xl text-xs font-medium text-slate-200 transition hover:border-emerald-400 group disabled:opacity-50"
          >
            {loadingRole === "ADMIN" ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
            )}
            <span>Admin Demo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
