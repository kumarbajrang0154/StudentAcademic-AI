"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { MentorShell } from "@/components/mentor/mentor-shell";
import { RiskBadge, RiskLevel } from "@/components/student/risk-badge";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Calendar,
  RefreshCw,
  Activity,
  ShieldAlert,
} from "lucide-react";

interface MenteeAlert {
  studentId: string;
  rollNumber: string;
  name: string;
  email: string;
  worstRiskCategory: RiskLevel;
  reasons: string[];
  attendanceRate: number;
  masteryScore: number;
  velocity: number;
}

interface OverviewResponse {
  overview: {
    countsByRisk: { critical: number; moderate: number; safe: number };
    needsAttention: MenteeAlert[];
    avgAttendance: number;
    avgMastery: number;
    upcomingInterventionsCount: number;
    unreadNotificationsCount: number;
  };
}

function VelocityIcon({ v }: { v: number }) {
  if (v > 1) return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  if (v < -1) return <TrendingDown className="w-4 h-4 text-rose-400" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col gap-1">
      <span className="text-xs text-slate-500 font-medium tracking-wide uppercase">
        {label}
      </span>
      <span className={`text-3xl font-bold ${color ?? "text-white"}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

export default function MentorDashboardPage() {
  const { user } = useAuth();
  const hour = new Date().getHours();
  const firstName = user?.name?.split(" ")[0] ?? "Mentor";
  const greeting =
    hour < 12
      ? `Good morning, ${firstName}`
      : hour < 17
        ? `Good afternoon, ${firstName}`
        : `Good evening, ${firstName}`;

  const { data, isLoading, error, refetch } = useQuery<OverviewResponse>({
    queryKey: ["mentor-overview"],
    queryFn: async () => {
      const r = await apiFetch("/api/v1/mentor/overview");
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    },
    staleTime: 60_000,
  });

  const ov = data?.overview;

  return (
    <MentorShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{greeting}</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Here&apos;s an overview of your mentees&apos; academic health.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 px-3 py-1.5 rounded-xl border border-slate-700/60 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-300 text-sm">
            Failed to load overview: {(error as Error).message}
          </div>
        )}

        {/* Stats Row */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 h-24 animate-pulse"
              />
            ))}
          </div>
        ) : ov ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              label="Critical"
              value={ov.countsByRisk.critical}
              color="text-rose-400"
              sub="mentees"
            />
            <StatCard
              label="Moderate"
              value={ov.countsByRisk.moderate}
              color="text-amber-400"
              sub="mentees"
            />
            <StatCard
              label="Safe"
              value={ov.countsByRisk.safe}
              color="text-emerald-400"
              sub="mentees"
            />
            <StatCard
              label="Avg Attendance"
              value={`${Math.round(ov.avgAttendance)}%`}
              color={ov.avgAttendance >= 75 ? "text-emerald-400" : "text-amber-400"}
            />
            <StatCard
              label="Avg Mastery"
              value={`${Math.round(ov.avgMastery)}%`}
              color={ov.avgMastery >= 60 ? "text-indigo-400" : "text-amber-400"}
            />
          </div>
        ) : null}

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/mentor/mentees"
            id="btn-view-mentees"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600/15 border border-teal-500/30 text-teal-300 text-sm font-medium hover:bg-teal-600/25 transition"
          >
            <Users className="w-4 h-4" />
            View all mentees
          </Link>
          <Link
            href="/mentor/interventions"
            id="btn-view-interventions"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 text-sm font-medium hover:bg-indigo-600/25 transition"
          >
            <Calendar className="w-4 h-4" />
            Interventions
            {ov && ov.upcomingInterventionsCount > 0 && (
              <span className="bg-indigo-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {ov.upcomingInterventionsCount}
              </span>
            )}
          </Link>
        </div>

        {/* Needs Attention */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-semibold text-white">
              Needs Attention
            </h2>
            {ov && (
              <span className="text-xs text-slate-500">
                ({ov.needsAttention.length} mentee
                {ov.needsAttention.length !== 1 ? "s" : ""})
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-2xl bg-slate-900/40 border border-slate-800/60 animate-pulse"
                />
              ))}
            </div>
          ) : ov?.needsAttention.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl px-6 py-8 text-center text-slate-500">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">All mentees are on track — great work!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ov?.needsAttention.map((m) => (
                <Link
                  key={m.studentId}
                  href={`/mentor/mentees/${m.studentId}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-teal-500/30 hover:bg-slate-900/80 transition group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-teal-700 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {m.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">
                          {m.name}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {m.rollNumber}
                        </span>
                        <RiskBadge
                          category={m.worstRiskCategory}
                          size="sm"
                          showIcon={false}
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
                        <span>Att: {Math.round(m.attendanceRate)}%</span>
                        <span>Mastery: {Math.round(m.masteryScore)}%</span>
                        <span className="flex items-center gap-0.5">
                          <VelocityIcon v={m.velocity} />
                          {m.velocity > 0 ? "+" : ""}
                          {m.velocity.toFixed(1)}%/wk
                        </span>
                      </div>
                      {m.reasons.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {m.reasons.join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-teal-400 transition shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </MentorShell>
  );
}
