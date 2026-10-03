"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  RefreshCw,
  Send,
  Loader2,
  ShieldAlert,
  Layers,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";

interface KPI {
  value: number;
  unit: string;
  sampleSize: number;
  definition: string;
  deltaVs7Days: number | null;
}

interface OverviewData {
  departmentScope: string;
  kpis: {
    retentionRiskIndex: KPI;
    projectedDebarments: KPI;
    curriculumBottlenecks: KPI;
    interventionSuccessRate: KPI;
    markEntryCompliance: KPI;
  };
  attendanceTrend14Days: Array<{
    date: string;
    rate: number;
    minimumTarget: number;
  }>;
  courseRiskDistribution: Array<{
    courseCode: string;
    courseName: string;
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  }>;
  escalationsQueue: Array<{
    studentId: string;
    name: string;
    email: string;
    department: string;
    criticalCourseCount: number;
    riskDrivers: string[];
    activeCase: {
      id: string;
      tier: number;
      status: string;
      severity: string;
      dispatchedAt: string | null;
    } | null;
  }>;
}

interface JobStatusData {
  id: string;
  status: string;
  targetCount?: number;
  completedCount?: number;
  notificationsCount?: number;
  deduplicated?: boolean;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Escalation Modal State
  const [escalateModalOpen, setEscalateModalOpen] = useState(false);
  const [targetStudentId, setTargetStudentId] = useState<string>("");
  const [escalateReason, setEscalateReason] = useState("");
  const [escalateSeverity, setEscalateSeverity] = useState<"STANDARD" | "SEVERE">("STANDARD");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["IN_APP", "EMAIL"]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusData | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<boolean>(false);

  // Continuous Analysis State
  const [lastRun, setLastRun] = useState<{
    id: string;
    startedAt: string;
    finishedAt?: string;
    status: string;
    enrollmentsProcessed: number;
    newWarnings: number;
    newCriticals: number;
  } | null>(null);
  const [runningAnalysis, setRunningAnalysis] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/v1/admin/overview");
      if (!res.ok) {
        throw new Error(`Failed to load institutional overview (${res.status})`);
      }
      const json = await res.json();
      if (json.charts) {
        json.attendanceTrend14Days = json.charts.attendanceTrend || [];
        json.courseRiskDistribution = json.charts.riskDistribution || [];
      }
      setData(json);

      // Fetch last analysis run
      try {
        const runRes = await apiFetch("/api/v1/admin/analysis/runs");
        if (runRes.ok) {
          const runJson = await runRes.json();
          if (runJson.runs && runJson.runs.length > 0) {
            setLastRun(runJson.runs[0]);
          }
        }
      } catch {
        // Non-critical
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const handleRunAnalysisNow = async () => {
    setRunningAnalysis(true);
    try {
      const res = await apiFetch("/api/v1/admin/analysis/run", { method: "POST" });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Continuous analysis failed");
      }
      const json = await res.json();
      setLastRun(json.result);
      alert(`Continuous Analysis Completed!\n• Enrollments Processed: ${json.result.enrollmentsProcessed}\n• New Attendance Warnings: ${json.result.newWarnings}\n• New Critical Alerts: ${json.result.newCriticals}`);
      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Analysis run failed");
    } finally {
      setRunningAnalysis(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Poll Dispatch Job
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (pollingJobId) {
      interval = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/v1/admin/jobs/${pollingJobId}`);
          if (res.ok) {
            const result = await res.json();
            setJobStatus(result.job);
            if (result.job.status === "DONE" || result.job.status === "FAILED") {
              clearInterval(interval);
              setIsSubmitting(false);
              if (result.job.status === "DONE") {
                setDispatchSuccess(true);
                fetchData();
              }
            }
          }
        } catch (err) {
          console.error("Job poll error", err);
        }
      }, 700);
    }
    return () => clearInterval(interval);
  }, [pollingJobId]);

  const handleOpenEscalateModal = (studentId?: string) => {
    if (studentId) setTargetStudentId(studentId);
    else if (data?.escalationsQueue && data.escalationsQueue.length > 0) {
      setTargetStudentId(data.escalationsQueue[0]!.studentId);
    }
    setEscalateReason("");
    setEscalateSeverity("STANDARD");
    setSelectedChannels(["IN_APP", "EMAIL"]);
    setPollingJobId(null);
    setJobStatus(null);
    setDispatchSuccess(false);
    setEscalateModalOpen(true);
  };

  const handleChannelToggle = (channel: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
  };

  const handleSubmitEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStudentId) return;

    setIsSubmitting(true);
    setJobStatus(null);
    setDispatchSuccess(false);

    try {
      const res = await apiFetch("/api/v1/admin/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: targetStudentId,
          reason: escalateReason || "Institutional academic intervention required.",
          severity: escalateSeverity,
          triggerChannels: selectedChannels,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to trigger escalation");
      }

      const resData = await res.json();
      setPollingJobId(resData.jobId);
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Escalation failed");
      setIsSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
        <span>Loading institutional telemetry...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 max-w-xl">
          <div className="flex items-center gap-2 font-bold mb-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            Telemetry Error
          </div>
          <p className="text-sm">{error || "Failed to retrieve telemetry data."}</p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-rose-600/30 hover:bg-rose-600/40 border border-rose-500/30 rounded-lg text-xs font-semibold text-white transition"
          >
            Retry Request
          </button>
        </div>
      </div>
    );
  }

  const kpis = data.kpis;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Institutional Risk & Governance
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              SCR-04
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Analysis runs after every attendance/marks save and daily. Automated retention telemetry, compliance tracking, and escalation dispatch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {lastRun && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  lastRun.status === "COMPLETED" ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                }`}
              />
              <span>
                Last analysis run:{" "}
                <strong className="text-white">
                  {new Date(lastRun.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </strong>{" "}
                <span className="text-slate-500">({lastRun.status})</span> • {lastRun.enrollmentsProcessed} processed
              </span>
            </div>
          )}

          <button
            onClick={handleRunAnalysisNow}
            disabled={runningAnalysis}
            className="px-3.5 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
            title="Run continuous analysis across all courses now"
          >
            {runningAnalysis ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Run Analysis Now
          </button>

          <button
            onClick={fetchData}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs flex items-center gap-2 transition"
            title="Refresh Telemetry"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => handleOpenEscalateModal()}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition"
          >
            <AlertTriangle className="w-4 h-4" />
            Trigger Tier-1 Escalation
          </button>
        </div>
      </div>

      {/* 5 KPI Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Retention Risk Index */}
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl relative group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Retention Risk</span>
            <button
              onMouseEnter={() => setActiveTooltip("kpi-risk")}
              onMouseLeave={() => setActiveTooltip(null)}
              className="text-slate-500 hover:text-slate-300"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-white">
              {kpis.retentionRiskIndex.value}%
            </span>
            <span className="text-xs text-slate-400">cohort</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-slate-400">Δ 7d:</span>
            <span className="text-slate-400 font-mono">
              {kpis.retentionRiskIndex.deltaVs7Days !== null
                ? `${kpis.retentionRiskIndex.deltaVs7Days}%`
                : "n/a"}
            </span>
            <span className="text-slate-400 ml-auto font-mono">N={kpis.retentionRiskIndex.sampleSize}</span>
          </div>
          {activeTooltip === "kpi-risk" && (
            <div className="absolute top-10 right-2 z-50 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 w-56 shadow-xl">
              {kpis.retentionRiskIndex.definition}
            </div>
          )}
        </div>

        {/* KPI 2: Projected Debarments */}
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl relative group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
              Debarment Risk
            </span>
            <button
              onMouseEnter={() => setActiveTooltip("kpi-debar")}
              onMouseLeave={() => setActiveTooltip(null)}
              className="text-slate-500 hover:text-slate-300"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-400">
              {kpis.projectedDebarments.value}
            </span>
            <span className="text-xs text-slate-400">students</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-slate-400">Below 75%:</span>
            <span className="text-rose-400 font-semibold">{kpis.projectedDebarments.value}</span>
            <span className="text-slate-400 ml-auto font-mono">N={kpis.projectedDebarments.sampleSize}</span>
          </div>
          {activeTooltip === "kpi-debar" && (
            <div className="absolute top-10 right-2 z-50 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 w-56 shadow-xl">
              {kpis.projectedDebarments.definition}
            </div>
          )}
        </div>

        {/* KPI 3: Curriculum Bottlenecks */}
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl relative group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Bottlenecks
            </span>
            <button
              onMouseEnter={() => setActiveTooltip("kpi-bottle")}
              onMouseLeave={() => setActiveTooltip(null)}
              className="text-slate-500 hover:text-slate-300"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-400">
              {kpis.curriculumBottlenecks.value}
            </span>
            <span className="text-xs text-slate-400">course units</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-slate-400">&gt;40% fail rate</span>
            <span className="text-slate-400 ml-auto font-mono">N={kpis.curriculumBottlenecks.sampleSize}</span>
          </div>
          {activeTooltip === "kpi-bottle" && (
            <div className="absolute top-10 right-2 z-50 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 w-56 shadow-xl">
              {kpis.curriculumBottlenecks.definition}
            </div>
          )}
        </div>

        {/* KPI 4: Intervention Success Rate */}
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl relative group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Success Rate
            </span>
            <button
              onMouseEnter={() => setActiveTooltip("kpi-success")}
              onMouseLeave={() => setActiveTooltip(null)}
              className="text-slate-500 hover:text-slate-300"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
              {kpis.interventionSuccessRate.value}%
            </span>
            <span className="text-xs text-slate-400">recovery</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-slate-400">Target: &gt;70%</span>
            <span className="text-slate-400 ml-auto font-mono">N={kpis.interventionSuccessRate.sampleSize}</span>
          </div>
          {activeTooltip === "kpi-success" && (
            <div className="absolute top-10 right-2 z-50 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 w-56 shadow-xl">
              {kpis.interventionSuccessRate.definition}
            </div>
          )}
        </div>

        {/* KPI 5: Mark Entry Compliance */}
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl relative group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Mark Compliance
            </span>
            <button
              onMouseEnter={() => setActiveTooltip("kpi-mark")}
              onMouseLeave={() => setActiveTooltip(null)}
              className="text-slate-500 hover:text-slate-300"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-cyan-400">
              {kpis.markEntryCompliance.value}%
            </span>
            <span className="text-xs text-slate-400">submitted</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-slate-400">Faculty timely</span>
            <span className="text-slate-400 ml-auto font-mono">N={kpis.markEntryCompliance.sampleSize}</span>
          </div>
          {activeTooltip === "kpi-mark" && (
            <div className="absolute top-10 right-2 z-50 p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-300 w-56 shadow-xl">
              {kpis.markEntryCompliance.definition}
            </div>
          )}
        </div>
      </div>

      {/* Two Column Section: Attendance Trend & Course Risk Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Trend (14-day) with 75% Statutory Line */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                14-Day Attendance Telemetry
              </h2>
              <p className="text-[11px] text-slate-400">
                Departmental daily average vs statutory 75% debarment threshold
              </p>
            </div>
            <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
              Threshold: 75%
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.attendanceTrend14Days}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis
                  domain={[50, 100]}
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#090D16",
                    borderColor: "#334155",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <ReferenceLine
                  y={75}
                  stroke="#f43f5e"
                  strokeDasharray="4 4"
                  label={{
                    value: "75% Debarment Limit",
                    fill: "#f43f5e",
                    fontSize: 10,
                    position: "insideTopLeft",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="Attendance %"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#6366f1" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stacked Bar Chart: Course Risk Distribution */}
        <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                Course Risk Distribution
              </h2>
              <p className="text-[11px] text-slate-400">
                Enrollment risk segmentation across registered courses
              </p>
            </div>
            <span className="text-[11px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              {data.courseRiskDistribution.length} Courses
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.courseRiskDistribution}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="courseCode" tick={{ fill: "#64748b", fontSize: 10 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#090D16",
                    borderColor: "#334155",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <Bar dataKey="LOW" name="Low Risk" stackId="a" fill="#10b981" />
                <Bar dataKey="MEDIUM" name="Medium Risk" stackId="a" fill="#3b82f6" />
                <Bar dataKey="HIGH" name="High Risk" stackId="a" fill="#f59e0b" />
                <Bar dataKey="CRITICAL" name="Critical Risk" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Escalation Queue Table */}
      <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Tier-1 Escalation Queue
            </h2>
            <p className="text-xs text-slate-400">
              Students exhibiting 3+ critical courses or active escalation mandates
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg self-start sm:self-auto">
            {data.escalationsQueue.length} Flagged Case(s)
          </span>
        </div>

        {data.escalationsQueue.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
            No pending escalation cases in active department scope.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-3">Critical Courses</th>
                  <th className="py-3 px-3">Primary Risk Drivers</th>
                  <th className="py-3 px-3">Escalation Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.escalationsQueue.map((item) => {
                  return (
                    <tr key={item.studentId} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{item.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{item.email}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-[11px]">
                          {item.criticalCourseCount} Critical
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {item.riskDrivers.map((driver, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300"
                            >
                              {driver}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {item.activeCase ? (
                          <div className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300">
                            <Clock className="w-3 h-3" />
                            {item.activeCase.status} ({item.activeCase.severity})
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Eligible for Tier-1</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenEscalateModal(item.studentId)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
                        >
                          <Send className="w-3 h-3" />
                          Escalate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trigger Tier-1 Escalation Modal */}
      {escalateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-slate-200 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Trigger Tier-1 Escalation Dispatch
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Dispatches multi-channel alerts (Mentor, HOD, Welfare Cell) and reserves calendar hold.
            </p>

            {dispatchSuccess ? (
              <div className="space-y-4 py-4 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-base">Escalation Successfully Dispatched</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Notifications generated: {jobStatus?.notificationsCount ?? 3}. Calendar hold scheduled: Yes.
                  </p>
                  {jobStatus?.deduplicated && (
                    <span className="inline-block mt-2 text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Note: Dispatched earlier within 24h window (idempotent hold reused)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setEscalateModalOpen(false)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
                >
                  Close & View Telemetry
                </button>
              </div>
            ) : isSubmitting ? (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
                <p className="text-sm font-semibold text-white">
                  Executing Synchronous Dispatch & Calendar Hold...
                </p>
                <p className="text-xs text-slate-400">
                  Target: &lt; 1.5s serverless execution window
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitEscalation} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Select Target Student
                  </label>
                  <select
                    value={targetStudentId}
                    onChange={(e) => setTargetStudentId(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {data.escalationsQueue.map((s) => (
                      <option key={s.studentId} value={s.studentId}>
                        {s.name} ({s.email}) — {s.criticalCourseCount} Critical Courses
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Severity Tier
                    </label>
                    <select
                      value={escalateSeverity}
                      onChange={(e) => setEscalateSeverity(e.target.value as "STANDARD" | "SEVERE")}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="STANDARD">STANDARD (Tier-1 Standard)</option>
                      <option value="SEVERE">SEVERE (Immediate Hold)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Target Audience
                    </label>
                    <input
                      type="text"
                      disabled
                      value="Mentor + HOD + Welfare Cell"
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Dispatch Channels
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {["IN_APP", "EMAIL", "SMS", "WHATSAPP"].map((ch) => (
                      <label
                        key={ch}
                        className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          selectedChannels.includes(ch)
                            ? "bg-indigo-600/30 text-indigo-200 border-indigo-500/50"
                            : "bg-slate-950 border-slate-800 text-slate-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={selectedChannels.includes(ch)}
                          onChange={() => handleChannelToggle(ch)}
                        />
                        {ch.replace("_", " ")}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Escalation Justification & Remediation Directive
                  </label>
                  <textarea
                    rows={3}
                    value={escalateReason}
                    onChange={(e) => setEscalateReason(e.target.value)}
                    placeholder="Enter academic justification, observations, or specific remediation instructions for mentor..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEscalateModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Confirm & Dispatch
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
