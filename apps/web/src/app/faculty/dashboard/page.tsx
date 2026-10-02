"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  BookOpen,
  LogOut,
  Users,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export default function FacultyDashboard() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login");
      } else if (user.role === "STUDENT") {
        // Enforce role restriction: student cannot open faculty dashboard
        router.push("/unauthorized");
      }
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role === "STUDENT") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  const firstName = user.name.split(" ")[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-600/20 text-cyan-400 rounded-lg">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white">Student Academic AI</h1>
            <p className="text-xs text-slate-400">Faculty & Mentor Portal</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-white">{user.name}</p>
            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded-full border border-cyan-500/30">
              {user.role}
            </span>
          </div>
          <button
            onClick={() => logout()}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Welcome, {firstName}
          </h2>
          <p className="text-slate-400 mt-1">
            Course teaching roster, attendance logs, and early risk indicators.
          </p>
        </div>

        {/* Quick Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-400">Assigned Courses</span>
              <BookOpen className="w-5 h-5 text-cyan-400" />
            </div>
            <p className="text-3xl font-bold text-white">2</p>
            <p className="text-xs text-cyan-400 mt-2">CS101, CS103 Active</p>
          </div>

          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-400">Enrolled Students</span>
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-white">40</p>
            <p className="text-xs text-emerald-400 mt-2">All students mapped</p>
          </div>

          <div className="p-6 bg-slate-900/80 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-slate-400">Pending Interventions</span>
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-3xl font-bold text-amber-400">1</p>
            <p className="text-xs text-slate-400 mt-2">Student 40 Attendance Check-in</p>
          </div>
        </div>

        <div className="p-6 bg-slate-900/50 border border-slate-800/80 rounded-xl">
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            RBAC Guard Enforced
          </h3>
          <p className="text-sm text-slate-300">
            Student roles cannot access this portal and are immediately routed to the 403 Unauthorized view.
          </p>
        </div>
      </main>
    </div>
  );
}
