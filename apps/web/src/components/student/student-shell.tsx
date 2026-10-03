"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import {
  LayoutDashboard,
  Clock,
  BookOpen,
  Sparkles,
  BarChart2,
  Calendar,
  LogOut,
  GraduationCap,
  Loader2,
  Bell,
  CheckCheck,
  X,
} from "lucide-react";

interface StudentShellProps {
  children: React.ReactNode;
}

const navItems = [
  {
    href: "/student/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    href: "/student/attendance",
    label: "Attendance",
    icon: Clock,
  },
  {
    href: "/student/academics/subjects",
    label: "Academics",
    icon: BookOpen,
  },
  {
    href: "/student/academics/prescriptions",
    label: "Prescriptions",
    icon: Sparkles,
  },
  {
    href: "/student/benchmarks",
    label: "Benchmarks",
    icon: BarChart2,
  },
  {
    href: "/student/calendar",
    label: "Calendar",
    icon: Calendar,
  },
];

export function StudentShell({ children }: StudentShellProps) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const rollNumber = user.email.startsWith("student")
    ? `2026-CS-${user.email.slice(7, 9)}`
    : null;

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-xl shrink-0 min-h-screen sticky top-0 h-screen">
        {/* Brand */}
        <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white rounded-xl shadow-md shadow-indigo-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white block">
              Student Academic AI
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              Student Workspace
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/student/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-950"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? "text-indigo-400" : "text-slate-400"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Card & Logout in Sidebar Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-300 font-semibold text-xs shrink-0">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {user.name}
                </p>
                <p className="text-[10px] font-mono text-slate-400 truncate">
                  {rollNumber || user.email}
                </p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Log out"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition shrink-0"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm text-white">Student Academic AI</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
              {rollNumber || user.name.split(" ")[0]}
            </span>
            <button
              onClick={() => logout()}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-slate-950/95 backdrop-blur-xl px-2 py-1.5 flex items-center justify-around"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/student/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition ${
                isActive ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium tracking-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
