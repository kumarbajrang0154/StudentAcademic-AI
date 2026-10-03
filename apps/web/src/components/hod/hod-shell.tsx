"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  AlertTriangle,
  Users,
  BookOpen,
  TrendingUp,
  Award,
  LogOut,
  GraduationCap,
  Loader2,
  Menu,
  X,
  Building,
} from "lucide-react";

interface HodShellProps {
  children: React.ReactNode;
}

export function HodShell({ children }: HodShellProps) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAuthorizedRole = user?.role === "HOD" || user?.role === "ADMIN";

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
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
  const deptParam = searchParams.get("departmentId");
  const querySuffix = isAdmin && deptParam ? `?departmentId=${encodeURIComponent(deptParam)}` : "";

  const navItems = [
    {
      href: `/hod/dashboard${querySuffix}`,
      basePath: "/hod/dashboard",
      label: "Overview & Risk",
      icon: LayoutDashboard,
    },
    {
      href: `/hod/escalations${querySuffix}`,
      basePath: "/hod/escalations",
      label: "Escalation Queue",
      icon: AlertTriangle,
    },
    {
      href: `/hod/students${querySuffix}`,
      basePath: "/hod/students",
      label: "Student Dossiers",
      icon: Users,
    },
    {
      href: `/hod/faculty${querySuffix}`,
      basePath: "/hod/faculty",
      label: "Faculty Progress",
      icon: Award,
    },
    {
      href: `/hod/courses${querySuffix}`,
      basePath: "/hod/courses",
      label: "Courses & Compliance",
      icon: BookOpen,
    },
    {
      href: `/hod/accreditation${querySuffix}`,
      basePath: "/hod/accreditation",
      label: "Accreditation (OBE)",
      icon: Award,
    },
    {
      href: `/hod/reports${querySuffix}`,
      basePath: "/hod/reports",
      label: "Reports & Exports",
      icon: TrendingUp,
    },
    {
      href: `/hod/efficacy${querySuffix}`,
      basePath: "/hod/efficacy",
      label: "Intervention Efficacy",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col md:flex-row pb-20 md:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-xl shrink-0 min-h-screen sticky top-0 h-screen z-40">
        <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">
                HOD PORTAL
              </span>
              <span className="text-[10px] text-sky-400 font-medium tracking-wider uppercase block">
                Academic Governance
              </span>
            </div>
          </div>
        </div>

        {/* Locked Department Chip */}
        <div className="mx-4 mt-4 p-2.5 rounded-lg bg-sky-950/30 border border-sky-500/20 flex items-center gap-2">
          <Building className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <div className="text-[11px] font-semibold text-slate-200 truncate">
              {isAdmin ? "Institutional Scope" : "Computer Science & Eng"}
            </div>
            <div className="text-[10px] text-sky-400 font-medium">
              {isAdmin ? "Admin Support Mode" : "Locked to Department"}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.basePath || pathname.startsWith(item.basePath + "/");
            return (
              <Link
                key={item.basePath}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                  isActive
                    ? "bg-sky-600/15 text-sky-300 border border-sky-500/30 shadow-sm shadow-sky-950"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive
                        ? "text-sky-400"
                        : "text-slate-500 group-hover:text-slate-300"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800/60 bg-slate-950/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 truncate">
              <div className="w-8 h-8 rounded-full bg-sky-600/20 border border-sky-500/30 flex items-center justify-center text-xs font-semibold text-sky-300">
                {user.name.charAt(0)}
              </div>
              <div className="truncate">
                <div className="text-xs font-semibold text-slate-200 truncate">
                  {user.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {user.email}
                </div>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden border-b border-slate-800 bg-slate-950/90 backdrop-blur-md p-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-600 text-white">
            <GraduationCap className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">
            HOD PORTAL
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[57px] bg-slate-950/95 border-b border-slate-800 p-4 z-40 space-y-2 backdrop-blur-xl">
          <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-500/20 text-xs text-sky-300 mb-2">
            Department Scope: Computer Science & Engineering
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.basePath;
            return (
              <Link
                key={item.basePath}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium ${
                  isActive
                    ? "bg-sky-600/20 text-sky-300 border border-sky-500/30"
                    : "text-slate-400 hover:bg-slate-900 text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-400">{user.email}</span>
            <button
              onClick={() => logout()}
              className="text-xs text-rose-400 flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#090D16]">{children}</main>
    </div>
  );
}
