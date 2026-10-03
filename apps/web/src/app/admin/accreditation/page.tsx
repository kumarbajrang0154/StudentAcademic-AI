"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  Award,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface COTableItem {
  id: string;
  code: string;
  statement: string;
  target: number;
  studentsEnrolled: number;
  studentsAssessed: number;
  targetCount: number;
  attainmentPercentage: number;
  level: number;
}

interface CourseAccreditationData {
  course: {
    id: string;
    code: string;
    name: string;
    departmentId: string;
    departmentCode: string;
  };
  coTable: COTableItem[];
  coPoMatrix: {
    pos: Array<{ id: string; code: string; statement: string }>;
    rows: Array<{
      coId: string;
      coCode: string;
      mappings: Record<string, number>;
    }>;
  };
  poAttainment: Array<{
    poId: string;
    poCode: string;
    statement: string;
    attainmentLevel: number;
  }>;
  indirectAssessment: {
    status: string;
    note: string;
  };
}

interface ProgramAccreditationData {
  department: {
    id: string;
    code: string;
    name: string;
  };
  courses: Array<{ id: string; code: string; name: string }>;
  pos: Array<{ id: string; code: string; statement: string }>;
  programMatrix: Array<{
    poId: string;
    poCode: string;
    statement: string;
    courseAttainments: Record<string, number>;
    programAttainment: number;
  }>;
}

export default function AccreditationPage() {
  const [courses, setCourses] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"course" | "program">("course");

  const [courseData, setCourseData] = useState<CourseAccreditationData | null>(null);
  const [programData, setProgramData] = useState<ProgramAccreditationData | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  // Fetch course list on mount
  useEffect(() => {
    async function loadCourses() {
      try {
        const res = await apiFetch("/admin/courses");
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

  // Fetch data when selection or viewMode changes
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        if (viewMode === "course") {
          if (!selectedCourseId) return;
          const res = await apiFetch(`/admin/accreditation/${selectedCourseId}`);
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.message || "Failed to load accreditation data");
          }
          const json = await res.json();
          setCourseData(json);
        } else {
          const res = await apiFetch("/admin/accreditation/program");
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.message || "Failed to load program accreditation");
          }
          const json = await res.json();
          setProgramData(json);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error fetching accreditation");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedCourseId, viewMode]);

  // Handle Export Download
  const handleDownload = async (format: "xlsx" | "pdf" | "csv") => {
    if (!selectedCourseId && viewMode === "course") return;
    setDownloadingFormat(format);

    try {
      const endpoint = viewMode === "course"
        ? `/admin/reports/accreditation?courseId=${selectedCourseId}&format=${format}`
        : `/admin/accreditation/program?format=${format}`;

      const res = await apiFetch(endpoint);
      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const courseObj = courses.find((c) => c.id === selectedCourseId);
      const code = courseObj?.code || "Accreditation";
      const filename = `${code}_accreditation_${new Date().toISOString().slice(0, 10)}.${format}`;

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

  const getLevelBadge = (level: number) => {
    switch (level) {
      case 3:
        return {
          label: "Level 3 (>=70%)",
          bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        };
      case 2:
        return {
          label: "Level 2 (>=60%)",
          bg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
        };
      case 1:
        return {
          label: "Level 1 (>=50%)",
          bg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        };
      default:
        return {
          label: "Level 0 (<50%)",
          bg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
        };
    }
  };

  return (
    <>
      {/* Print Stylesheet */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          nav, aside, header, .no-print, button {
            display: none !important;
          }
          .print-area {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-table {
            border-collapse: collapse !important;
            width: 100% !important;
            color: black !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #ccc !important;
            padding: 6px !important;
            color: black !important;
          }
        }
      `}</style>

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 print-area">
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6 no-print">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="p-2 bg-gradient-to-tr from-amber-600 to-indigo-600 rounded-xl text-white shadow-md shadow-indigo-600/20">
                <Award className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Accreditation & OBE Attainment
              </h1>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                NBA / NAAC
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              Outcome-Based Education attainment matrix, CO direct assessment from tagged item scores, and PO correlation analysis.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
              <button
                onClick={() => setViewMode("course")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode === "course"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Course View
              </button>
              <button
                onClick={() => setViewMode("program")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  viewMode === "program"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Program Matrix
              </button>
            </div>

            {/* Course Picker (when in course view) */}
            {viewMode === "course" && (
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
                disabled={downloadingFormat !== null}
                className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                title="Download formatted Excel workbook"
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
                disabled={downloadingFormat !== null}
                className="px-3 py-2 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                title="Download vector PDF document"
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
                disabled={downloadingFormat !== null}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                title="Download UTF-8 CSV"
              >
                {downloadingFormat === "csv" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                CSV
              </button>
              <button
                onClick={() => window.print()}
                className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition"
                title="Print report"
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-400 min-h-[40vh]">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
            <span>Computing outcome attainment metrics...</span>
          </div>
        ) : error ? (
          <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Failed to generate accreditation metrics</p>
              <p className="text-xs text-rose-400/80">{error}</p>
            </div>
          </div>
        ) : viewMode === "course" && courseData ? (
          <div className="space-y-8">
            {/* Course Summary Card */}
            <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400 block mb-0.5">
                  Course Accreditation Unit
                </span>
                <h2 className="text-lg font-bold text-white">
                  {courseData.course.code} - {courseData.course.name}
                </h2>
                <span className="text-xs text-slate-400">
                  Department of {courseData.course.departmentCode} • Evaluation Year 2026-2027
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Indirect Assessment</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Not Collected
                  </span>
                </div>
              </div>
            </div>

            {/* 1. CO Attainment Table */}
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-base">Course Outcome (CO) Direct Attainment</h3>
                  <p className="text-xs text-slate-400">
                    Evaluation based on student performance on tagged assessment questions (Target: ≥ 60% mark).
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1" />
                  Level 3 (≥70%)
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 ml-2 mr-1" />
                  Level 2 (≥60%)
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 ml-2 mr-1" />
                  Level 1 (≥50%)
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm print-table">
                  <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">CO Code</th>
                      <th className="py-3 px-4">Outcome Statement</th>
                      <th className="py-3 px-4 text-center">Target</th>
                      <th className="py-3 px-4 text-center">Assessed / Enrolled</th>
                      <th className="py-3 px-4 text-center">Met Target</th>
                      <th className="py-3 px-4 text-center">Attainment %</th>
                      <th className="py-3 px-4 text-center">Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 text-xs">
                    {courseData.coTable.map((co) => {
                      const badge = getLevelBadge(co.level);
                      return (
                        <tr key={co.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                            {co.code}
                          </td>
                          <td className="py-3 px-4 max-w-md text-slate-300">
                            {co.statement}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-400">
                            {co.target}%
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-semibold text-white">{co.studentsAssessed}</span>
                            <span className="text-slate-500"> / {co.studentsEnrolled}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-white">
                            {co.targetCount}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-bold text-white">{co.attainmentPercentage}%</span>
                              <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden hidden sm:block">
                                <div
                                  className={`h-full ${
                                    co.level >= 2
                                      ? "bg-emerald-500"
                                      : co.level === 1
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                  }`}
                                  style={{ width: `${Math.min(100, co.attainmentPercentage)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. CO-PO Correlation Matrix & PO Attainments */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* CO-PO Correlation Heatmap */}
              <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="font-bold text-white text-base">CO-PO Articulation Matrix</h3>
                  <p className="text-xs text-slate-400">
                    Correlation levels: 3 = High, 2 = Medium, 1 = Low, - = No correlation.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs print-table">
                    <thead className="bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3 text-left">Course Outcome</th>
                        {courseData.coPoMatrix.pos.map((p) => (
                          <th key={p.id} className="py-2.5 px-3" title={p.statement}>
                            {p.code}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {courseData.coPoMatrix.rows.map((row) => (
                        <tr key={row.coId} className="hover:bg-slate-800/30">
                          <td className="py-3 px-3 text-left font-bold text-white">
                            {row.coCode}
                          </td>
                          {courseData.coPoMatrix.pos.map((p) => {
                            const val = row.mappings[p.code] || 0;
                            return (
                              <td key={p.id} className="py-3 px-3">
                                {val > 0 ? (
                                  <span
                                    className={`inline-block w-7 h-7 rounded-lg leading-7 font-bold ${
                                      val === 3
                                        ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                                        : val === 2
                                        ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/30"
                                        : "bg-slate-800 text-slate-400 border border-slate-700"
                                    }`}
                                  >
                                    {val}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Course PO Attainment Level */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="font-bold text-white text-base">PO Attainment Scores</h3>
                  <p className="text-xs text-slate-400">
                    Weighted average of mapped CO attainment levels (0.0 - 3.0 scale).
                  </p>
                </div>

                <div className="space-y-3">
                  {courseData.poAttainment.map((po) => {
                    const pctOf3 = (po.attainmentLevel / 3) * 100;
                    return (
                      <div key={po.poId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-200" title={po.statement}>
                            {po.poCode}
                          </span>
                          <span className="font-bold text-indigo-400">
                            Level {po.attainmentLevel.toFixed(2)} / 3.0
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400"
                            style={{ width: `${Math.min(100, pctOf3)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : viewMode === "program" && programData ? (
          /* Program Matrix View */
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-white text-base">
                Department Program Outcome (PO) Matrix - {programData.department.name}
              </h3>
              <p className="text-xs text-slate-400">
                Course-level PO attainment aggregated across all courses in the department with overall program averages.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs print-table">
                <thead className="bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 text-left">Program Outcome (PO)</th>
                    {programData.courses.map((c) => (
                      <th key={c.id} className="py-3 px-3">
                        {c.code}
                      </th>
                    ))}
                    <th className="py-3 px-4 bg-indigo-950/40 text-indigo-300 font-bold">
                      Program Attainment
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {programData.programMatrix.map((item) => (
                    <tr key={item.poId} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 text-left font-bold text-white" title={item.statement}>
                        {item.poCode}
                      </td>
                      {programData.courses.map((c) => {
                        const val = item.courseAttainments[c.code] ?? 0;
                        return (
                          <td key={c.id} className="py-3 px-3 font-semibold text-slate-300">
                            {val > 0 ? val.toFixed(2) : "-"}
                          </td>
                        );
                      })}
                      <td className="py-3 px-4 bg-indigo-950/20 font-bold text-indigo-400">
                        Level {item.programAttainment.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
