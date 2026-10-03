"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import {
  BookOpen,
  Calendar,
  Users,
  Mic,
  Table,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface FacultyCourse {
  id: string;
  code: string;
  name: string;
  credits: number;
  departmentId: string;
  sessionCount: number;
  lastAttendanceDate: string | null;
  enrolledCount: number;
  classHealth: {
    critical: number;
    moderate: number;
    safe: number;
  };
}

export default function FacultyDashboardPage() {
  const { user } = useAuth();

  // Faculty query: assigned courses
  const {
    data: coursesData,
    isLoading: isLoadingCourses,
    isError: isErrorCourses,
    refetch: refetchCourses,
  } = useQuery({
    queryKey: ["faculty-courses"],
    queryFn: async () => {
      const res = await apiFetch("/api/v1/faculty/courses");
      if (!res.ok) throw new Error("Failed to load courses");
      const json = await res.json();
      return json.courses as FacultyCourse[];
    },
  });

  const firstName = user?.name.split(" ")[0] || "Faculty";

  // Format date helper
  const formatDate = (isoString: string | null) => {
    if (!isoString) return "No sessions recorded";
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <span>Welcome, {firstName}</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {user?.role}
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage active course cohorts, record attendance via AI voice, and track student risk levels.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/faculty/voice-entry"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition group"
          >
            <Mic className="w-4 h-4 group-hover:scale-110 transition" />
            <span>Voice Entry (SCR-03)</span>
          </Link>
        </div>
      </div>

      {/* Assigned Course Cards */}
      <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white">Your Courses</h2>
              <span className="text-xs text-slate-400 font-medium">
                ({coursesData?.length || 0} active)
              </span>
            </div>
            <button
              onClick={() => refetchCourses()}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="Refresh Courses"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {isLoadingCourses && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="p-6 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse space-y-4"
                >
                  <div className="h-6 bg-slate-800 rounded w-1/3" />
                  <div className="h-4 bg-slate-800/60 rounded w-2/3" />
                  <div className="h-16 bg-slate-800/40 rounded" />
                  <div className="h-10 bg-slate-800/20 rounded" />
                </div>
              ))}
            </div>
          )}

          {isErrorCourses && (
            <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-sm text-slate-300">Failed to load courses</p>
              <button
                onClick={() => refetchCourses()}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg transition"
              >
                Retry
              </button>
            </div>
          )}

          {!isLoadingCourses && !isErrorCourses && coursesData?.length === 0 && (
            <div className="p-12 text-center bg-slate-900/40 border border-slate-800 rounded-2xl">
              <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">No Courses Assigned</h3>
              <p className="text-xs text-slate-500 mt-1">
                You do not have any teaching sessions or courses mapped to your account.
              </p>
            </div>
          )}

          {!isLoadingCourses && !isErrorCourses && coursesData && coursesData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {coursesData.map((course) => {
                const totalStudents = course.enrolledCount || 40;
                return (
                  <div
                    key={course.id}
                    className="p-6 bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-2xl transition flex flex-col justify-between space-y-6 shadow-md"
                  >
                    <div>
                      {/* Top Code & Name */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 inline-block mb-1.5">
                            {course.code}
                          </span>
                          <h3 className="text-lg font-bold text-white tracking-tight">
                            {course.name}
                          </h3>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs text-slate-400 block font-medium">Credits</span>
                          <span className="text-sm font-bold text-slate-200">{course.credits}</span>
                        </div>
                      </div>

                      {/* Meta stats */}
                      <div className="flex items-center gap-4 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/60">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span>{totalStudents} Enrolled</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{course.sessionCount} Sessions</span>
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 mt-1">
                        <span className="text-slate-500">Last Attendance: </span>
                        <span className="text-slate-300 font-medium">
                          {formatDate(course.lastAttendanceDate)}
                        </span>
                      </div>

                      {/* Class Health Breakdown Cards (Critical / Moderate / Safe) */}
                      <div className="mt-5 space-y-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Class Academic Health
                        </span>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {/* Critical */}
                          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                            <div className="flex items-center justify-center gap-1 text-rose-400 mb-0.5">
                              <AlertOctagon className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase">Critical</span>
                            </div>
                            <span className="text-lg font-bold font-mono text-rose-300">
                              {course.classHealth.critical}
                            </span>
                          </div>

                          {/* Moderate */}
                          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                            <div className="flex items-center justify-center gap-1 text-amber-400 mb-0.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase">Moderate</span>
                            </div>
                            <span className="text-lg font-bold font-mono text-amber-300">
                              {course.classHealth.moderate}
                            </span>
                          </div>

                          {/* Safe */}
                          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                            <div className="flex items-center justify-center gap-1 text-emerald-400 mb-0.5">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase">Safe</span>
                            </div>
                            <span className="text-lg font-bold font-mono text-emerald-300">
                              {course.classHealth.safe}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="pt-4 border-t border-slate-800/80 flex flex-wrap gap-2.5">
                      <Link
                        href={`/faculty/courses/${course.id}/attendance-grid`}
                        className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition border border-slate-700/80"
                      >
                        <Table className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Take Attendance</span>
                      </Link>

                      <Link
                        href={`/faculty/voice-entry?courseId=${course.id}&mode=ATTENDANCE`}
                        className="flex-1 min-w-[130px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600/15 hover:bg-indigo-600/30 text-indigo-300 hover:text-white rounded-xl text-xs font-semibold transition border border-indigo-500/30"
                      >
                        <Mic className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Voice Entry</span>
                      </Link>

                      <Link
                        href={`/faculty/courses/${course.id}/gradebook`}
                        className="flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition border border-slate-700/80"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Gradebook</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
    </div>
  );
}
