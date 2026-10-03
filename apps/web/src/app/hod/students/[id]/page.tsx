"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft,
  AlertTriangle,
  BookOpen,
  FileSpreadsheet,
  FileText,
  Loader2,
  CheckCircle2,
  BrainCircuit,
} from "lucide-react";

interface StudentDetailData {
  student: {
    id: string;
    name: string;
    email: string;
    rollNumber: string;
    department: { id: string; code: string; name: string } | null;
    isActive: boolean;
  };
  mentor: { id: string; name: string; email: string } | null;
  interventionsCount: number;
  notesCount: number;
  latestEscalation: {
    id: string;
    status: string;
    severity: string;
    reason: string;
    createdAt: string;
  } | null;
  courses: Array<{
    course: { id: string; code: string; name: string; credits: number };
    attendanceRate: number | string;
    masteryScore: number | string;
    riskScore: number | null;
    riskCategory: "CRITICAL" | "MODERATE" | "SAFE" | null;
    failRisk: string;
    velocity: number | null;
    xaiExplanation: {
      riskCategory: string;
      riskScore: number;
      confidence: number;
      overrideReason?: string;
      primaryDrivers: Array<{
        indicator: string;
        weight: number;
        studentValue: number;
        threshold: number;
        contributionPercent: number;
        driverSummary: string;
      }>;
    } | null;
    assessmentBreakdown: Array<{
      id: string;
      title: string;
      type: string;
      maxScore: number;
      score: number;
      percentage: number;
      gradedAt: string;
    }>;
  }>;
  attendanceTrend14Days: Array<{
    date: string;
    courseCode: string;
    status: string;
  }>;
}

export default function HodStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const studentId = resolvedParams.id;
  const searchParams = useSearchParams();
  const departmentId = searchParams.get("departmentId");

  const [data, setData] = useState<StudentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<"pdf" | "xlsx" | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = departmentId
        ? `/api/v1/hod/students/${studentId}?departmentId=${encodeURIComponent(departmentId)}`
        : `/api/v1/hod/students/${studentId}`;

      const res = await apiFetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load student dossier (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load student dossier");
    } finally {
      setLoading(false);
    }
  }, [studentId, departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownload = async (format: "pdf" | "xlsx") => {
    try {
      setDownloadingFormat(format);
      const res = await apiFetch(
        `/api/v1/hod/students/${studentId}/export?format=${format}`,
      );
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Progress_Report_${data?.student.rollNumber || studentId}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert("Failed to download progress report");
    } finally {
      setDownloadingFormat(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500 mb-3" />
        <p className="text-xs">Loading comprehensive student progress report...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Link
          href="/hod/students"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Students
        </Link>
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <h2 className="text-sm font-semibold">Student Record Error</h2>
          </div>
          <p className="text-xs text-rose-300/80 mb-4">{error || "Could not retrieve dossier"}</p>
          <button
            onClick={() => fetchData()}
            className="px-3 py-1.5 rounded-lg bg-rose-600/30 text-xs font-semibold hover:bg-rose-600/40"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { student, mentor, interventionsCount, notesCount, latestEscalation, courses, attendanceTrend14Days } = data;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/hod/students"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Student Roster
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">{student.name}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
              {student.rollNumber}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {student.email} • {student.department?.name || "Department of Computer Science & Engineering"}
          </p>
        </div>

        {/* Download Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => handleDownload("pdf")}
            disabled={downloadingFormat !== null}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-600/20 transition-all disabled:opacity-50"
          >
            {downloadingFormat === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            Download PDF
          </button>
          <button
            onClick={() => handleDownload("xlsx")}
            disabled={downloadingFormat !== null}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
          >
            {downloadingFormat === "xlsx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            Download XLSX
          </button>
        </div>
      </div>

      {/* Profile & Mentorship Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Active Mentor
          </div>
          <div className="text-sm font-semibold text-white">
            {mentor ? mentor.name : "Unassigned"}
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {mentor ? mentor.email : "No active assignment"}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Interventions & Notes
          </div>
          <div className="text-sm font-semibold text-white">
            {interventionsCount} Sessions Logged
          </div>
          <div className="text-[11px] text-slate-400">
            {notesCount} Actionable notes recorded
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Escalation Status
          </div>
          <div className="text-sm font-semibold text-white">
            {latestEscalation ? (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {latestEscalation.status}
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> No Active Cases
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {latestEscalation ? latestEscalation.reason : "All channels clear"}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Enrolled Courses
          </div>
          <div className="text-sm font-semibold text-white">
            {courses.length} Active Courses
          </div>
          <div className="text-[11px] text-slate-400">
            Current Academic Semester
          </div>
        </div>
      </div>

      {/* Per-Course Breakdown with XAI Explanations */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-sky-400" />
          Per-Course Progress & XAI Risk Explainability
        </h2>

        {courses.map((c) => {
          const isCritical = c.riskCategory === "CRITICAL";
          const isModerate = c.riskCategory === "MODERATE";

          return (
            <div
              key={c.course.id}
              className={`p-6 rounded-2xl border transition-all space-y-6 ${
                isCritical
                  ? "bg-rose-950/20 border-rose-500/30"
                  : isModerate
                    ? "bg-amber-950/15 border-amber-500/30"
                    : "bg-slate-900/60 border-slate-800/80"
              }`}
            >
              {/* Course Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-800 text-sky-300">
                      {c.course.code}
                    </span>
                    <h3 className="text-base font-bold text-white">{c.course.name}</h3>
                    <span className="text-xs text-slate-400">({c.course.credits} Credits)</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Attendance: </span>
                    <span
                      className={`font-semibold ${
                        typeof c.attendanceRate === "number" && c.attendanceRate < 75
                          ? "text-rose-400"
                          : "text-white"
                      }`}
                    >
                      {c.attendanceRate !== "n/a" ? `${c.attendanceRate}%` : "n/a"}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400">Mastery: </span>
                    <span className="font-semibold text-white">
                      {c.masteryScore !== "n/a" ? `${c.masteryScore}%` : "n/a"}
                    </span>
                  </div>

                  <div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        isCritical
                          ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                          : isModerate
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                            : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      }`}
                    >
                      {c.riskCategory || "SAFE"}
                    </span>
                  </div>
                </div>
              </div>

              {/* XAI Explanation Card */}
              {c.xaiExplanation && (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-sky-300 font-semibold">
                      <BrainCircuit className="w-4 h-4 text-sky-400" />
                      XAI Academic Trajectory Assessment
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Confidence: {Math.round(c.xaiExplanation.confidence * 100)}%
                    </div>
                  </div>

                  {c.xaiExplanation.overrideReason && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                      <span className="font-semibold">Governance Override:</span> {c.xaiExplanation.overrideReason}
                    </div>
                  )}

                  {/* Drivers */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Primary Trajectory Drivers
                    </div>
                    {c.xaiExplanation.primaryDrivers.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No adverse risk drivers detected.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {c.xaiExplanation.primaryDrivers.map((driver, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg bg-slate-900/80 border border-slate-800/80 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <span className="text-slate-300">{driver.indicator}</span>
                              <span className="text-rose-400">{driver.contributionPercent}% contribution</span>
                            </div>
                            <p className="text-slate-400 text-[11px]">{driver.driverSummary}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Assessment Breakdown Table */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Assessment History & Graded Submissions
                </div>
                {c.assessmentBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No assessments evaluated for this course.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 pl-3">Assessment Title</th>
                          <th className="py-2.5">Type</th>
                          <th className="py-2.5">Score</th>
                          <th className="py-2.5">Max</th>
                          <th className="py-2.5">Percentage</th>
                          <th className="py-2.5 pr-3 text-right">Graded Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {c.assessmentBreakdown.map((a) => (
                          <tr key={a.id} className="hover:bg-slate-800/20">
                            <td className="py-2.5 pl-3 font-medium text-slate-200">{a.title}</td>
                            <td className="py-2.5 text-slate-400">{a.type}</td>
                            <td className="py-2.5 font-semibold text-white">{a.score}</td>
                            <td className="py-2.5 text-slate-400">{a.maxScore}</td>
                            <td className="py-2.5">
                              <span
                                className={`font-semibold ${
                                  a.percentage < 50
                                    ? "text-rose-400"
                                    : a.percentage < 70
                                      ? "text-amber-400"
                                      : "text-emerald-400"
                                }`}
                              >
                                {a.percentage}%
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 text-right text-slate-400">
                              {new Date(a.gradedAt).toLocaleDateString()}
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
        })}
      </div>

      {/* 14-Day Attendance Log */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
        <h3 className="text-sm font-semibold text-white">Recent 14-Day Attendance Records</h3>
        {attendanceTrend14Days.length === 0 ? (
          <p className="text-xs text-slate-500">No attendance entries recorded in the past 14 days.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {attendanceTrend14Days.map((rec, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-xl border text-center text-xs space-y-1 ${
                  rec.status === "PRESENT"
                    ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                    : rec.status === "ABSENT"
                      ? "bg-rose-950/20 border-rose-500/30 text-rose-300"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                }`}
              >
                <div className="text-[10px] text-slate-400">{rec.date}</div>
                <div className="font-mono text-[11px] font-bold">{rec.courseCode}</div>
                <div className="font-semibold text-[10px]">{rec.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
