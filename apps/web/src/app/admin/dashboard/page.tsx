"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import {
  Shield,
  Users,
  GraduationCap,
  Building,
  BookOpen,
  AlertTriangle,
  Play,
  RefreshCw,
  FileText,
  CheckCircle,
  Database,
  ArrowRight,
  Activity,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface SystemOverviewData {
  health: {
    database: string;
    timestamp: string;
  };
  counts: {
    byRole: {
      STUDENT: { active: number; inactive: number; total: number };
      FACULTY: { active: number; inactive: number; total: number };
      MENTOR: { active: number; inactive: number; total: number };
      HOD: { active: number; inactive: number; total: number };
      ADMIN: { active: number; inactive: number; total: number };
    };
    totalUsers: number;
    activeUsers: number;
    departments: number;
    courses: number;
    enrollments: number;
    openEscalations: number;
  };
  lastAnalysisRun: {
    id: string;
    triggeredAt: string;
    completedAt?: string;
    status: string;
    studentsEvaluated?: number;
    alertsGenerated?: number;
    durationMs?: number;
  } | null;
  recentAuditEntries: Array<{
    id: string;
    entity: string;
    entityId: string;
    action: string;
    justification: string | null;
    createdAt: string;
    modifiedBy: {
      id: string;
      name: string;
      email: string;
      role: string;
    } | null;
  }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<SystemOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analysis run trigger
  const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/v1/admin/overview");
      if (!res.ok) {
        throw new Error(`Failed to load system overview (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load system overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunAnalysis = async () => {
    try {
      setIsRunningAnalysis(true);
      setAnalysisResult(null);
      const res = await apiFetch("/api/v1/admin/analysis/run", {
        method: "POST",
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to trigger analysis run");
      }
      const json = await res.json();
      setAnalysisResult(
        `Analysis completed successfully! ${json.studentsEvaluated ?? 0} students evaluated, ${
          json.alertsGenerated ?? 0
        } alerts generated.`,
      );
      await fetchData();
    } catch (err: unknown) {
      setAnalysisResult(
        `Error: ${err instanceof Error ? err.message : "Failed to run analysis"}`,
      );
    } finally {
      setIsRunningAnalysis(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/20">
              <Shield className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Institutional Admin Console
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Full System Access
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            System health, user directory lifecycle, department governance, and scheduled telemetry.
          </p>
        </div>

        {/* Top actions & DB health */}
        <div className="flex flex-wrap items-center gap-3">
          {/* DB Health Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Database:</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-850 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error state with retry */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs text-rose-200">{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="p-16 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs">Loading institutional telemetry...</span>
        </div>
      )}

      {data && (
        <>
          {/* High Level Entity Overview Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
                <Users className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-bold text-white">{data.counts.totalUsers}</div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                <span className="text-emerald-400 font-medium">{data.counts.activeUsers} active</span>
                <span>•</span>
                <span className="text-slate-500">{data.counts.totalUsers - data.counts.activeUsers} deactivated</span>
              </div>
            </div>

            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Departments</span>
                <Building className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-2xl font-bold text-white">{data.counts.departments}</div>
              <div className="text-[11px] text-slate-400 mt-1">
                Academic programs & governance units
              </div>
            </div>

            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Active Enrollments</span>
                <GraduationCap className="w-4 h-4 text-violet-400" />
              </div>
              <div className="text-2xl font-bold text-white">{data.counts.enrollments}</div>
              <div className="text-[11px] text-slate-400 mt-1">
                Across {data.counts.courses} active courses
              </div>
            </div>

            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Open Escalations</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-amber-400">{data.counts.openEscalations}</div>
              <div className="text-[11px] text-slate-400 mt-1">
                Requiring review or intervention
              </div>
            </div>
          </div>

          {/* Role Distribution Matrix */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  User Accounts by Role
                </h3>
                <p className="text-xs text-slate-400">
                  Breakdown of active and inactive accounts in the institution.
                </p>
              </div>
              <Link
                href="/admin/users"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition"
              >
                Manage Directory <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(
                [
                  { role: "STUDENT", label: "Students", icon: GraduationCap, color: "sky" },
                  { role: "FACULTY", label: "Faculty", icon: BookOpen, color: "violet" },
                  { role: "MENTOR", label: "Mentors", icon: Users, color: "emerald" },
                  { role: "HOD", label: "HODs", icon: Building, color: "amber" },
                  { role: "ADMIN", label: "Admins", icon: Shield, color: "rose" },
                ] as const
              ).map(({ role, label, icon: RoleIcon }) => {
                const count = data.counts.byRole[role] || { active: 0, inactive: 0, total: 0 };
                return (
                  <div
                    key={role}
                    className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1"
                  >
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                      <RoleIcon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </div>
                    <div className="text-lg font-bold text-white">{count.total}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <span className="text-emerald-400">{count.active} active</span>
                      {count.inactive > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-rose-400">{count.inactive} inactive</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Continuous Analysis Engine Card */}
          <div className="bg-gradient-to-r from-indigo-950/40 to-slate-900/60 border border-indigo-500/20 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
                  <Activity className="w-4 h-4" />
                  Autonomous Risk Telemetry
                </div>
                <h3 className="text-lg font-bold text-white">
                  Continuous Academic Analysis Engine
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Computes 4-component risk scores, triggers Tier-1 alerts, and flags curriculum bottlenecks.
                </p>
              </div>

              <button
                onClick={handleRunAnalysis}
                disabled={isRunningAnalysis}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50 shrink-0"
              >
                {isRunningAnalysis ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                Run Analysis Now
              </button>
            </div>

            {analysisResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  analysisResult.startsWith("Error")
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                }`}
              >
                {analysisResult.startsWith("Error") ? (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{analysisResult}</span>
              </div>
            )}

            {data.lastAnalysisRun && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Last Execution</span>
                  <span className="text-slate-300 font-medium">
                    {new Date(data.lastAnalysisRun.triggeredAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Students Scanned</span>
                  <span className="text-slate-300 font-bold">
                    {data.lastAnalysisRun.studentsEvaluated ?? "All cohorts"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Alerts Generated</span>
                  <span className="text-amber-400 font-bold">
                    {data.lastAnalysisRun.alertsGenerated ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-semibold">Status</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {data.lastAnalysisRun.status}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Recent Audit Trail Stream */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  Recent Audit Trail
                </h3>
                <p className="text-xs text-slate-400">
                  Immutable record of user creation, role modifications, and system interventions.
                </p>
              </div>
              <Link
                href="/admin/audit"
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition"
              >
                View Full Audit <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Entity</th>
                    <th className="py-3 px-4">Action & Justification</th>
                    <th className="py-3 px-4">Modified By</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {data.recentAuditEntries.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {log.entity}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-100">{log.action}</div>
                      </td>
                      <td className="py-3 px-4">
                        {log.modifiedBy ? (
                          <div>
                            <div className="text-slate-200">{log.modifiedBy.name}</div>
                            <div className="text-[10px] text-slate-500">{log.modifiedBy.role}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500">System</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {data.recentAuditEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500">
                        No audit log entries recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
