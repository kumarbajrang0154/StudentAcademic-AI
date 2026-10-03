"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  TrendingUp,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface EfficacyRow {
  id: string;
  studentName: string;
  studentEmail: string;
  courseCode: string;
  courseName: string;
  mentorName: string;
  type: string;
  status: string;
  scheduledAt: string;
  preScore: number;
  postScore: number | null;
  delta: number | null;
  effortHours: number;
  efficacyIndex: number | null;
  efficacyClass: string;
  notes: string | null;
}

interface EfficacySummary {
  totalInterventions: number;
  evaluatedCount: number;
  averageDelta: number | null;
  successRate: number | null;
  totalEffortHours: number;
}

export default function HodEfficacyPage() {
  const [summary, setSummary] = useState<EfficacySummary | null>(null);
  const [interventions, setInterventions] = useState<EfficacyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>("ALL");

  const fetchEfficacy = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/v1/hod/efficacy");
      if (!res.ok) {
        throw new Error(`Failed to load intervention efficacy (${res.status})`);
      }
      const json = await res.json();
      setSummary(json.summary);
      setInterventions(json.interventions || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load efficacy data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEfficacy();
  }, [fetchEfficacy]);

  const filtered = interventions.filter((item) => {
    if (filterClass === "ALL") return true;
    return item.efficacyClass === filterClass;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            Intervention Efficacy & Academic ROI
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Department before/after mastery recovery evaluation and mentor tutoring effort return.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchEfficacy}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs font-semibold hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <span className="text-xs font-semibold px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
            {interventions.length} Interventions Tracked
          </span>
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
            onClick={fetchEfficacy}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Interventions
            </span>
            <div className="text-2xl font-extrabold text-white mt-1">
              {summary.totalInterventions}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {summary.evaluatedCount} fully evaluated
            </p>
          </div>

          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Recovery Success Rate
            </span>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              {summary.successRate !== null ? `${summary.successRate}%` : "n/a"}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Achieved post &gt; pre score</p>
          </div>

          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
            <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">
              Average Mastery Delta
            </span>
            <div className="text-2xl font-extrabold text-sky-400 mt-1">
              {summary.averageDelta !== null
                ? `${summary.averageDelta > 0 ? "+" : ""}${summary.averageDelta}%`
                : "n/a"}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Net post-intervention gain</p>
          </div>

          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Total Mentorship Effort
            </span>
            <div className="text-2xl font-extrabold text-amber-400 mt-1">
              {summary.totalEffortHours} hrs
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Faculty & mentor contact hours</p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium mr-1">Classification:</span>
          {["ALL", "Highly Effective", "Moderately Effective", "Neutral/Declining", "Pending Evaluation"].map(
            (c) => (
              <button
                key={c}
                onClick={() => setFilterClass(c)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  filterClass === c
                    ? "bg-sky-600/30 text-sky-300 border border-sky-500/40"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {c}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Efficacy Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
            <span>Calculating dynamic efficacy metrics...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
            No interventions match the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Student & Course</th>
                  <th className="py-3.5 px-3">Type & Date</th>
                  <th className="py-3.5 px-3">Pre-Score</th>
                  <th className="py-3.5 px-3">Post-Score</th>
                  <th className="py-3.5 px-3">Delta</th>
                  <th className="py-3.5 px-3">Efficacy Rating</th>
                  <th className="py-3.5 px-4 text-right">Effort</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{row.studentName}</div>
                      <div className="text-[11px] text-sky-400">
                        {row.courseCode} — {row.courseName}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-slate-200">{row.type}</span>
                      <div className="text-[10px] text-slate-500">
                        {new Date(row.scheduledAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-medium">
                      {row.preScore}%
                    </td>
                    <td className="py-3 px-3">
                      {row.postScore !== null ? (
                        <span className="font-semibold text-white">{row.postScore}%</span>
                      ) : (
                        <span className="text-slate-500 italic">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {row.delta !== null ? (
                        <span
                          className={`font-bold ${
                            row.delta > 0
                              ? "text-emerald-400"
                              : row.delta === 0
                              ? "text-slate-400"
                              : "text-rose-400"
                          }`}
                        >
                          {row.delta > 0 ? `+${row.delta}` : row.delta}%
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                          row.efficacyClass === "Highly Effective"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : row.efficacyClass === "Moderately Effective"
                            ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                            : row.efficacyClass === "Neutral/Declining"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {row.efficacyClass}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-300">
                      {row.effortHours} hrs
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
