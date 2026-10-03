"use client";

import React, { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface FacultyReportData {
  faculty: {
    id: string;
    name: string;
    email: string;
    department: { id: string; code: string; name: string } | null;
  };
  courses: Array<{
    courseId: string;
    code: string;
    name: string;
    syllabus: {
      conducted: number;
      plannedToDate: number;
      variance: number;
      hasWarning: boolean;
      rule: string;
    };
    attendanceTimeliness: {
      rate: string;
      timelySessions: number;
      totalSessions: number;
    };
    markCompliance: {
      rate: string;
      compliantCount: number;
      totalPastDue: number;
    };
    assessments: {
      created: number;
      graded: number;
    };
    classContext: {
      meanMastery: number | string;
      riskDistribution: {
        safe: number;
        moderate: number;
        critical: number;
        total: number;
      };
      disclaimer: string;
    };
    interventionsInitiated: number;
    bottleneckUnits: Array<{
      unitNumber: number;
      title: string;
      avgMastery: number;
    }>;
  }>;
}

export default function HodFacultyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const facultyId = resolvedParams.id;
  const searchParams = useSearchParams();
  const departmentId = searchParams.get("departmentId");

  const [data, setData] = useState<FacultyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<"pdf" | "xlsx" | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = departmentId
        ? `/api/v1/hod/faculty/${facultyId}?departmentId=${encodeURIComponent(departmentId)}`
        : `/api/v1/hod/faculty/${facultyId}`;

      const res = await apiFetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load faculty progress report (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load faculty report");
    } finally {
      setLoading(false);
    }
  }, [facultyId, departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownload = async (format: "pdf" | "xlsx") => {
    try {
      setDownloadingFormat(format);
      const res = await apiFetch(
        `/api/v1/hod/faculty/${facultyId}/export?format=${format}`,
      );
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Faculty_Report_${data?.faculty.name.replace(/\s+/g, "_") || facultyId}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert("Failed to download faculty progress report");
    } finally {
      setDownloadingFormat(null);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500 mb-3" />
        <p className="text-xs">Generating faculty delivery & compliance dossier...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-4xl mx-auto space-y-4">
        <Link
          href="/hod/faculty"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Faculty
        </Link>
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <h2 className="text-sm font-semibold">Faculty Record Error</h2>
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

  const { faculty, courses } = data;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/hod/faculty"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Faculty List
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">{faculty.name}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
              {faculty.department?.code || "CSE"} Faculty
            </span>
          </div>
          <p className="text-xs text-slate-400">{faculty.email}</p>
        </div>

        {/* Action Downloads */}
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

      {/* Course Progress Reports */}
      <div className="space-y-6">
        {courses.map((course) => (
          <div
            key={course.courseId}
            className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-6 shadow-xl"
          >
            {/* Course Title Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-slate-800 text-sky-300 border border-slate-700">
                  {course.code}
                </span>
                <h2 className="text-lg font-bold text-white tracking-tight">{course.name}</h2>
              </div>

              {course.syllabus.hasWarning && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4" />
                  Syllabus Lag: {course.syllabus.variance} sessions behind benchmark
                </div>
              )}
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Syllabus Progress */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Syllabus Progress
                </span>
                <div className="text-xl font-bold text-white">
                  {course.syllabus.conducted} / {course.syllabus.plannedToDate}
                  <span className="text-xs font-medium text-slate-400 ml-1.5">sessions</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Variance:{" "}
                  <span
                    className={`font-semibold ${
                      course.syllabus.variance < 0 ? "text-amber-400" : "text-emerald-400"
                    }`}
                  >
                    {course.syllabus.variance > 0 ? `+${course.syllabus.variance}` : course.syllabus.variance}
                  </span>{" "}
                  vs benchmark
                </div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                  Rule: 20 planned sessions benchmark
                </div>
              </div>

              {/* Attendance Entry Timeliness */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Attendance Timeliness
                </span>
                <div className="text-xl font-bold text-white">
                  {course.attendanceTimeliness.rate}
                </div>
                <div className="text-[11px] text-slate-400">
                  {course.attendanceTimeliness.timelySessions} of {course.attendanceTimeliness.totalSessions} sessions logged within 24h
                </div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                  Target: Entry within 24 hours of session
                </div>
              </div>

              {/* Mark Entry Compliance */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Marks Entry Compliance
                </span>
                <div className="text-xl font-bold text-white">
                  {course.markCompliance.rate}
                </div>
                <div className="text-[11px] text-slate-400">
                  {course.markCompliance.compliantCount} of {course.markCompliance.totalPastDue} assessments graded within 7 days
                </div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                  SLA: Graded within 7 days of due date
                </div>
              </div>

              {/* Assessments Created/Graded */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Assessments Created
                </span>
                <div className="text-xl font-bold text-white">
                  {course.assessments.graded} / {course.assessments.created}
                  <span className="text-xs font-medium text-slate-400 ml-1.5">graded</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {course.interventionsInitiated} academic interventions initiated
                </div>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                  Formative and summative items
                </div>
              </div>
            </div>

            {/* Context & Risk Distribution (Non-ranking disclaimer) */}
            <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    Cohort Outcomes & Risk Distribution Context
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    Non-Ranking Indicator
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  Class Mean Mastery: <span className="font-bold text-white">{course.classContext.meanMastery}%</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20">
                  <div className="text-sm font-bold text-emerald-400">{course.classContext.riskDistribution.safe}</div>
                  <div className="text-[10px] text-emerald-400/80">Safe Band</div>
                </div>
                <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-500/20">
                  <div className="text-sm font-bold text-amber-400">{course.classContext.riskDistribution.moderate}</div>
                  <div className="text-[10px] text-amber-400/80">Moderate Band</div>
                </div>
                <div className="p-2 rounded-lg bg-rose-950/20 border border-rose-500/20">
                  <div className="text-sm font-bold text-rose-400">{course.classContext.riskDistribution.critical}</div>
                  <div className="text-[10px] text-rose-400/80">Critical Band</div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 italic">
                Note: {course.classContext.disclaimer}
              </p>
            </div>

            {/* Bottleneck Units */}
            {course.bottleneckUnits.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Identified Curriculum Bottleneck Units
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {course.bottleneckUnits.map((unit) => (
                    <div
                      key={unit.unitNumber}
                      className="p-3 rounded-xl bg-slate-950 border border-rose-500/20 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">
                          Unit {unit.unitNumber}: {unit.title}
                        </div>
                        <div className="text-[10px] text-slate-400">Low assessment comprehension</div>
                      </div>
                      <span className="text-rose-400 font-bold font-mono">{unit.avgMastery}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
