"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Mic,
  LogOut,
  GraduationCap,
  Loader2,
} from "lucide-react";

interface FacultyShellProps {
  children: React.ReactNode;
}

export function FacultyShell({ children }: FacultyShellProps) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        // Logged-out users go to /login?next=<path>
        const next = encodeURIComponent(pathname);
        router.push(`/login?next=${next}`);
      } else if (user.role === "STUDENT") {
        // A STUDENT is redirected to /student/dashboard
        router.push("/student/dashboard");
      } else if (user.role === "MENTOR") {
        // MENTOR is redirected to /mentor/dashboard
        router.push("/mentor/dashboard");
      }
      // Allowed: FACULTY, HOD, ADMIN
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading || !user || user.role === "STUDENT" || user.role === "MENTOR") {
    return (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Note: isMentor can only be true when role === MENTOR, which is redirected above.
  // We keep it as a string check for the portal label display.
  const isMentor = (user.role as string) === "MENTOR";

  const navItems = [
    {
      href: "/faculty/dashboard",
      label: "Courses & Cohorts",
      icon: LayoutDashboard,
    },
    {
      href: "/faculty/voice-entry",
      label: "Voice Entry (SCR-03)",
      icon: Mic,
      badge: "AI Live",
    },
  ];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "FACULTY":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
      case "MENTOR":
        return "bg-teal-500/10 text-teal-400 border-teal-500/20";
      case "HOD":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "ADMIN":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-xl shrink-0 min-h-screen sticky top-0 h-screen">
        {/* Brand */}
        <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-cyan-600 to-indigo-500 text-white rounded-xl shadow-md shadow-cyan-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white block">
              Student Academic AI
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              {isMentor ? "Mentor Portal" : "Faculty Portal"}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/faculty/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition group ${
                  isActive
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition ${
                      isActive
                        ? "text-indigo-400"
                        : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-inner">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-white truncate">
                  {user.name}
                </span>
                <span className="block text-[11px] text-slate-400 truncate">
                  {user.email}
                </span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span
              className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${getRoleBadge(
                user.role,
              )}`}
            >
              {user.role}
            </span>
            <span className="truncate">Dept: CSE</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-cyan-600 text-white rounded-lg">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-xs text-white block">
                Student Academic AI
              </span>
              <span className="text-[10px] text-slate-400">
                {isMentor ? "Mentor Portal" : "Faculty Portal"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${getRoleBadge(
                user.role,
              )}`}
            >
              {user.role}
            </span>
            <button
              onClick={() => logout()}
              className="p-1 text-slate-400 hover:text-rose-400"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/90 backdrop-blur-xl z-50 flex items-center justify-around p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/faculty/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg text-[10px] font-medium transition ${
                isActive ? "text-cyan-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
