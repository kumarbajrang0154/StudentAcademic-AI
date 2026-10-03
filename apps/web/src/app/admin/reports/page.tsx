"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  FileSpreadsheet,
  FileText,
  Download,
  Users,
  AlertTriangle,
  TrendingUp,
  Award,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type ReportType = "attendance" | "marks" | "department_analytics";

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

interface CourseAttendanceAvg {
  courseId: string;
  courseCode: string;
  courseName: string;
  enrolledCount: number;
  averageAttendance: number;
}

interface BottleneckUnit {
  unitId: string;
  unitCode?: string;
  unitTitle: string;
  courseCode: string;
  failureRate: number;
}

interface ReportData {
  course?: { id: string; code: string; name: string };
  department?: { id: string; code: string; name: string };
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
  riskDistribution?: { safe: number; moderate: number; critical: number; total: number };
  courseAttendanceAverages?: CourseAttendanceAvg[];
  bottleneckUnits?: BottleneckUnit[];
  escalationCounts?: {
    open: number;
    resolved: number;
    total: number;
  };
  interventionEfficacy?: {
    completed: number;
    improved: number;
    rate: number;
  };
}

export default function AdminReportsPage() {
  const [courses, setCourses] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ReportType>("attendance");

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  // Load course list
  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await apiFetch("/api/v1/admin/courses");
        if (res.ok) {
          const json = await res.json();
          const list = json.courses || [];
          setCourses(list);
          if (list.length > 0 && !selectedCourseId) {
            setSelectedCourseId(list[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load courses", err);
      }
    }
    loadCourses();
  }, []);

  // Fetch report data
  useEffect(() => {
    async function fetchReport() {
      if (activeTab !== "department_analytics" && !selectedCourseId) return;

      setLoading(true);
      setError(null);
      setPage(1);

      try {
        let endpoint = "";
        if (activeTab === "attendance") {
          endpoint = `/api/v1/admin/reports/attendance?courseId=${selectedCourseId}`;
        } else if (activeTab === "marks") {
          endpoint = `/api/v1/admin/reports/marks?courseId=${selectedCourseId}`;
        } else {
          endpoint = `/api/v1/admin/reports/department-analytics`;
        }

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
    setDownloadingFormat(format);

    try {
      let endpoint = "";
      if (activeTab === "attendance") {
        endpoint = `/api/v1/admin/reports/attendance?courseId=${selectedCourseId}&format=${format}`;
      } else if (activeTab === "marks") {
        endpoint = `/api/v1/admin/reports/marks?courseId=${selectedCourseId}&format=${format}`;
      } else {
        endpoint = `/api/v1/admin/reports/department-analytics?format=${format}`;
      }

      const res = await apiFetch(endpoint);
      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const courseObj = courses.find((c) => c.id === selectedCourseId);
      const code = courseObj?.code || "Academic";
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
              Institutional Reports & Exports
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              SCR-06
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Generate and export official attendance registers, continuous assessment marks, and departmental analytics.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {activeTab !== "department_analytics" && (
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          )}

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

      {/* 3 Report Cards Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            Conducted, attended, OD/medical leave, shortage flags (&lt;75%), and projected debarments.
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
            Assessment scores grouped by type, weighted totals, mastery %, and fail risk labels.
          </p>
        </button>

        <button
          onClick={() => setActiveTab("department_analytics")}
          className={`p-4 rounded-2xl text-left border transition ${
            activeTab === "department_analytics"
              ? "bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-900/20"
              : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/60"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Governance
            </span>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="font-bold text-white text-base mb-1">Department Analytics</h3>
          <p className="text-xs text-slate-400">
            Risk distributions, bottleneck units, intervention efficacy metrics, and escalation cases.
          </p>
        </button>
      </div>

      {/* Report Metadata Status Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Data Scope:{" "}
          <strong className="text-slate-200">
            {activeTab === "department_analytics"
              ? "Computer Science and Engineering"
              : courses.find((c) => c.id === selectedCourseId)?.code || "All Courses"}
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
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
          <span>Generating report preview...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300">
          <p className="font-bold mb-1">Error Loading Report</p>
          <p className="text-xs">{error}</p>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* TAB 1: ATTENDANCE PREVIEW */}
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
                  <span className="text-xl font-bold text-indigo-400">{data.summary?.averageAttendance ?? 0}%</span>
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
                        <th className="py-3 px-4 text-center">Risk Status</th>
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

          {/* TAB 2: MARKS PREVIEW */}
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
                  <span className="text-xs text-slate-400 block mb-1">Evaluated Components</span>
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

          {/* TAB 3: DEPARTMENT ANALYTICS PREVIEW */}
          {activeTab === "department_analytics" && (
            <div className="space-y-6">
              {/* Risk & Escalation Distribution */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Safe Cohort</span>
                  <span className="text-xl font-bold text-emerald-400">
                    {data.riskDistribution?.safe ?? 0} ({(((data.riskDistribution?.safe ?? 0) / (data.riskDistribution?.total || 1)) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Moderate Risk</span>
                  <span className="text-xl font-bold text-amber-400">
                    {data.riskDistribution?.moderate ?? 0} ({(((data.riskDistribution?.moderate ?? 0) / (data.riskDistribution?.total || 1)) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Critical Risk</span>
                  <span className="text-xl font-bold text-rose-400">
                    {data.riskDistribution?.critical ?? 0} ({(((data.riskDistribution?.critical ?? 0) / (data.riskDistribution?.total || 1)) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block mb-1">Open Escalations</span>
                  <span className="text-xl font-bold text-indigo-400">{data.escalationCounts?.open ?? 0}</span>
                </div>
              </div>

              {/* Course Attendance Averages */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-white text-base">Course Attendance Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Course Code</th>
                        <th className="py-2.5 px-3">Course Title</th>
                        <th className="py-2.5 px-3 text-center">Enrolled</th>
                        <th className="py-2.5 px-3 text-center">Avg Attendance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {data.courseAttendanceAverages?.map((c: CourseAttendanceAvg) => (
                        <tr key={c.courseId} className="hover:bg-slate-800/30">
                          <td className="py-3 px-3 font-bold text-white">{c.courseCode}</td>
                          <td className="py-3 px-3 text-slate-300">{c.courseName}</td>
                          <td className="py-3 px-3 text-center font-semibold text-white">{c.enrolledCount}</td>
                          <td className="py-3 px-3 text-center font-bold text-indigo-400">{c.averageAttendance}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottleneck Units */}
              {(data.bottleneckUnits?.length ?? 0) > 0 && (
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="font-bold text-white text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Curriculum Bottleneck Units (&gt;40% Failure Rate)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {data.bottleneckUnits?.map((u: BottleneckUnit) => (
                      <div key={u.unitId} className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{u.courseCode}: {u.unitTitle}</span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            {u.failureRate}% Fail Rate
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{u.unitCode} requires targeted instructional intervention.</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
