"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Award,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

interface FacultyItem {
  id: string;
  name: string;
  email: string;
  department: { id: string; code: string; name: string } | null;
  coursesCount: number;
  courses: Array<{ id: string; code: string; name: string }>;
  totalSessions: number;
  totalStudents: number;
}

export default function HodFacultyPage() {
  const searchParams = useSearchParams();
  const departmentId = searchParams.get("departmentId");

  const [facultyList, setFacultyList] = useState<FacultyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFaculty = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = departmentId
        ? `/api/v1/hod/faculty?departmentId=${encodeURIComponent(departmentId)}`
        : "/api/v1/hod/faculty";

      const res = await apiFetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load faculty progress (${res.status})`);
      }
      const data = await res.json();
      setFacultyList(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load faculty");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    fetchFaculty();
  }, [fetchFaculty]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Award className="w-6 h-6 text-sky-400" />
            Faculty Academic Delivery & Progress
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Department faculty instruction tracking, syllabus variance analysis, and assessment compliance.
          </p>
        </div>

        <button
          onClick={() => fetchFaculty()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500 mb-3" />
          <p className="text-xs">Loading faculty progress metrics...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span className="text-xs font-medium">{error}</span>
          </div>
          <button
            onClick={() => fetchFaculty()}
            className="px-3 py-1.5 rounded-lg bg-rose-600/30 text-xs font-semibold hover:bg-rose-600/40"
          >
            Retry
          </button>
        </div>
      ) : facultyList.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
          <Award className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">No faculty members found</h3>
          <p className="text-xs mt-1 text-slate-500">No active faculty in this department.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {facultyList.map((faculty) => {
            const detailUrl = departmentId
              ? `/hod/faculty/${faculty.id}?departmentId=${encodeURIComponent(departmentId)}`
              : `/hod/faculty/${faculty.id}`;

            return (
              <div
                key={faculty.id}
                className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white tracking-tight">{faculty.name}</h3>
                      <p className="text-xs text-slate-400">{faculty.email}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                      {faculty.department?.code || "CSE"}
                    </span>
                  </div>

                  {/* Summary Tiles */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60">
                    <div className="p-2 rounded-xl bg-slate-950/40 text-center">
                      <div className="text-base font-bold text-white">{faculty.coursesCount}</div>
                      <div className="text-[10px] text-slate-400">Courses</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/40 text-center">
                      <div className="text-base font-bold text-white">{faculty.totalSessions}</div>
                      <div className="text-[10px] text-slate-400">Sessions</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/40 text-center">
                      <div className="text-base font-bold text-white">{faculty.totalStudents}</div>
                      <div className="text-[10px] text-slate-400">Students</div>
                    </div>
                  </div>

                  {/* Courses List */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Assigned Courses
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {faculty.courses.map((c) => (
                        <span
                          key={c.id}
                          className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-800/80 text-sky-300 border border-slate-700"
                        >
                          {c.code}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <Link
                  href={detailUrl}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-sky-600/15 hover:bg-sky-600/25 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-all"
                >
                  View Progress Report <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
