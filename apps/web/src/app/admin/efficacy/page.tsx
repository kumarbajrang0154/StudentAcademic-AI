"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  TrendingUp,
  CheckCircle2,
  Loader2,
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

export default function AdminEfficacyPage() {
  const [summary, setSummary] = useState<EfficacySummary | null>(null);
  const [interventions, setInterventions] = useState<EfficacyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>("ALL");

  const fetchEfficacy = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/v1/admin/interventions/efficacy");
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
  };

  useEffect(() => {
    fetchEfficacy();
  }, []);

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
            Intervention Efficacy & Institutional ROI
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Empirical before/after mastery recovery evaluation and mentor tutoring effort return.
          </p>
        </div>

        <span className="text-xs font-semibold px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 self-start sm:self-auto">
          {interventions.length} Interventions Tracked
        </span>
      </div>

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
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              Average Mastery Delta
            </span>
            <div className="text-2xl font-extrabold text-indigo-400 mt-1">
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
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium mr-1">Classification:</span>
          {["ALL", "Highly Effective", "Moderately Effective", "Neutral/Declining", "Pending Evaluation"].map(
            (c) => (
              <button
                key={c}
                onClick={() => setFilterClass(c)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  filterClass === c
                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
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
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Calculating dynamic efficacy metrics...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400 text-xs">{error}</div>
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
                      <div className="text-[11px] text-indigo-400">
                        {row.courseCode} — {row.courseName}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-200">{row.type}</span>
                      <div className="text-[11px] text-slate-400">
                        {new Date(row.scheduledAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono font-semibold text-slate-300">
                        {row.preScore}%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {row.postScore !== null ? (
                        <span className="font-mono font-bold text-white">
                          {row.postScore}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Tracking</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {row.delta !== null ? (
                        <span
                          className={`font-mono font-bold ${
                            row.delta > 0
                              ? "text-emerald-400"
                              : row.delta < 0
                              ? "text-rose-400"
                              : "text-slate-400"
                          }`}
                        >
                          {row.delta > 0 ? `+${row.delta}%` : `${row.delta}%`}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          row.efficacyClass === "Highly Effective"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : row.efficacyClass === "Moderately Effective"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : row.efficacyClass === "Pending Evaluation"
                            ? "bg-slate-800 text-slate-400 border-slate-700"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        }`}
                      >
                        {row.efficacyClass}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-mono text-slate-300 text-[11px]">
                        {row.effortHours} hr
                      </span>
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
