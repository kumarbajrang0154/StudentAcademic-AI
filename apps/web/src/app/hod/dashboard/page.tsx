"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  RefreshCw,
  Send,
  Loader2,
  CheckCircle,
  HelpCircle,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";

interface KPIItem {
  value?: number | string;
  count?: number | string;
  rate?: number | string;
  distinctCriticalStudents?: number;
  thresholdPercent?: number;
  percentOfCohort?: number | string;
  compliantAssessments?: number;
  totalPastDueAssessments?: number;
  bottleneckCount?: number;
  definition: string;
  sampleSize?: number;
}

interface OverviewData {
  department: { id: string; code: string; name: string } | null;
  kpis: {
    retentionRiskIndex: KPIItem;
    projectedDebarments: KPIItem;
    curriculumBottlenecks: KPIItem;
    markEntryCompliance: KPIItem;
  };
  attendanceTrend: Array<{
    date: string;
    rate: number | null;
    target: number;
  }>;
  riskDistribution: Array<{
    courseId: string;
    code: string;
    name: string;
    total: number;
    safe: number;
    moderate: number;
    critical: number;
    safePct: number;
    moderatePct: number;
    criticalPct: number;
  }>;
  escalationQueue: Array<{
    id: string;
    studentId: string;
    studentName: string;
    studentEmail: string;
    rollNumber: string;
    triggerReason: string;
    severity: string;
    status: string;
    triggeredAt: string;
  }>;
}

export default function HodDashboardPage() {
  const searchParams = useSearchParams();
  const departmentId = searchParams.get("departmentId");

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Escalation Modal
  const [escalateModalOpen, setEscalateModalOpen] = useState(false);
  const [targetStudentId, setTargetStudentId] = useState("");
  const [escalateReason, setEscalateReason] = useState("");
  const [escalateSeverity, setEscalateSeverity] = useState<"STANDARD" | "SEVERE">("STANDARD");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["IN_APP", "EMAIL"]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [escalateSuccess, setEscalateSuccess] = useState<string | null>(null);

  // Resolve Modal
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [targetCaseId, setTargetCaseId] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = departmentId
        ? `/api/v1/hod/overview?departmentId=${encodeURIComponent(departmentId)}`
        : "/api/v1/hod/overview";

      const res = await apiFetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load department overview (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load department overview");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTriggerEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStudentId) return;

    setIsSubmitting(true);
    try {
      const res = await apiFetch("/api/v1/hod/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: targetStudentId,
          reason: escalateReason.trim() || undefined,
          severity: escalateSeverity,
          triggerChannels: selectedChannels,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to trigger escalation");
      }

      setEscalateSuccess("Tier-1 Escalation triggered successfully.");
      setTimeout(() => {
        setEscalateModalOpen(false);
        setEscalateSuccess(null);
        setTargetStudentId("");
        setEscalateReason("");
        fetchData();
      }, 1500);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Escalation failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCaseId || resolutionNote.trim().length < 5) return;

    setIsResolving(true);
    try {
      const res = await apiFetch(`/api/v1/hod/escalations/${targetCaseId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "RESOLVED",
          resolutionNote: resolutionNote.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to resolve escalation");
      }

      setResolveModalOpen(false);
      setTargetCaseId("");
      setResolutionNote("");
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Resolution failed");
    } finally {
      setIsResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500 mb-3" />
        <p className="text-sm font-medium">Loading departmental metrics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <h2 className="text-base font-semibold text-rose-200">Department Telemetry Error</h2>
          </div>
          <p className="text-sm text-rose-300/90 mb-4">{error || "Failed to retrieve telemetry data"}</p>
          <button
            onClick={() => fetchData()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600/30 hover:bg-rose-600/40 text-rose-200 text-xs font-semibold border border-rose-500/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Query
          </button>
        </div>
      </div>
    );
  }

  const { kpis, attendanceTrend, riskDistribution, escalationQueue } = data;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">Department Overview & Risk</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
              {data.department?.code || "CSE"}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time curriculum health, student retention risk, and faculty compliance indicators.
          </p>
        </div>

        <button
          onClick={() => fetchData()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Students at Risk */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Students at Risk</span>
            <div className="relative">
              <button
                onClick={() => setActiveTooltip(activeTooltip === "kpi1" ? null : "kpi1")}
                className="text-slate-500 hover:text-slate-300 p-0.5"
                title="Definition"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              {activeTooltip === "kpi1" && (
                <div className="absolute right-0 top-6 w-64 p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-slate-300 shadow-xl z-20">
                  {kpis.retentionRiskIndex.definition}
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tracking-tight">
              {kpis.retentionRiskIndex.value !== "n/a" ? `${kpis.retentionRiskIndex.value}%` : "n/a"}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              <span className="text-rose-400 font-semibold">{kpis.retentionRiskIndex.distinctCriticalStudents ?? 0}</span> students critical in ≥1 course
            </p>
          </div>
        </div>

        {/* KPI 2: Projected Debarments */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Projected Debarments</span>
            <div className="relative">
              <button
                onClick={() => setActiveTooltip(activeTooltip === "kpi2" ? null : "kpi2")}
                className="text-slate-500 hover:text-slate-300 p-0.5"
                title="Definition"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              {activeTooltip === "kpi2" && (
                <div className="absolute right-0 top-6 w-64 p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-slate-300 shadow-xl z-20">
                  {kpis.projectedDebarments.definition}
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tracking-tight">
              {kpis.projectedDebarments.count ?? "n/a"}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Attendance &lt; 75% ({kpis.projectedDebarments.percentOfCohort !== "n/a" ? `${kpis.projectedDebarments.percentOfCohort}% of cohort` : "n/a"})
            </p>
          </div>
        </div>

        {/* KPI 3: Curriculum Bottlenecks */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Curriculum Bottlenecks</span>
            <div className="relative">
              <button
                onClick={() => setActiveTooltip(activeTooltip === "kpi3" ? null : "kpi3")}
                className="text-slate-500 hover:text-slate-300 p-0.5"
                title="Definition"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              {activeTooltip === "kpi3" && (
                <div className="absolute right-0 top-6 w-64 p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-slate-300 shadow-xl z-20">
                  {kpis.curriculumBottlenecks.definition}
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tracking-tight">
              {kpis.curriculumBottlenecks.bottleneckCount ?? "n/a"}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Units with &lt; 60% class question mastery
            </p>
          </div>
        </div>

        {/* KPI 4: Mark-Entry Compliance */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400">Mark-Entry Compliance</span>
            <div className="relative">
              <button
                onClick={() => setActiveTooltip(activeTooltip === "kpi4" ? null : "kpi4")}
                className="text-slate-500 hover:text-slate-300 p-0.5"
                title="Definition"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              {activeTooltip === "kpi4" && (
                <div className="absolute right-0 top-6 w-64 p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-[11px] text-slate-300 shadow-xl z-20">
                  {kpis.markEntryCompliance.definition}
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white tracking-tight">
              {kpis.markEntryCompliance.rate !== "n/a" ? `${kpis.markEntryCompliance.rate}%` : "n/a"}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Graded within 7 days ({kpis.markEntryCompliance.compliantAssessments ?? 0}/{kpis.markEntryCompliance.totalPastDueAssessments ?? 0})
            </p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Trend (14 days with 75% target line) */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Attendance Trend (14 Days)</h3>
              <p className="text-xs text-slate-400">Cohort attendance against 75% regulatory requirement</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-sky-400">
                <span className="w-2.5 h-0.5 bg-sky-400 rounded-full" /> Actual %
              </span>
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="w-2.5 h-0.5 bg-rose-400 rounded-full border-dashed" /> 75% Line
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={attendanceTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} stroke="#64748b" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", fontSize: "12px" }}
                  formatter={(val: any) => [`${val}%`, "Attendance Rate"]}
                />
                <ReferenceLine y={75} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: "75% Target", fill: "#f43f5e", fontSize: 10 }} />
                <Line type="monotone" dataKey="rate" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: "#38bdf8" }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Distribution per Course */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Course Risk Distribution</h3>
              <p className="text-xs text-slate-400">Distribution across Safe, Moderate, and Critical bands</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Safe
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Moderate
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Critical
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="code" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.75rem", fontSize: "12px" }}
                />
                <Bar dataKey="safe" name="Safe" fill="#10b981" stackId="a" />
                <Bar dataKey="moderate" name="Moderate" fill="#f59e0b" stackId="a" />
                <Bar dataKey="critical" name="Critical" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Escalation Queue */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Tier-1 Escalation Queue</h3>
            <p className="text-xs text-slate-400">Active escalations requiring departmental action or review</p>
          </div>
          <button
            onClick={() => setEscalateModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition-all self-start sm:self-auto"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Trigger Tier-1 Escalation
          </button>
        </div>

        {escalationQueue.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800 text-slate-400 text-xs">
            <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
            No active escalations in this department. All student trajectories are within normal bands.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="pb-3 pl-2">Student</th>
                  <th className="pb-3">Roll No</th>
                  <th className="pb-3">Reason</th>
                  <th className="pb-3">Severity</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Triggered</th>
                  <th className="pb-3 text-right pr-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {escalationQueue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-2">
                      <div className="font-semibold text-slate-200">{item.studentName}</div>
                      <div className="text-[11px] text-slate-400">{item.studentEmail}</div>
                    </td>
                    <td className="py-3 text-slate-300">{item.rollNumber}</td>
                    <td className="py-3 text-slate-300 max-w-xs truncate" title={item.triggerReason}>
                      {item.triggerReason}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          item.severity === "SEVERE"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {item.severity}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 text-slate-400 text-[11px]">
                      {new Date(item.triggeredAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right pr-2">
                      <button
                        onClick={() => {
                          setTargetCaseId(item.id);
                          setResolveModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium transition-colors"
                      >
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trigger Escalation Modal */}
      {escalateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" /> Trigger Tier-1 Department Escalation
            </div>
            <p className="text-xs text-slate-400">
              Dispatches multi-channel notification and holds calendar slot for high-risk academic intervention.
            </p>

            {escalateSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                {escalateSuccess}
              </div>
            )}

            <form onSubmit={handleTriggerEscalation} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                  Student User ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. cuid-student01"
                  value={targetStudentId}
                  onChange={(e) => setTargetStudentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                  Escalation Reason
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Consecutive critical assessments and attendance breach"
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                    Severity
                  </label>
                  <select
                    value={escalateSeverity}
                    onChange={(e) => setEscalateSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="SEVERE">SEVERE (Fast-track)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                    Channels
                  </label>
                  <div className="text-[11px] text-slate-300 space-y-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes("IN_APP")}
                        onChange={(e) =>
                          setSelectedChannels((prev) =>
                            e.target.checked ? [...prev, "IN_APP"] : prev.filter((c) => c !== "IN_APP"),
                          )
                        }
                      />
                      In-App Alert
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes("EMAIL")}
                        onChange={(e) =>
                          setSelectedChannels((prev) =>
                            e.target.checked ? [...prev, "EMAIL"] : prev.filter((c) => c !== "EMAIL"),
                          )
                        }
                      />
                      Email Notification
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEscalateModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Dispatch Escalation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Escalation Modal */}
      {resolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white">Resolve Escalation Case</h3>
            <p className="text-xs text-slate-400">
              Document resolution rationale and action plan taken with faculty or academic mentor.
            </p>

            <form onSubmit={handleResolveEscalation} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                  Resolution Note (min 5 chars)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Conducted intervention session with mentor; remediated Unit 2 curriculum gaps."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResolving || resolutionNote.trim().length < 5}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Confirm Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
