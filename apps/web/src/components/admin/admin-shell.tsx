"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  AlertTriangle,
  Users,
  BookOpen,
  TrendingUp,
  Shield,
  MessageSquare,
  Award,
  Building,
  LogOut,
  GraduationCap,
  Loader2,
  Menu,
  X,
  Globe,
} from "lucide-react";

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAuthorizedRole = user?.role === "HOD" || user?.role === "ADMIN";

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        // Logged-out users go to /login?next=<path>
        const next = encodeURIComponent(pathname);
        router.push(`/login?next=${next}`);
      } else if (user.role === "STUDENT") {
        router.push("/student/dashboard");
      } else if (user.role === "FACULTY") {
        router.push("/faculty/dashboard");
      } else if (user.role === "MENTOR") {
        router.push("/mentor/dashboard");
      } else if (!isAuthorizedRole) {
        router.push("/unauthorized");
      }
    }
  }, [user, isLoading, isAuthorizedRole, pathname, router]);

  if (isLoading || !user || !isAuthorizedRole) {
    return (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const isAdmin = user.role === "ADMIN";

  const navItems = [
    {
      href: "/admin/dashboard",
      label: "Overview & Risk",
      icon: LayoutDashboard,
      badge: "SCR-04",
    },
    {
      href: "/admin/escalations",
      label: "Escalation Queue",
      icon: AlertTriangle,
    },
    {
      href: "/admin/students",
      label: "Student Monitoring",
      icon: Users,
    },
    {
      href: "/admin/courses",
      label: "Courses & Compliance",
      icon: BookOpen,
    },
    {
      href: "/admin/accreditation",
      label: "Accreditation (OBE)",
      icon: Award,
    },
    {
      href: "/admin/reports",
      label: "Reports & Exports",
      icon: TrendingUp,
    },
    {
      href: "/admin/efficacy",
      label: "Intervention Efficacy",
      icon: TrendingUp,
    },
    {
      href: "/admin/settings",
      label: "RBAC & Audit Logs",
      icon: Shield,
    },
  ];

  const comingSoonItems = [
    {
      label: "Parent Gateway",
      icon: MessageSquare,
      tooltip: "Guardian portal & SMS/WhatsApp gateway (Module 8)",
    },
  ];

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-xl shrink-0 min-h-screen sticky top-0 h-screen z-40">
        {/* Brand */}
        <div className="p-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-amber-600 to-indigo-600 text-white rounded-xl shadow-md shadow-indigo-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white block">
              Student Academic AI
            </span>
            <span className="text-[11px] font-medium text-amber-400">
              {isAdmin ? "Institutional Admin" : "HOD Portal"}
            </span>
          </div>
        </div>

        {/* Scope Indicator Pill */}
        <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
            {isAdmin ? <Globe className="w-3 h-3 text-emerald-400" /> : <Building className="w-3 h-3 text-amber-400" />}
            Active Scope
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">
              {isAdmin ? "Global (All Departments)" : "CSE Department"}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
              isAdmin ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"
            }`}>
              {isAdmin ? "ALL" : "CSE"}
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Institutional Ops
          </div>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? "text-indigo-400" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Module 8 Coming Next Stubs */}
          <div className="pt-4 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Module 8 (Next)
          </div>
          {comingSoonItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                title={item.tooltip}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-slate-400 bg-slate-900/20 border border-slate-800/40 cursor-not-allowed select-none"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-slate-400" />
                  <span>{item.label}</span>
                </div>
                <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  Coming next
                </span>
              </div>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.name}</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded border ${
                  isAdmin ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>
                  {user.role}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-tr from-amber-600 to-indigo-600 text-white rounded-lg">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-xs text-white">Student Academic AI</span>
            <span className="text-[10px] text-amber-400 block">{user.role} Portal</span>
          </div>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-400 hover:text-white rounded-lg bg-slate-900 border border-slate-800"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-xl pt-16 px-4 pb-8 flex flex-col justify-between">
          <nav className="space-y-1.5 overflow-y-auto">
            <div className="px-3 py-2 mb-2 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-300 font-medium">Scope:</span>
              <span className="text-xs font-bold text-amber-400">
                {isAdmin ? "Global (All Departments)" : "CSE Department"}
              </span>
            </div>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium ${
                    isActive
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
            <button
              onClick={() => logout()}
              className="px-3 py-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
