"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { StudentShell } from "@/components/student/student-shell";
import { RiskBadge, RiskLevel } from "@/components/student/risk-badge";
import { RiskModal } from "@/components/student/risk-modal";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  AlertTriangle,
  ChevronRight,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
} from "recharts";

interface CourseCardData {
  courseId: string;
  courseCode: string;
  courseName: string;
  facultyName: string;
  credits: number;
  riskScore: number;
  riskCategory: RiskLevel;
  masteryScore: number;
  attendanceRate: number;
  velocity: number;
}

interface DeadlineData {
  id: string;
  title: string;
  type: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  dueDate: string;
  maxScore: number;
  weight: number;
  daysRemaining: number;
}

interface SparklinePoint {
  date: string;
  mastery: number;
}

interface StudentOverviewResponse {
  student: {
    id: string;
    name: string;
    email: string;
    rollNumber: string | null;
  };
  overallMastery: number;
  overallVelocity: number;
  velocityBand: "IMPROVING" | "STABLE" | "DECLINING" | "STEEP_DECLINE" | string;
  velocityDeltaLastWeek: number;
  sparklinePoints: SparklinePoint[];
  aggregateAttendance: number;
  courses: CourseCardData[];
  upcomingDeadlines: DeadlineData[];
}

function getTimeBasedGreeting(name: string): string {
  const hour = new Date().getHours();
  const firstName = name ? name.split(" ")[0] : "Student";
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [selectedRiskCourse, setSelectedRiskCourse] = useState<{
    courseId: string;
    riskCategory: string;
  } | null>(null);

  const { data, isLoading, error, refetch } = useQuery<StudentOverviewResponse>({
    queryKey: ["student-overview"],
    queryFn: async () => {
      const res = await fetch("/api/v1/student/overview");
      if (!res.ok) {
        throw new Error(`Failed to load student overview: ${res.statusText}`);
      }
      return res.json();
    },
  });

  const greeting = getTimeBasedGreeting(user?.name ?? "");

  return (
    <StudentShell>
      {/* Risk Modal */}
      {selectedRiskCourse && (
        <RiskModal
          isOpen={!!selectedRiskCourse}
          onClose={() => setSelectedRiskCourse(null)}
          studentId={user?.id || ""}
          courseId={selectedRiskCourse.courseId}
          persistedRiskCategory={selectedRiskCourse.riskCategory}
        />
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {greeting}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time mastery trajectory, predictive attendance risk, and course diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition"
            title="Refresh metrics"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-slate-900/60 border border-slate-800/80 animate-shimmer p-6"
              />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-slate-900/60 border border-slate-800/80 animate-shimmer p-6" />
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-rose-500/20 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-lg font-semibold text-white">Could not load academic dashboard</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {error instanceof Error ? error.message : "An unexpected network error occurred."}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Loaded Dashboard Content */}
      {data && !isLoading && (
        <div className="space-y-8">
          {/* Top Row: Velocity Card, Quick Attendance Gauge, Milestones */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Academic Velocity Card */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-lg shadow-black/20 flex flex-col justify-between hover:border-slate-700/60 transition">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Academic Velocity
                  </span>
                  {/* Arrow Badge */}
                  {data.velocityBand === "IMPROVING" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <TrendingUp className="w-3.5 h-3.5" />
                      IMPROVING
                    </span>
                  )}
                  {data.velocityBand === "STABLE" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      <Minus className="w-3.5 h-3.5" />
                      STABLE
                    </span>
                  )}
                  {data.velocityBand === "DECLINING" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <TrendingDown className="w-3.5 h-3.5" />
                      DECLINING
                    </span>
                  )}
                  {data.velocityBand === "STEEP_DECLINE" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <TrendingDown className="w-3.5 h-3.5" />
                      STEEP DECLINE
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white font-mono">
                    {data.overallMastery.toFixed(1)}%
                  </span>
                  <span className="text-xs text-slate-400">Avg. Mastery</span>
                </div>

                <p className="text-xs text-slate-400 mt-1">
                  {data.overallVelocity >= 0 ? "+" : ""}
                  <span className="font-mono text-slate-300">{data.overallVelocity.toFixed(3)}</span>
                  %/day ({data.velocityDeltaLastWeek >= 0 ? "+" : ""}
                  {data.velocityDeltaLastWeek.toFixed(1)}% pts last 7d)
                </p>
              </div>

              {/* 14-day Sparkline */}
              <div className="h-16 w-full mt-4 -mb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.sparklinePoints}>
                    <defs>
                      <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length && payload[0]) {
                          const item = payload[0].payload as SparklinePoint;
                          return (
                            <div className="bg-slate-900 border border-slate-800 px-2 py-1 rounded shadow text-[10px] text-white font-mono">
                              {item.date}: {item.mastery.toFixed(1)}%
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="mastery"
                      stroke="#6366F1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#velocityGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. Quick Attendance Gauge */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-lg shadow-black/20 flex flex-col justify-between hover:border-slate-700/60 transition">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Aggregate Attendance
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    data.aggregateAttendance >= 75
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : data.aggregateAttendance >= 65
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  }`}
                >
                  {data.aggregateAttendance >= 75 ? "Safe Zone" : "At Risk"}
                </span>
              </div>

              {/* SVG Ring Gauge */}
              <div className="flex items-center justify-center my-3">
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    {/* Background track */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke="#1E293B"
                      strokeWidth="8"
                    />
                    {/* Progress stroke */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke={data.aggregateAttendance >= 75 ? "#10B981" : "#F43F5E"}
                      strokeWidth="8"
                      strokeDasharray={2 * Math.PI * 40}
                      strokeDashoffset={
                        2 * Math.PI * 40 * (1 - Math.min(100, data.aggregateAttendance) / 100)
                      }
                      strokeLinecap="round"
                      className="transition-all duration-500 ease-out"
                    />
                  </svg>
                  {/* Central Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-bold font-mono text-white">
                      {data.aggregateAttendance.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">Statutory 75%</span>
                  </div>
                </div>
              </div>

              {/* Simulate Safe-Bunks Link */}
              <Link
                href="/student/attendance"
                className="w-full py-2 px-3 text-center text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <span>Simulate Safe-Bunks</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* 3. Upcoming Milestones Card */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-lg shadow-black/20 flex flex-col justify-between hover:border-slate-700/60 transition">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Upcoming Milestones
                  </span>
                  <Link
                    href="/student/calendar"
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
                  >
                    View All <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>

                {data.upcomingDeadlines.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No deadlines in the next 14 days
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.upcomingDeadlines.map((dl) => (
                      <div
                        key={dl.id}
                        className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {dl.title}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            <span className="font-mono text-indigo-300">{dl.courseCode}</span> •{" "}
                            {dl.type} ({dl.weight}%)
                          </p>
                        </div>
                        {/* Countdown Badge */}
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full shrink-0 border ${
                            dl.daysRemaining <= 1
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : dl.daysRemaining <= 3
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {dl.daysRemaining <= 0
                            ? "Due Today"
                            : dl.daysRemaining === 1
                              ? "T-24h"
                              : `T-${dl.daysRemaining}d`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-800/80 mt-3 flex items-center justify-between text-[11px] text-slate-400">
                <span>Total Enrolled: {data.courses.length} courses</span>
                <span className="text-emerald-400 font-medium">Fall 2026</span>
              </div>
            </div>
          </div>

          {/* Course Mastery Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Enrolled Course Diagnostics
                </h2>
                <p className="text-xs text-slate-400">
                  Prioritized by Risk Level (Critical &gt; Moderate &gt; Safe)
                </p>
              </div>
              <Link
                href="/student/academics/subjects"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
              >
                Subject Details <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.courses.map((course) => {
                const isAmberOrRed =
                  course.riskCategory === "CRITICAL" || course.riskCategory === "MODERATE";

                return (
                  <div
                    key={course.courseId}
                    className={`p-6 rounded-2xl bg-slate-900/70 border backdrop-blur-md shadow-lg shadow-black/20 flex flex-col justify-between transition-all duration-200 ${
                      course.riskCategory === "CRITICAL"
                        ? "border-rose-500/30 hover:border-rose-500/50"
                        : course.riskCategory === "MODERATE"
                          ? "border-amber-500/30 hover:border-amber-500/50"
                          : "border-slate-800/80 hover:border-slate-700/60"
                    }`}
                  >
                    <div>
                      {/* Top Header: Code & Risk Pill */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono font-bold px-2 py-1 rounded-md bg-slate-800 text-indigo-300 border border-slate-700">
                          {course.courseCode}
                        </span>
                        <RiskBadge category={course.riskCategory} size="sm" />
                      </div>

                      {/* Title & Faculty */}
                      <h3 className="font-bold text-base text-white tracking-tight line-clamp-1 mb-1">
                        {course.courseName}
                      </h3>
                      <p className="text-xs text-slate-400 mb-4">
                        Instructor: {course.facultyName} • {course.credits} Credits
                      </p>

                      {/* Weighted Mastery Score & Progress Bar */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Weighted Mastery</span>
                          <span className="font-mono font-bold text-white">
                            {course.masteryScore.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              course.masteryScore >= 75
                                ? "bg-emerald-500"
                                : course.masteryScore >= 50
                                  ? "bg-indigo-500"
                                  : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, course.masteryScore))}%` }}
                          />
                        </div>
                      </div>

                      {/* Secondary Metrics */}
                      <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Attendance</span>
                          <span
                            className={`font-mono font-semibold ${
                              course.attendanceRate >= 75 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {course.attendanceRate.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Velocity</span>
                          <span
                            className={`font-mono font-semibold ${
                              course.velocity >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {course.velocity >= 0 ? `+${course.velocity.toFixed(2)}` : course.velocity.toFixed(2)}%/d
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <Link
                        href={`/student/academics/subjects?courseId=${course.courseId}`}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
                      >
                        Assessments <ChevronRight className="w-3.5 h-3.5" />
                      </Link>

                      {/* Why am I at risk? Button */}
                      {isAmberOrRed && (
                        <button
                          onClick={() =>
                            setSelectedRiskCourse({
                              courseId: course.courseId,
                              riskCategory: course.riskCategory,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition shadow-sm"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Why at risk?</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}
