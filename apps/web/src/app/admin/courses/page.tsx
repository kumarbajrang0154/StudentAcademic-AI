"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  BookOpen,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface CourseRow {
  id: string;
  code: string;
  name: string;
  department: string;
  credits: number;
  enrolledStudentsCount: number;
  averageAttendance: number;
  averageMastery: number;
  bottlenecksCount: number;
  complianceRate: number;
  facultyName: string;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/v1/admin/courses");
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
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const filtered = courses.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q)
    );
  });

  const totalBottlenecks = courses.reduce((acc, c) => acc + (c.bottlenecksCount || 0), 0);
  const avgAttendance =
    courses.length > 0
      ? Math.round(courses.reduce((acc, c) => acc + c.averageAttendance, 0) / courses.length)
      : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            Curriculum Bottlenecks & Faculty Compliance
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Departmental course performance telemetry, unit-level failure bottlenecks, and faculty mark entry compliance.
          </p>
        </div>

        <span className="text-xs font-semibold px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 self-start sm:self-auto">
          {courses.length} Course(s) Active
        </span>
      </div>

      {/* Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total Monitored Courses
          </span>
          <div className="text-2xl font-extrabold text-white mt-1">{courses.length}</div>
          <p className="text-[11px] text-slate-400 mt-1">Active in department scope</p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
            Curriculum Bottlenecks
          </span>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">{totalBottlenecks}</div>
          <p className="text-[11px] text-slate-400 mt-1">Units with &gt;40% student failure</p>
        </div>

        <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl">
          <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
            Cohort Avg Attendance
          </span>
          <div className="text-2xl font-extrabold text-indigo-400 mt-1">{avgAttendance}%</div>
          <p className="text-[11px] text-slate-400 mt-1">Across all registered offerings</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search courses by code or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Courses Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading courses...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400 text-xs">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
            No courses found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Course</th>
                  <th className="py-3.5 px-3">Dept</th>
                  <th className="py-3.5 px-3">Enrolled</th>
                  <th className="py-3.5 px-3">Avg Attendance</th>
                  <th className="py-3.5 px-3">Avg Mastery</th>
                  <th className="py-3.5 px-3">Bottlenecks</th>
                  <th className="py-3.5 px-4 text-right">Faculty Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{c.code}</div>
                      <div className="text-[11px] text-slate-400">{c.name}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-slate-300">{c.department}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-slate-300">{c.enrolledStudentsCount} students</span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-mono font-bold ${
                          c.averageAttendance < 75 ? "text-rose-400" : "text-emerald-400"
                        }`}
                      >
                        {c.averageAttendance}%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-slate-200">{c.averageMastery}%</span>
                    </td>
                    <td className="py-3 px-3">
                      {c.bottlenecksCount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-[11px]">
                          <AlertTriangle className="w-3 h-3" />
                          {c.bottlenecksCount} Unit(s)
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-400">Optimal</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {c.complianceRate}% on-time
                      </div>
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
