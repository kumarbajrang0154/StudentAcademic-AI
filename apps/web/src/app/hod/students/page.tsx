"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Users,
  Search,
  AlertTriangle,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface StudentItem {
  id: string;
  name: string;
  email: string;
  rollNumber: string;
  attendanceRate: number | string;
  masteryScore: number | string;
  worstRisk: "CRITICAL" | "MODERATE" | "SAFE";
  failRisk: string;
  coursesAtRisk: string[];
  totalCourses: number;
  mentor: { id: string; name: string } | null;
}

export default function HodStudentsPage() {
  const searchParams = useSearchParams();
  const departmentId = searchParams.get("departmentId");

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");

  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("limit", "15");
      if (search.trim()) params.append("search", search.trim());
      if (riskFilter !== "ALL") params.append("risk", riskFilter);
      if (departmentId) params.append("departmentId", departmentId);

      const res = await apiFetch(`/api/v1/hod/students?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load student dossiers (${res.status})`);
      }
      const data = await res.json();
      setStudents(data.students || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [page, search, riskFilter, departmentId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchStudents();
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "CRITICAL":
        return "bg-rose-500/15 text-rose-400 border-rose-500/30";
      case "MODERATE":
        return "bg-amber-500/15 text-amber-400 border-amber-500/30";
      default:
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-sky-400" />
            Student Academic Monitoring
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Department student dossiers, risk trajectory indicators, and individual progress reports.
          </p>
        </div>

        <button
          onClick={() => fetchStudents()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by student name, roll number, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </form>

        <select
          value={riskFilter}
          onChange={(e) => {
            setRiskFilter(e.target.value);
            setPage(1);
          }}
          className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-sky-500"
        >
          <option value="ALL">All Risk Levels</option>
          <option value="CRITICAL">Critical Risk Only</option>
          <option value="MODERATE">Moderate Risk Only</option>
          <option value="SAFE">Safe Cohort Only</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500 mb-3" />
          <p className="text-xs">Loading student cohort...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span className="text-xs font-medium">{error}</span>
          </div>
          <button
            onClick={() => fetchStudents()}
            className="px-3 py-1.5 rounded-lg bg-rose-600/30 text-xs font-semibold hover:bg-rose-600/40"
          >
            Retry
          </button>
        </div>
      ) : students.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
          <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">No students match your query</h3>
          <p className="text-xs mt-1 text-slate-500">Try adjusting your search criteria or risk filter.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/40">
                <th className="py-3.5 pl-4">Student</th>
                <th className="py-3.5">Roll Number</th>
                <th className="py-3.5">Attendance</th>
                <th className="py-3.5">Mastery</th>
                <th className="py-3.5">Worst Risk</th>
                <th className="py-3.5">Fail Risk</th>
                <th className="py-3.5">Courses at Risk</th>
                <th className="py-3.5 text-right pr-4">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {students.map((student) => {
                const detailUrl = departmentId
                  ? `/hod/students/${student.id}?departmentId=${encodeURIComponent(departmentId)}`
                  : `/hod/students/${student.id}`;

                return (
                  <tr key={student.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pl-4">
                      <div className="font-semibold text-slate-200">{student.name}</div>
                      <div className="text-[11px] text-slate-400">{student.email}</div>
                    </td>
                    <td className="py-3 text-slate-300 font-mono text-[11px]">{student.rollNumber}</td>
                    <td className="py-3">
                      <span
                        className={`font-semibold ${
                          typeof student.attendanceRate === "number" && student.attendanceRate < 75
                            ? "text-rose-400"
                            : "text-slate-300"
                        }`}
                      >
                        {student.attendanceRate !== "n/a" ? `${student.attendanceRate}%` : "n/a"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="text-slate-300 font-medium">
                        {student.masteryScore !== "n/a" ? `${student.masteryScore}%` : "n/a"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getRiskBadge(
                          student.worstRisk,
                        )}`}
                      >
                        {student.worstRisk}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="text-[11px] text-slate-400 font-medium">{student.failRisk}</span>
                    </td>
                    <td className="py-3">
                      {student.coursesAtRisk.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {student.coursesAtRisk.map((code) => (
                            <span
                              key={code}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-emerald-400">None</span>
                      )}
                    </td>
                    <td className="py-3 text-right pr-4">
                      <Link
                        href={detailUrl}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-sky-600/15 hover:bg-sky-600/25 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-colors"
                      >
                        View Report <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing {students.length} of {total} students
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 rounded-lg border border-slate-800 disabled:opacity-40 hover:bg-slate-800"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 rounded-lg border border-slate-800 disabled:opacity-40 hover:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
