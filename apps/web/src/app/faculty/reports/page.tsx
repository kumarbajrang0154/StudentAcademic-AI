"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  FileSpreadsheet,
  FileText,
  Download,
  Users,
  Award,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

type FacultyReportType = "attendance" | "marks";

interface AttendanceStudent {
  studentId: string;
  rollNumber: string;
  name: string;
  conducted: number;
  attended: number;
  odMedical: number;
  percentage: number;
  status: string;
  shortageFlag: boolean;
}

interface MarksAssessment {
  id: string;
  title: string;
  type: string;
  maxScore: number;
  weight: number;
}

interface MarksStudent {
  studentId: string;
  rollNumber: string;
  name: string;
  assessmentScores: Record<string, number | null>;
  weightedTotal: number;
  mastery: number;
  failRisk: string;
}

interface FacultyReportData {
  course?: { id: string; code: string; name: string };
  generatedAt: string;
  students?: AttendanceStudent[] | MarksStudent[];
  assessments?: MarksAssessment[];
  summary?: {
    totalStudents: number;
    averageAttendance: number;
    shortageCount: number;
    debarmentRiskCount: number;
  };
  projectedDebarments?: Array<{
    studentId: string;
    rollNumber: string;
    name: string;
    percentage: number;
  }>;
  classStatistics?: {
    meanMastery: number;
    medianMastery: number;
    passPercentage: number;
    typeAverages: Record<string, number>;
  };
}

export default function FacultyReportsPage() {
  const [courses, setCourses] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<FacultyReportType>("attendance");

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FacultyReportData | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  // Load faculty's own courses
  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await apiFetch("/faculty/courses");
        if (res.ok) {
          const json = await res.json();
          const list = json.courses || [];
          setCourses(list);
          if (list.length > 0 && !selectedCourseId) {
            setSelectedCourseId(list[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load faculty courses", err);
      }
    }
    loadCourses();
  }, []);

  // Fetch report data
  useEffect(() => {
    async function fetchReport() {
      if (!selectedCourseId) return;

      setLoading(true);
      setError(null);
      setPage(1);

      try {
        const endpoint =
          activeTab === "attendance"
            ? `/faculty/reports/attendance?courseId=${selectedCourseId}`
            : `/faculty/reports/marks?courseId=${selectedCourseId}`;

        const res = await apiFetch(endpoint);
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.message || "Failed to load report data");
        }

        const json = await res.json();
        setData(json);
        setGeneratedAt(new Date().toLocaleTimeString());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error fetching report");
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, [activeTab, selectedCourseId]);

  // Export handler
  const handleDownload = async (format: "xlsx" | "pdf" | "csv") => {
    if (!selectedCourseId) return;
    setDownloadingFormat(format);

    try {
      const endpoint =
        activeTab === "attendance"
          ? `/faculty/reports/attendance?courseId=${selectedCourseId}&format=${format}`
          : `/faculty/reports/marks?courseId=${selectedCourseId}&format=${format}`;

      const res = await apiFetch(endpoint);
      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const courseObj = courses.find((c) => c.id === selectedCourseId);
      const code = courseObj?.code || "Course";
      const filename = `${code}_${activeTab}_${new Date().toISOString().slice(0, 10)}.${format}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-indigo-600 rounded-xl text-white shadow-md shadow-cyan-600/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Course Reports & Registers
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Faculty Scope
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Generate and export attendance and marks reports for your assigned courses.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-cyan-500"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>

          {/* Export Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleDownload("xlsx")}
              disabled={downloadingFormat !== null || loading}
              className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              title="Export as Excel workbook"
            >
              {downloadingFormat === "xlsx" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              Excel
            </button>
            <button
              onClick={() => handleDownload("pdf")}
              disabled={downloadingFormat !== null || loading}
              className="px-3 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              title="Export as PDF document"
            >
              {downloadingFormat === "pdf" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              PDF
            </button>
            <button
              onClick={() => handleDownload("csv")}
              disabled={downloadingFormat !== null || loading}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              title="Export as CSV"
            >
              {downloadingFormat === "csv" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* 2 Report Cards Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setActiveTab("attendance")}
          className={`p-4 rounded-2xl text-left border transition ${
            activeTab === "attendance"
              ? "bg-indigo-950/40 border-indigo-500/50 shadow-lg shadow-indigo-900/20"
              : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/60"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Module 1
            </span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <h3 className="font-bold text-white text-base mb-1">Attendance Register</h3>
          <p className="text-xs text-slate-400">
            Conducted sessions, attendance percentages, shortage flags (&lt;75%), and projected debarments.
          </p>
        </button>

        <button
          onClick={() => setActiveTab("marks")}
          className={`p-4 rounded-2xl text-left border transition ${
            activeTab === "marks"
              ? "bg-cyan-950/40 border-cyan-500/50 shadow-lg shadow-cyan-900/20"
              : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/60"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              Module 3
            </span>
            <Award className="w-4 h-4 text-cyan-400" />
          </div>
          <h3 className="font-bold text-white text-base mb-1">Marks & Mastery Register</h3>
          <p className="text-xs text-slate-400">
            Assessment scores, weighted totals, overall mastery %, and rule-based fail risk status.
          </p>
        </button>
      </div>

      {/* Report Metadata Status Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Selected Course:{" "}
          <strong className="text-slate-200">
            {courses.find((c) => c.id === selectedCourseId)?.code || "No Course Selected"}
          </strong>
        </span>
        {generatedAt && (
          <span>
            Generated at: <strong className="text-slate-300">{generatedAt}</strong>
          </span>
        )}
      </div>

      {/* Report Preview Content */}
      {loading ? (
        <div className="p-12 flex items-center justify-center text-slate-400 bg-slate-900/30 rounded-2xl border border-slate-800">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mr-3" />
          <span>Generating course report preview...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <p className="font-bold text-sm">Error Loading Report</p>
            <p className="text-xs text-rose-400/80">{error}</p>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* ATTENDANCE PREVIEW */}
          {activeTab === "attendance" && (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Enrolled Students</span>
                  <span className="text-xl font-bold text-white">{data.summary?.totalStudents ?? 0}</span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Average Attendance</span>
                  <span className="text-xl font-bold text-cyan-400">{data.summary?.averageAttendance ?? 0}%</span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Shortage Count (&lt;75%)</span>
                  <span className="text-xl font-bold text-rose-400">{data.summary?.shortageCount ?? 0}</span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Debarment Risk</span>
                  <span className="text-xl font-bold text-amber-400">{data.summary?.debarmentRiskCount ?? 0}</span>
                </div>
              </div>

              {/* Table */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Roll No</th>
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4 text-center">Conducted</th>
                        <th className="py-3 px-4 text-center">Attended</th>
                        <th className="py-3 px-4 text-center">OD / ML</th>
                        <th className="py-3 px-4 text-center">Attendance %</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Shortage Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {(data.students as AttendanceStudent[])
                        .slice((page - 1) * pageSize, page * pageSize)
                        .map((s: AttendanceStudent) => (
                          <tr
                            key={s.studentId}
                            className={`hover:bg-slate-800/30 transition ${
                              s.shortageFlag ? "bg-rose-950/20" : ""
                            }`}
                          >
                            <td className="py-3 px-4 font-bold text-white">{s.rollNumber}</td>
                            <td className="py-3 px-4 text-slate-200">{s.name}</td>
                            <td className="py-3 px-4 text-center text-slate-400">{s.conducted}</td>
                            <td className="py-3 px-4 text-center font-semibold text-white">{s.attended}</td>
                            <td className="py-3 px-4 text-center text-slate-400">{s.odMedical}</td>
                            <td className="py-3 px-4 text-center font-bold text-white">{s.percentage}%</td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  s.status === "SAFE"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : s.status === "MODERATE"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                }`}
                              >
                                {s.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {s.shortageFlag ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                  SHORTAGE (&lt;75%)
                                </span>
                              ) : (
                                <span className="text-slate-500 font-semibold">NORMAL</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Showing {Math.min((page - 1) * pageSize + 1, data.students?.length ?? 0)} -{" "}
                    {Math.min(page * pageSize, data.students?.length ?? 0)} of {data.students?.length ?? 0} students
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>Page {page}</span>
                    <button
                      onClick={() => setPage((p) => (p * pageSize < (data.students?.length ?? 0) ? p + 1 : p))}
                      disabled={page * pageSize >= (data.students?.length ?? 0)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MARKS PREVIEW */}
          {activeTab === "marks" && (
            <div className="space-y-6">
              {/* Class Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Mean Mastery</span>
                  <span className="text-xl font-bold text-white">{data.classStatistics?.meanMastery ?? 0}%</span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Median Mastery</span>
                  <span className="text-xl font-bold text-cyan-400">{data.classStatistics?.medianMastery ?? 0}%</span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Pass Rate (&gt;= 40%)</span>
                  <span className="text-xl font-bold text-emerald-400">{data.classStatistics?.passPercentage ?? 0}%</span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Components</span>
                  <span className="text-xl font-bold text-amber-400">{data.assessments?.length ?? 0}</span>
                </div>
              </div>

              {/* Table */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Roll No</th>
                        <th className="py-3 px-4">Name</th>
                        {data.assessments?.map((a: MarksAssessment) => (
                          <th key={a.id} className="py-3 px-3 text-center">
                            {a.type} ({a.maxScore})
                          </th>
                        ))}
                        <th className="py-3 px-4 text-center">Weighted Total</th>
                        <th className="py-3 px-4 text-center">Mastery %</th>
                        <th className="py-3 px-4 text-center">Fail Risk (Rule-Based)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {(data.students as MarksStudent[])
                        .slice((page - 1) * pageSize, page * pageSize)
                        .map((s: MarksStudent) => (
                          <tr key={s.studentId} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-4 font-bold text-white">{s.rollNumber}</td>
                            <td className="py-3 px-4 text-slate-200">{s.name}</td>
                            {data.assessments?.map((a: MarksAssessment) => (
                              <td key={a.id} className="py-3 px-3 text-center text-slate-300">
                                {s.assessmentScores[a.id] !== null ? s.assessmentScores[a.id] : "-"}
                              </td>
                            ))}
                            <td className="py-3 px-4 text-center font-bold text-white">{s.weightedTotal}</td>
                            <td className="py-3 px-4 text-center font-bold text-cyan-400">{s.mastery}%</td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  s.failRisk === "ON_TRACK"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : s.failRisk === "AT_RISK"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                }`}
                              >
                                {s.failRisk.replace(/_/g, " ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Showing {Math.min((page - 1) * pageSize + 1, data.students?.length ?? 0)} -{" "}
                    {Math.min(page * pageSize, data.students?.length ?? 0)} of {data.students?.length ?? 0} students
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>Page {page}</span>
                    <button
                      onClick={() => setPage((p) => (p * pageSize < (data.students?.length ?? 0) ? p + 1 : p))}
                      disabled={page * pageSize >= (data.students?.length ?? 0)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
