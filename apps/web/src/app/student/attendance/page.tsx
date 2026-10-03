"use client";

import React, { useState, useMemo, useId } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { StudentShell } from "@/components/student/student-shell";
import {
  predictedAttendance,
  safeBunks,
  classesToRecover,
  PLANNED_SESSIONS_PER_COURSE,
} from "@student-academic-ai/core";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Sliders,
  Target,
  RefreshCw,
  Info,
  CheckCircle2,
  XCircle,
  QrCode,
} from "lucide-react";

interface CourseAttendanceItem {
  courseId: string;
  courseCode: string;
  courseName: string;
  facultyName: string;
  conducted: number;
  attended: number;
  onDuty: number;
  absent: number;
  percentage: number;
  status: "SAFE" | "WARNING" | "CRITICAL";
  safeBunks: number;
  classesToRecover: number;
}

interface StudentAttendanceResponse {
  studentId: string;
  totalConducted: number;
  totalAttended: number;
  totalOnDuty: number;
  totalAbsent: number;
  overallPercentage: number;
  overallStatus: "SAFE" | "WARNING" | "CRITICAL";
  overallSafeBunks: number;
  overallClassesToRecover: number;
  courses: CourseAttendanceItem[];
}

interface SimulatorApiResponse {
  mode: string;
  currentAttendance: number;
  hypotheticalMissedClasses: number;
  targetThreshold: number;
  projectedAttendance: number;
  safeBunksRemaining: number;
  classesNeededConsecutive: number;
  isMathematicallyIrrecoverable: boolean;
  remainingSessions: number;
  totalConductedSessions: number;
  plannedSessions: number;
  status: string;
}

export default function StudentAttendancePage() {
  const [selectedCourseId, setSelectedCourseId] = useState<string>("ALL");
  const [simulatorMode, setSimulatorMode] = useState<"BUNKS" | "REMEDY">("BUNKS");
  const [hypotheticalMissed, setHypotheticalMissed] = useState<number>(0);
  const [remedyTarget, setRemedyTarget] = useState<number>(75);
  const statusRegionId = useId();

  // Query: fetch attendance breakdown
  const { data, isLoading, error, refetch } = useQuery<StudentAttendanceResponse>({
    queryKey: ["student-attendance"],
    queryFn: async () => {
      const res = await apiFetch("/api/v1/student/attendance");
      if (!res.ok) {
        throw new Error(`Failed to load attendance: ${res.statusText}`);
      }
      return res.json();
    },
  });

  // Selected base stats
  const activeStats = useMemo(() => {
    if (!data) return { P: 0, OD: 0, T: 0, pct: 100, code: "All Courses" };
    if (selectedCourseId === "ALL") {
      return {
        P: data.totalAttended,
        OD: data.totalOnDuty,
        T: data.totalConducted,
        pct: data.overallPercentage,
        code: "Aggregate Across All Courses",
      };
    }
    const found = data.courses.find((c) => c.courseId === selectedCourseId);
    if (!found) {
      return {
        P: data.totalAttended,
        OD: data.totalOnDuty,
        T: data.totalConducted,
        pct: data.overallPercentage,
        code: "Aggregate",
      };
    }
    return {
      P: found.attended,
      OD: found.onDuty,
      T: found.conducted,
      pct: found.percentage,
      code: found.courseCode,
    };
  }, [data, selectedCourseId]);

  // Mode A: Live In-Browser computation with @student-academic-ai/core
  const localProjected = useMemo(() => {
    return Math.round(predictedAttendance(activeStats.P, activeStats.OD, activeStats.T, hypotheticalMissed, false) * 10) / 10;
  }, [activeStats, hypotheticalMissed]);

  const localSafeBunksRemaining = useMemo(() => {
    return safeBunks(activeStats.P, activeStats.OD, activeStats.T, 0.75);
  }, [activeStats]);

  // Mode B: Live in-browser computation with @student-academic-ai/core
  const localClassesNeeded = useMemo(() => {
    return classesToRecover(activeStats.P, activeStats.OD, activeStats.T, remedyTarget / 100);
  }, [activeStats, remedyTarget]);

  const remainingSessions = Math.max(0, PLANNED_SESSIONS_PER_COURSE - activeStats.T);
  const maxPossibleAttended = activeStats.P + activeStats.OD + remainingSessions;
  const maxPossibleRate = PLANNED_SESSIONS_PER_COURSE > 0 ? (maxPossibleAttended / PLANNED_SESSIONS_PER_COURSE) * 100 : 100;
  const isMathematicallyIrrecoverable =
    localClassesNeeded > remainingSessions || maxPossibleRate < remedyTarget;

  // Mutation: call backend simulator on slider release to confirm
  const simulatorMutation = useMutation({
    mutationFn: async (payload: {
      courseId?: string;
      hypotheticalMissedClasses: number;
      targetThreshold: number;
      currentAttended: number;
      currentTotal: number;
    }) => {
      const res = await apiFetch("/api/v1/attendance/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Simulator validation failed");
      return (await res.json()) as SimulatorApiResponse;
    },
  });

  const handleSliderRelease = () => {
    simulatorMutation.mutate({
      courseId: selectedCourseId !== "ALL" ? selectedCourseId : undefined,
      hypotheticalMissedClasses: hypotheticalMissed,
      targetThreshold: remedyTarget,
      currentAttended: activeStats.P + activeStats.OD,
      currentTotal: activeStats.T,
    });
  };

  const isBelowStatutory = localProjected < 75;

  return (
    <StudentShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <span>Attendance &amp; Safe-Bunk Simulator</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Statutory 75% attendance compliance, course registry, and predictive risk simulation.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* QR Self Check-in Card — visible whenever there may be an active window */}
      <div className="mb-6 flex items-center gap-4 p-4 rounded-2xl bg-indigo-600/10 border border-indigo-500/30">
        <div className="p-2.5 bg-indigo-600/20 rounded-xl shrink-0">
          <QrCode className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Check in to class</p>
          <p className="text-xs text-slate-400">
            If your faculty has started a QR check-in session, enter the 6-digit code here.
          </p>
        </div>
        <Link
          href={
            selectedCourseId !== "ALL"
              ? `/student/checkin?courseId=${selectedCourseId}`
              : "/student/checkin"
          }
          className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition whitespace-nowrap"
        >
          Open Check-in →
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="h-72 rounded-2xl bg-slate-900/60 border border-slate-800 animate-shimmer" />
          <div className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800 animate-shimmer" />
        </div>
      )}

      {error && !isLoading && (
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-rose-500/20 text-center space-y-4">
          <AlertOctagon className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-lg font-semibold text-white">Could not load attendance registry</h3>
          <p className="text-sm text-slate-400">
            {error instanceof Error ? error.message : "Failed to load records."}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition"
          >
            Retry
          </button>
        </div>
      )}

      {data && !isLoading && (
        <div className="space-y-8">
          {/* Top Section: 280px Animated Gauge + Summary Metrics */}
          <div className="p-8 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-xl shadow-black/20 flex flex-col lg:flex-row items-center justify-between gap-8">
            {/* 280px Animated Gauge */}
            <div className="flex flex-col items-center shrink-0">
              <div className="relative w-[280px] h-[280px] flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 280 280">
                  {/* Outer track */}
                  <circle
                    cx="140"
                    cy="140"
                    r="115"
                    fill="transparent"
                    stroke="#1E293B"
                    strokeWidth="18"
                  />
                  {/* Statutory 75% tick marker line */}
                  {/* Circumference = 2 * PI * 115 = 722.56. 75% marker position */}
                  <circle
                    cx="140"
                    cy="140"
                    r="115"
                    fill="transparent"
                    stroke="#F59E0B"
                    strokeWidth="22"
                    strokeDasharray="3 720"
                    strokeDashoffset={-722.56 * 0.75}
                    className="opacity-90"
                  />
                  {/* Animated Progress Arc */}
                  <circle
                    cx="140"
                    cy="140"
                    r="115"
                    fill="transparent"
                    stroke={
                      data.overallPercentage >= 75
                        ? "#10B981"
                        : data.overallPercentage >= 65
                          ? "#F59E0B"
                          : "#F43F5E"
                    }
                    strokeWidth="18"
                    strokeDasharray={2 * Math.PI * 115}
                    strokeDashoffset={
                      2 * Math.PI * 115 * (1 - Math.min(100, data.overallPercentage) / 100)
                    }
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>

                {/* Central Gauge Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <span className="text-4xl sm:text-5xl font-extrabold font-mono text-white tracking-tight">
                    {data.overallPercentage.toFixed(1)}%
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
                    Aggregate Rate
                  </span>
                  <span
                    className={`mt-2 px-3 py-0.5 rounded-full text-xs font-semibold border ${
                      data.overallPercentage >= 75
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}
                  >
                    {data.overallPercentage >= 75 ? "Compliant (> 75%)" : "At Risk of Debarment"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Safe (&ge;75%)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Statutory Marker
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Debarment
                </span>
              </div>
            </div>

            {/* Overall Attendance Metrics & Statutory Advisory */}
            <div className="flex-1 w-full space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-xs text-slate-400">Conducted</span>
                  <p className="text-2xl font-bold font-mono text-white mt-1">
                    {data.totalConducted}
                  </p>
                  <span className="text-[11px] text-slate-500">Sessions</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-xs text-slate-400">Attended (P)</span>
                  <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    {data.totalAttended}
                  </p>
                  <span className="text-[11px] text-emerald-500/80">Present</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-xs text-slate-400">On-Duty (OD)</span>
                  <p className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                    {data.totalOnDuty}
                  </p>
                  <span className="text-[11px] text-cyan-500/80">Approved</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <span className="text-xs text-slate-400">Absences</span>
                  <p className="text-2xl font-bold font-mono text-rose-400 mt-1">
                    {data.totalAbsent}
                  </p>
                  <span className="text-[11px] text-rose-500/80">Missed</span>
                </div>
              </div>

              {/* Safe Bunk Overview Advisory */}
              <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 flex items-start gap-3">
                <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <span className="font-semibold text-indigo-300 block text-sm">
                    Statutory Compliance Guidelines
                  </span>
                  <p className="leading-relaxed">
                    Under university academic regulations, attendance must not drop below{" "}
                    <strong className="text-white">75.0%</strong>. Across all subjects combined, you have{" "}
                    <strong className="text-emerald-400 font-mono">
                      {data.overallSafeBunks} safe-bunks remaining
                    </strong>
                    . If attendance falls below 65%, automated Tier-1 escalation and exam hall ticket debarment trigger.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Subject Attendance Table */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-lg shadow-black/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Course Subject Breakdown
                </h2>
                <p className="text-xs text-slate-400">
                  Real-time session records by course enrollment
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4 font-semibold">Course</th>
                    <th className="py-3 px-4 font-semibold">Faculty</th>
                    <th className="py-3 px-4 font-semibold text-center">Conducted</th>
                    <th className="py-3 px-4 font-semibold text-center">Attended</th>
                    <th className="py-3 px-4 font-semibold text-center">On-Duty</th>
                    <th className="py-3 px-4 font-semibold text-center">Rate</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.courses.map((course) => (
                    <tr
                      key={course.courseId}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-medium text-white">
                        <span className="font-mono text-indigo-300 font-bold mr-2">
                          {course.courseCode}
                        </span>
                        <span>{course.courseName}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">{course.facultyName}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-300">
                        {course.conducted}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-emerald-400">
                        {course.attended}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-cyan-400">
                        {course.onDuty}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-white">
                        <span
                          className={
                            course.percentage >= 75
                              ? "text-emerald-400"
                              : course.percentage >= 65
                                ? "text-amber-400"
                                : "text-rose-400"
                          }
                        >
                          {course.percentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                            course.status === "SAFE"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : course.status === "WARNING"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          }`}
                        >
                          {course.status === "SAFE" && <ShieldCheck className="w-3 h-3" />}
                          {course.status === "WARNING" && <AlertTriangle className="w-3 h-3" />}
                          {course.status === "CRITICAL" && <AlertOctagon className="w-3 h-3" />}
                          <span>{course.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedCourseId(course.courseId);
                            setHypotheticalMissed(0);
                            const element = document.getElementById("attendance-simulator-card");
                            if (element) {
                              element.scrollIntoView({ behavior: "smooth" });
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition"
                        >
                          Simulate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Glass-style Simulator Card */}
          <div
            id="attendance-simulator-card"
            className="p-8 rounded-2xl bg-slate-900/80 border border-indigo-500/30 backdrop-blur-xl shadow-2xl shadow-indigo-950/20 space-y-6"
          >
            {/* Simulator Header & Target Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg">
                    <Sliders className="w-5 h-5" />
                  </span>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    Interactive Attendance Simulator
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Target: <span className="font-semibold text-slate-200">{activeStats.code}</span> (
                  {activeStats.P + activeStats.OD}/{activeStats.T} attended)
                </p>
              </div>

              {/* Target Selector Dropdown */}
              <div className="flex items-center gap-3">
                <label htmlFor="course-selector" className="text-xs text-slate-400 whitespace-nowrap">
                  Simulate for:
                </label>
                <select
                  id="course-selector"
                  value={selectedCourseId}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    setHypotheticalMissed(0);
                  }}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">Overall Aggregate Attendance</option>
                  {data.courses.map((c) => (
                    <option key={c.courseId} value={c.courseId}>
                      {c.courseCode} - {c.courseName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Segmented Mode Switch */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 w-full sm:w-fit">
              <button
                type="button"
                onClick={() => setSimulatorMode("BUNKS")}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                  simulatorMode === "BUNKS"
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Mode A: Safe-Bunk Calculator</span>
              </button>
              <button
                type="button"
                onClick={() => setSimulatorMode("REMEDY")}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                  simulatorMode === "REMEDY"
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                <span>Mode B: Remedy Target</span>
              </button>
            </div>

            {/* MODE A: Safe-Bunk Calculator */}
            {simulatorMode === "BUNKS" && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300 mb-2">
                    <span>Hypothetical Missed Classes:</span>
                    <span className="font-mono text-base font-bold text-indigo-400">
                      {hypotheticalMissed} classes
                    </span>
                  </div>

                  {/* Slider: 0 - 20 missed classes */}
                  <div className="space-y-2">
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={hypotheticalMissed}
                      onChange={(e) => setHypotheticalMissed(parseInt(e.target.value, 10))}
                      onPointerUp={handleSliderRelease}
                      onTouchEnd={handleSliderRelease}
                      onKeyUp={handleSliderRelease}
                      aria-label="Hypothetical missed classes"
                      className="w-full h-2.5 rounded-lg appearance-none cursor-pointer transition-all"
                      style={{
                        background: isBelowStatutory
                          ? "linear-gradient(to right, #F43F5E 0%, #F43F5E 100%)"
                          : "linear-gradient(to right, #10B981 0%, #4F46E5 100%)",
                      }}
                    />
                    <div className="flex justify-between text-[11px] font-mono text-slate-500">
                      <span>0 missed</span>
                      <span>5</span>
                      <span>10</span>
                      <span>15</span>
                      <span>20 missed</span>
                    </div>
                  </div>
                </div>

                {/* Projected Percentage Display */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-400">Current Rate</span>
                    <p className="text-xl font-mono font-bold text-white mt-0.5">
                      {activeStats.pct.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400">Simulated Absences</span>
                    <p className="text-xl font-mono font-bold text-amber-400 mt-0.5">
                      +{hypotheticalMissed}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400">Live Projected Rate</span>
                    <p
                      className={`text-xl font-mono font-bold mt-0.5 ${
                        isBelowStatutory ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {localProjected.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* aria-live="polite" status region */}
                <div
                  id={statusRegionId}
                  aria-live="polite"
                  className={`p-4 rounded-xl border flex items-start gap-3 transition-colors ${
                    !isBelowStatutory
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-200"
                  }`}
                >
                  {!isBelowStatutory ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-300">
                          You remain safe.
                        </h4>
                        <p className="text-xs mt-1 text-emerald-200/90 leading-relaxed">
                          You can miss up to{" "}
                          <strong className="font-mono text-emerald-300">
                            {localSafeBunksRemaining}
                          </strong>{" "}
                          more classes while staying at or above the statutory 75.0% threshold.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-rose-300">
                          Breach Warning: debarred if you miss {hypotheticalMissed} classes
                        </h4>
                        <p className="text-xs mt-1 text-rose-200/90 leading-relaxed">
                          Missing {hypotheticalMissed} classes will drop your attendance to{" "}
                          <strong className="font-mono text-rose-300">{localProjected.toFixed(1)}%</strong>
                          , falling below the mandatory 75% institutional limit. Exam hall ticket will be withheld.
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Forecast Table: 1, 3, 5, 10 Classes Missed */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                    Attendance Forecast Matrix
                  </span>
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-semibold uppercase text-slate-400">
                          <th className="py-2.5 px-3">If you miss</th>
                          <th className="py-2.5 px-3">Sessions (Attended / Total)</th>
                          <th className="py-2.5 px-3 text-center">Projected %</th>
                          <th className="py-2.5 px-3 text-center">Debarment Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {[1, 3, 5, 10].map((missed) => {
                          const proj =
                            Math.round(
                              predictedAttendance(
                                activeStats.P,
                                activeStats.OD,
                                activeStats.T,
                                missed,
                                false,
                              ) * 10,
                            ) / 10;
                          const isDebarred = proj < 75.0;
                          return (
                            <tr key={missed} className="hover:bg-slate-900/40 transition">
                              <td className="py-2.5 px-3 font-semibold text-white">
                                {missed} {missed === 1 ? "class" : "classes"}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-400">
                                {activeStats.P + activeStats.OD} / {activeStats.T + missed}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold">
                                <span className={isDebarred ? "text-rose-400" : "text-emerald-400"}>
                                  {proj.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                    isDebarred
                                      ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                  }`}
                                >
                                  {isDebarred ? (
                                    <>
                                      <XCircle className="w-3 h-3 text-rose-400" />
                                      <span>Debarred (&lt; 75%)</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                      <span>Safe (&ge; 75%)</span>
                                    </>
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* MODE B: Remedy Target */}
            {simulatorMode === "REMEDY" && (
              <div className="space-y-6">
                <div>
                  <span className="text-xs font-medium text-slate-300 block mb-2">
                    Select Target Recovery Threshold:
                  </span>
                  <div className="flex gap-3">
                    {[75, 80, 85].map((target) => (
                      <button
                        key={target}
                        type="button"
                        onClick={() => setRemedyTarget(target)}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold border transition ${
                          remedyTarget === target
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-950"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        Target: {target}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status and Recovery Calculation */}
                <div
                  aria-live="polite"
                  className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400">Current Standing</span>
                      <p className="text-lg font-bold font-mono text-white">
                        {activeStats.pct.toFixed(1)}% ({activeStats.P + activeStats.OD}/{activeStats.T} sessions)
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Remaining Term Sessions</span>
                      <p className="text-lg font-bold font-mono text-indigo-300">
                        {remainingSessions} sessions
                      </p>
                    </div>
                  </div>

                  {isMathematicallyIrrecoverable ? (
                    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3">
                      <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-block mb-1.5">
                          Mathematically Irrecoverable: Manual Academic Appeal Required
                        </span>
                        <p className="text-xs text-rose-200/90 leading-relaxed">
                          Even with 100% attendance in all {remainingSessions} remaining sessions,
                          the maximum possible attendance reachable is{" "}
                          <strong className="font-mono text-white">
                            {maxPossibleRate.toFixed(1)}%
                          </strong>
                          , which cannot meet your {remedyTarget}% threshold. Submit a formalized medical/on-duty regularization appeal immediately.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-300">
                          Attend next {localClassesNeeded} classes consecutively
                        </h4>
                        <p className="text-xs text-emerald-200/90 mt-1 leading-relaxed">
                          To reach and maintain your {remedyTarget}% threshold target, you must achieve uninterrupted presence for the next{" "}
                          <strong className="font-mono text-emerald-300">
                            {localClassesNeeded}
                          </strong>{" "}
                          sessions out of {remainingSessions} remaining.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentShell>
  );
}
