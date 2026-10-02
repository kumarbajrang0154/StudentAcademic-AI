"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { StudentShell } from "@/components/student/student-shell";
import {
  BarChart2,
  Lock,
  Users,
  Shield,
  Award,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";

interface CourseOption {
  courseId: string;
  courseCode: string;
  courseName: string;
}

interface HistogramBin {
  range: string;
  min: number;
  max: number;
  count: number;
}

interface BenchmarksResponse {
  courseId: string;
  cohortSize: number;
  studentScore?: number;
  percentile?: number;
  mean?: number;
  sd?: number;
  median: number;
  histogramBins?: HistogramBin[];
  restricted: boolean;
  reason?: string;
}

export default function StudentBenchmarksPage() {
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  // 1. Fetch Overview courses for dropdown
  const { data: overviewData } = useQuery<{ courses: CourseOption[] }>({
    queryKey: ["student-overview"],
    queryFn: async () => {
      const res = await apiFetch("/api/v1/student/overview");
      if (!res.ok) throw new Error("Failed to load courses");
      return res.json();
    },
  });

  // Auto-select first course when loaded
  useEffect(() => {
    if (overviewData?.courses?.length && !selectedCourseId) {
      setSelectedCourseId(overviewData.courses[0]!.courseId);
    }
  }, [overviewData, selectedCourseId]);

  // 2. Fetch Benchmarks for selected course
  const {
    data: benchmarkData,
    isLoading,
    error,
    refetch,
  } = useQuery<BenchmarksResponse>({
    queryKey: ["student-benchmarks", selectedCourseId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/student/benchmarks?courseId=${selectedCourseId}`);
      if (!res.ok) throw new Error("Failed to load benchmarks");
      return res.json();
    },
    enabled: !!selectedCourseId,
  });

  const selectedCourse = overviewData?.courses.find((c) => c.courseId === selectedCourseId);

  return (
    <StudentShell>
      {/* Header & Course Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg">
              <BarChart2 className="w-6 h-6" />
            </span>
            <span>Cohort Benchmarks &amp; Distribution</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Comparative percentile ranking against peer distributions with automated privacy safeguards.
          </p>
        </div>

        {/* Course Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="benchmark-course" className="text-xs text-slate-400 whitespace-nowrap">
            Select Course:
          </label>
          <select
            id="benchmark-course"
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-indigo-500"
          >
            {overviewData?.courses.map((course) => (
              <option key={course.courseId} value={course.courseId}>
                {course.courseCode} - {course.courseName}
              </option>
            ))}
          </select>

          <button
            onClick={() => refetch()}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl"
            title="Refresh benchmark"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="h-72 rounded-2xl bg-slate-900/60 border border-slate-800 animate-shimmer" />
        </div>
      )}

      {error && !isLoading && (
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-rose-500/20 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-lg font-semibold text-white">Could not load cohort benchmarks</h3>
          <p className="text-sm text-slate-400">
            {error instanceof Error ? error.message : "Failed to load benchmark records."}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition"
          >
            Retry
          </button>
        </div>
      )}

      {benchmarkData && !isLoading && (
        <div className="space-y-8">
          {/* Privacy Case: Cohort < 15 */}
          {benchmarkData.restricted ? (
            <div className="p-8 rounded-2xl bg-slate-900/70 border border-amber-500/30 backdrop-blur-md shadow-xl space-y-6 max-w-2xl mx-auto text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-white">
                  Privacy Safeguard Active
                </h3>
                <p className="text-xs text-amber-300 font-mono mt-1">
                  {benchmarkData.reason ||
                    "Cohort size under 15; detailed distribution withheld to protect privacy"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800 max-w-md mx-auto text-left">
                <div>
                  <span className="text-[11px] text-slate-400">Cohort Enrolled Size</span>
                  <p className="text-2xl font-mono font-bold text-white mt-0.5">
                    {benchmarkData.cohortSize} students
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400">Cohort Median Score</span>
                  <p className="text-2xl font-mono font-bold text-indigo-400 mt-0.5">
                    {benchmarkData.median}%
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                Under student academic data protection policies, full bell curves and granular frequency distributions are restricted when section size is below 15 to prevent reverse-engineering of peer grades.
              </p>
            </div>
          ) : (
            /* Standard Case: Full Distribution and Percentile */
            <div className="space-y-6">
              {/* Summary Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Your Percentile</span>
                    <Award className="w-4 h-4 text-indigo-400" />
                  </div>
                  <p className="text-3xl font-extrabold font-mono text-indigo-400">
                    {benchmarkData.percentile?.toFixed(0)}th
                  </p>
                  <span className="text-[11px] text-slate-500">Above {benchmarkData.percentile}% of cohort</span>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Your Score</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-3xl font-extrabold font-mono text-white">
                    {benchmarkData.studentScore?.toFixed(1)}%
                  </p>
                  <span className="text-[11px] text-slate-500">Mastery Score</span>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Cohort Mean (μ)</span>
                    <Users className="w-4 h-4 text-slate-400" />
                  </div>
                  <p className="text-3xl font-extrabold font-mono text-slate-200">
                    {benchmarkData.mean?.toFixed(1)}%
                  </p>
                  <span className="text-[11px] text-slate-500">σ = {benchmarkData.sd?.toFixed(1)}</span>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Cohort Median</span>
                    <Shield className="w-4 h-4 text-cyan-400" />
                  </div>
                  <p className="text-3xl font-extrabold font-mono text-cyan-400">
                    {benchmarkData.median}%
                  </p>
                  <span className="text-[11px] text-slate-500">N = {benchmarkData.cohortSize} students</span>
                </div>
              </div>

              {/* Histogram Distribution Chart */}
              <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-md shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      Mastery Score Distribution ({selectedCourse?.courseCode})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Peer histogram with your score highlighted in indigo
                    </p>
                  </div>
                </div>

                <div className="h-64 w-full bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={benchmarkData.histogramBins || []}
                      margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis dataKey="range" stroke="#64748B" fontSize={11} />
                      <YAxis stroke="#64748B" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length && payload[0]) {
                            const bin = payload[0].payload as HistogramBin;
                            return (
                              <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg shadow-xl text-xs">
                                <p className="font-semibold text-white">Range: {bin.range}%</p>
                                <p className="text-slate-400 font-mono mt-0.5">
                                  {bin.count} {bin.count === 1 ? "student" : "students"}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {(benchmarkData.histogramBins || []).map((bin, index) => {
                          const studentScore = benchmarkData.studentScore ?? 0;
                          const isStudentBin =
                            studentScore >= bin.min && studentScore <= bin.max;
                          return (
                            <Cell
                              key={`cell-${index}`}
                              fill={isStudentBin ? "#4F46E5" : "#334155"}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </StudentShell>
  );
}
