"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { MentorShell } from "@/components/mentor/mentor-shell";
import { RiskBadge, RiskLevel } from "@/components/student/risk-badge";
import {
  Search,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Filter,
} from "lucide-react";

interface MenteeListItem {
  studentId: string;
  rollNumber: string;
  name: string;
  email: string;
  overallAttendance: number;
  mastery: number;
  worstRiskCategory: RiskLevel;
  coursesAtRiskCount: number;
  velocityBand: string;
  lastInterventionDate: string | null;
}

interface MenteesResponse {
  mentees: MenteeListItem[];
}

const RISK_OPTIONS = [
  { label: "All", value: "" },
  { label: "Critical", value: "CRITICAL" },
  { label: "Moderate", value: "MODERATE" },
  { label: "Safe", value: "SAFE" },
];

const SORT_OPTIONS = [
  { label: "Worst Risk First", value: "risk" },
  { label: "Name A–Z", value: "name" },
  { label: "Lowest Attendance", value: "attendance" },
  { label: "Lowest Mastery", value: "mastery" },
];

function VelocityBand({ band }: { band: string }) {
  switch (band) {
    case "IMPROVING":
      return (
        <span className="flex items-center gap-1 text-emerald-400 text-xs">
          <TrendingUp className="w-3.5 h-3.5" />
          Improving
        </span>
      );
    case "DECLINING":
      return (
        <span className="flex items-center gap-1 text-amber-400 text-xs">
          <TrendingDown className="w-3.5 h-3.5" />
          Declining
        </span>
      );
    case "STEEP_DECLINE":
      return (
        <span className="flex items-center gap-1 text-rose-400 text-xs">
          <TrendingDown className="w-3.5 h-3.5" />
          Steep Decline
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-slate-400 text-xs">
          <Minus className="w-3.5 h-3.5" />
          Stable
        </span>
      );
  }
}

export default function MenteesPage() {
  const [search, setSearch] = useState("");
  const [risk, setRisk] = useState("");
  const [sort, setSort] = useState("risk");

  const { data, isLoading, error } = useQuery<MenteesResponse>({
    queryKey: ["mentor-mentees", search, risk, sort],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (risk) params.set("risk", risk);
      if (sort) params.set("sort", sort);
      const r = await apiFetch(`/api/v1/mentor/mentees?${params.toString()}`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    },
    staleTime: 30_000,
  });

  const mentees = data?.mentees ?? [];

  return (
    <MentorShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-400" />
            My Mentees
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor academic progress and intervene early.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              id="mentees-search"
              type="text"
              placeholder="Search by name, roll number or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition"
            />
          </div>

          {/* Risk filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <select
              id="mentees-risk-filter"
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              className="pl-9 pr-8 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500/50 transition appearance-none"
            >
              {RISK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <select
            id="mentees-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500/50 transition appearance-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-300 text-sm">
            {(error as Error).message}
          </div>
        )}

        {/* Table / List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-2xl bg-slate-900/40 border border-slate-800/60 animate-pulse"
              />
            ))}
          </div>
        ) : mentees.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl px-6 py-10 text-center text-slate-500">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No mentees match your filters.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mentees.map((m) => (
              <Link
                key={m.studentId}
                href={`/mentor/mentees/${m.studentId}`}
                id={`mentee-card-${m.studentId}`}
                className="flex items-center justify-between gap-4 px-5 py-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl hover:border-teal-500/30 hover:bg-slate-900/90 transition group"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-teal-700 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {m.name.charAt(0)}
                  </div>

                  {/* Name & Roll */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {m.name}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {m.rollNumber}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {m.email}
                    </p>
                  </div>

                  {/* Stats - hidden on xs */}
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    <div className="text-center">
                      <p
                        className={`text-sm font-bold ${
                          m.overallAttendance >= 75
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {Math.round(m.overallAttendance)}%
                      </p>
                      <p className="text-[10px] text-slate-500">Attendance</p>
                    </div>
                    <div className="text-center">
                      <p
                        className={`text-sm font-bold ${
                          m.mastery >= 60 ? "text-indigo-400" : "text-amber-400"
                        }`}
                      >
                        {Math.round(m.mastery)}%
                      </p>
                      <p className="text-[10px] text-slate-500">Mastery</p>
                    </div>
                    <div className="text-center">
                      <VelocityBand band={m.velocityBand} />
                      <p className="text-[10px] text-slate-500 mt-0.5">Trend</p>
                    </div>
                  </div>

                  {/* Risk Badge */}
                  <div className="shrink-0">
                    <RiskBadge
                      category={m.worstRiskCategory}
                      size="sm"
                    />
                    {m.coursesAtRiskCount > 0 && (
                      <p className="text-[10px] text-slate-500 text-center mt-0.5">
                        {m.coursesAtRiskCount} course
                        {m.coursesAtRiskCount !== 1 ? "s" : ""} at risk
                      </p>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-teal-400 transition shrink-0" />
              </Link>
            ))}
          </div>
        )}

        {/* Count */}
        {!isLoading && mentees.length > 0 && (
          <p className="text-xs text-slate-500 text-center">
            Showing {mentees.length} mentee{mentees.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </MentorShell>
  );
}
