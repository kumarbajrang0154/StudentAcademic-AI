"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  Clipboard,
  LogOut,
  GraduationCap,
  Loader2,
  Bell,
  X,
  CheckCheck,
} from "lucide-react";

interface MentorShellProps {
  children: React.ReactNode;
}

interface NotifItem {
  id: string;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
}

interface NotifResponse {
  notifications: NotifItem[];
  pagination: { unreadCount: number };
}

function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<NotifResponse>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await apiFetch("/api/v1/notifications?limit=15");
      if (!r.ok) throw new Error("Failed to load notifications");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiFetch("/api/v1/notifications/read-all", { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unread = data?.pagination?.unreadCount ?? 0;
  const notifs = data?.notifications ?? [];

  return (
    <div className="relative">
      <button
        id="notif-bell-btn"
        onClick={() => setOpen((p) => !p)}
        className="relative p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            id="notif-panel"
            className="absolute right-0 top-10 w-80 sm:w-96 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-white">Notifications</span>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-800">
              {notifs.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-8">
                  No notifications
                </p>
              )}
              {notifs.map((n) => (
                <div
                  key={n.id}
                  onClick={() => n.readAt === null && markRead.mutate(n.id)}
                  className={`px-4 py-3 cursor-pointer transition hover:bg-slate-800/60 ${
                    n.readAt === null ? "bg-indigo-500/5 border-l-2 border-indigo-500" : ""
                  }`}
                >
                  <p
                    className={`text-xs font-semibold mb-0.5 ${
                      n.readAt === null ? "text-white" : "text-slate-300"
                    }`}
                  >
                    {n.title}
                  </p>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function MentorShell({ children }: MentorShellProps) {
  const { user, isLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        const next = encodeURIComponent(pathname);
        router.push(`/login?next=${next}`);
      } else if (user.role === "STUDENT") {
        router.push("/student/dashboard");
      } else if (user.role === "FACULTY") {
        router.push("/faculty/dashboard");
      }
      // Allowed: MENTOR, ADMIN (read-only)
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading || !user || user.role === "STUDENT" || user.role === "FACULTY") {
    return (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  const navItems = [
    {
      href: "/mentor/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      href: "/mentor/mentees",
      label: "My Mentees",
      icon: Users,
    },
    {
      href: "/mentor/interventions",
      label: "Interventions",
      icon: Clipboard,
    },
  ];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "MENTOR":
        return "bg-teal-500/10 text-teal-400 border-teal-500/20";
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
          <div className="p-2 bg-gradient-to-tr from-teal-600 to-indigo-500 text-white rounded-xl shadow-md shadow-teal-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white block">
              Student Academic AI
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              Mentor Portal
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/mentor/dashboard" &&
                pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition group ${
                  isActive
                    ? "bg-teal-600/15 text-teal-400 border border-teal-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition ${
                    isActive
                      ? "text-teal-400"
                      : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-inner">
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
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-teal-600 text-white rounded-lg">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-xs text-white block">
                Student Academic AI
              </span>
              <span className="text-[10px] text-slate-400">Mentor Portal</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
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

        {/* Desktop top bar with notification bell */}
        <div className="hidden md:flex items-center justify-end px-8 pt-4 gap-3">
          <NotificationBell />
        </div>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/90 backdrop-blur-xl z-50 flex items-center justify-around p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/mentor/dashboard" &&
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 p-1.5 rounded-lg text-[10px] font-medium transition ${
                isActive ? "text-teal-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => logout()}
          className="flex flex-col items-center gap-1 p-1.5 rounded-lg text-[10px] font-medium text-slate-400 hover:text-rose-400 transition"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </nav>
    </div>
  );
}
