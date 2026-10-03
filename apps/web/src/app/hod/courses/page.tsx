"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  BookOpen,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";

interface CourseRow {
  id: string;
  code: string;
  name: string;
  department: string | { code?: string; name?: string };
  credits: number;
  enrolledStudentsCount: number;
  averageAttendance: number;
  averageMastery: number;
  bottlenecksCount: number;
  complianceRate: number;
  facultyName: string;
}

export default function HodCoursesPage() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/v1/hod/courses");
      if (!res.ok) {
        throw new Error(`Failed to load courses (${res.status})`);
      }
      const json = await res.json();
      setCourses(json.courses || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const filtered = courses.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const deptStr =
      typeof c.department === "object"
        ? (c.department as { code?: string; name?: string })?.code ||
          (c.department as { code?: string; name?: string })?.name ||
          ""
        : String(c.department || "");
    return (
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      deptStr.toLowerCase().includes(q) ||
      (c.facultyName && c.facultyName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-sky-400" />
            Courses & Academic Delivery
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Department-scoped course health, attendance metrics, and curriculum compliance.
          </p>
        </div>
        <button
          onClick={fetchCourses}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-850 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by code, name, or faculty..."
          className="w-full pl-10 pr-4 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
        />
      </div>

      {/* Error / Retry State */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs text-rose-200">{error}</span>
          </div>
          <button
            onClick={fetchCourses}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !courses.length && (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
          <p className="text-xs">Loading department courses...</p>
        </div>
      )}

      {/* Courses Table */}
      {!loading && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Credits</th>
                  <th className="py-3 px-4">Faculty</th>
                  <th className="py-3 px-4">Enrolled</th>
                  <th className="py-3 px-4">Avg Attendance</th>
                  <th className="py-3 px-4">Avg Mastery</th>
                  <th className="py-3 px-4">Compliance</th>
                  <th className="py-3 px-4">Bottlenecks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filtered.map((course) => {
                  const compliance = Math.round(course.complianceRate ?? 0);
                  const isLowCompliance = compliance < 75;
                  const attendance = Math.round(course.averageAttendance ?? 0);

                  return (
                    <tr key={course.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{course.code}</div>
                        <div className="text-[11px] text-slate-400">{course.name}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{course.credits}</td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{course.facultyName || "Unassigned"}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          {course.enrolledStudentsCount}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            attendance < 75 ? "text-amber-400" : "text-emerald-400"
                          }`}
                        >
                          {attendance > 0 ? `${attendance}%` : "n/a"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-200">
                          {course.averageMastery > 0 ? `${Math.round(course.averageMastery)}%` : "n/a"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            isLowCompliance
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}
                        >
                          {isLowCompliance ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          {compliance}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {course.bottlenecksCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            {course.bottlenecksCount} units
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No courses found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
