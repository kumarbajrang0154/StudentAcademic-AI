"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { RiskBadge } from "@/components/student/risk-badge";
import {
  Calendar,
  ArrowLeft,
  CheckCircle2,
  Save,
  AlertCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";

type AttendanceStatusType = "PRESENT" | "ABSENT" | "ON_DUTY" | "MEDICAL_LEAVE";

interface RosterStudent {
  studentId: string;
  rollNumber: string;
  name: string;
  email: string;
  attendanceRate: number;
  masteryScore: number;
  riskCategory: string;
}

interface CourseRosterResponse {
  courseId: string;
  courseCode: string;
  courseName: string;
  roster: RosterStudent[];
}

export default function AttendanceGridPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const courseId = params?.courseId as string;

  const todayStr = new Date().toISOString().slice(0, 10);
  const [sessionDate, setSessionDate] = useState<string>(todayStr);
  const [activeRow, setActiveRow] = useState<number>(0);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatusType>>({});
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  // Fetch Course Roster
  const {
    data: rosterData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["course-roster", courseId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/faculty/courses/${courseId}/roster`);
      if (!res.ok) {
        if (res.status === 403) throw new Error("403 Forbidden: You do not have access to this course.");
        throw new Error("Failed to load roster");
      }
      return (await res.json()) as CourseRosterResponse;
    },
    enabled: Boolean(courseId),
  });

  // Initialize all students to PRESENT by default when roster loads
  useEffect(() => {
    if (rosterData?.roster && Object.keys(attendanceMap).length === 0) {
      const initial: Record<string, AttendanceStatusType> = {};
      for (const st of rosterData.roster) {
        initial[st.studentId] = "PRESENT";
      }
      setAttendanceMap(initial);
    }
  }, [rosterData, attendanceMap]);

  // Set single student status
  const setStatus = useCallback((studentId: string, status: AttendanceStatusType) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: status,
    }));
    setIsDirty(true);
  }, []);

  // Mark all present
  const handleMarkAllPresent = () => {
    if (!rosterData?.roster) return;
    const updated: Record<string, AttendanceStatusType> = {};
    for (const st of rosterData.roster) {
      updated[st.studentId] = "PRESENT";
    }
    setAttendanceMap(updated);
    setIsDirty(true);
    setToastMessage({ type: "success", text: "All students marked PRESENT" });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Submit batch mutation
  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!rosterData?.roster) return;
      const entries = rosterData.roster.map((st) => ({
        studentId: st.studentId,
        status: attendanceMap[st.studentId] || "PRESENT",
      }));

      const res = await apiFetch("/api/v1/attendance/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          sessionDate,
          entries,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        const errJson = JSON.parse(text);
        throw new Error(errJson.message || "Failed to commit attendance batch");
      }

      return res.json();
    },
    onSuccess: (data) => {
      setIsDirty(false);
      const counts = data.counts || {};
      setToastMessage({
        type: "success",
        text: `Attendance saved! (${counts.present || 0} Present, ${counts.absent || 0} Absent, ${counts.onDuty || 0} OD, ${counts.medicalLeave || 0} Medical)`,
      });
      queryClient.invalidateQueries({ queryKey: ["course-roster", courseId] });
      queryClient.invalidateQueries({ queryKey: ["faculty-courses"] });
      setTimeout(() => setToastMessage(null), 4500);
    },
    onError: (err: Error) => {
      setToastMessage({ type: "error", text: err.message });
      setTimeout(() => setToastMessage(null), 5000);
    },
  });

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field (e.g. date picker)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const roster = rosterData?.roster || [];
      if (roster.length === 0) return;

      // Cmd/Ctrl + Enter = Commit
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        commitMutation.mutate();
        return;
      }

      // Up / Down navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveRow((prev) => Math.min(prev + 1, roster.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveRow((prev) => Math.max(prev - 1, 0));
        return;
      }

      const currentStudent = roster[activeRow];
      if (!currentStudent) return;

      // P/A/O/M keys to set status on active row
      const key = e.key.toUpperCase();
      if (key === "P") {
        e.preventDefault();
        setStatus(currentStudent.studentId, "PRESENT");
        setActiveRow((prev) => Math.min(prev + 1, roster.length - 1));
      } else if (key === "A") {
        e.preventDefault();
        setStatus(currentStudent.studentId, "ABSENT");
        setActiveRow((prev) => Math.min(prev + 1, roster.length - 1));
      } else if (key === "O") {
        e.preventDefault();
        setStatus(currentStudent.studentId, "ON_DUTY");
        setActiveRow((prev) => Math.min(prev + 1, roster.length - 1));
      } else if (key === "M") {
        e.preventDefault();
        setStatus(currentStudent.studentId, "MEDICAL_LEAVE");
        setActiveRow((prev) => Math.min(prev + 1, roster.length - 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rosterData, activeRow, commitMutation, setStatus]);

  // Compute live counts
  const roster = rosterData?.roster || [];
  let presentCount = 0;
  let absentCount = 0;
  let onDutyCount = 0;
  let medicalCount = 0;

  for (const s of roster) {
    const st = attendanceMap[s.studentId] || "PRESENT";
    if (st === "PRESENT") presentCount++;
    else if (st === "ABSENT") absentCount++;
    else if (st === "ON_DUTY") onDutyCount++;
    else if (st === "MEDICAL_LEAVE") medicalCount++;
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/faculty/dashboard"
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition border border-slate-700/60"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-indigo-400">
                {rosterData?.courseCode || "Course"}
              </span>
              <span className="text-slate-500">•</span>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Attendance Spreadsheet Grid
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {rosterData?.courseName || "Loading course..."}
            </p>
          </div>
        </div>

        {/* Date picker & Bulk action */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => {
                setSessionDate(e.target.value);
                setIsDirty(true);
              }}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleMarkAllPresent}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-200 hover:text-white transition flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mark All Present</span>
          </button>

          <button
            type="button"
            onClick={() => commitMutation.mutate()}
            disabled={commitMutation.isPending}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 transition flex items-center gap-1.5"
          >
            {commitMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Commit (Ctrl+Enter)</span>
          </button>
        </div>
      </div>

      {/* Unsaved Changes Banner */}
      {isDirty && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>You have unsaved changes in this session grid.</span>
          </div>
          <span className="font-mono text-[11px] text-amber-400/80">Press Ctrl+Enter to save</span>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 transition ${
            toastMessage.type === "success"
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Keyboard Shortcut Cheatsheet Banner */}
      <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="font-semibold text-slate-300">Keyboard Controls:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">↑ / ↓</span>
          <span className="text-slate-400">Navigate rows</span>
          <span className="text-slate-600">|</span>
          <span className="bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-bold">P</span>
          <span>Present</span>
          <span className="bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-bold">A</span>
          <span>Absent</span>
          <span className="bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-bold">O</span>
          <span>On Duty</span>
          <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">M</span>
          <span>Medical</span>
          <span className="text-slate-600">|</span>
          <span className="bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">Ctrl+Enter</span>
          <span>Commit</span>
        </div>
      </div>

      {/* Spreadsheet Grid Content */}
      {isLoading && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4 animate-pulse">
          <div className="h-6 bg-slate-800 rounded w-1/4" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 bg-slate-800/60 rounded" />
          ))}
        </div>
      )}

      {isError && (
        <div className="p-10 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="text-sm font-semibold text-rose-300">
            {error instanceof Error ? error.message : "Failed to load course roster"}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg transition"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && roster.length > 0 && (
        <div
          ref={gridRef}
          className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4 w-28">Roll No</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4 text-center">Current Att %</th>
                  <th className="py-3 px-4 text-center">Risk</th>
                  <th className="py-3 px-4 text-center w-64">Session Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans text-xs">
                {roster.map((student, idx) => {
                  const currentStatus = attendanceMap[student.studentId] || "PRESENT";
                  const isActive = activeRow === idx;

                  return (
                    <tr
                      key={student.studentId}
                      onClick={() => setActiveRow(idx)}
                      className={`transition cursor-pointer select-none ${
                        isActive
                          ? "bg-indigo-600/15 border-l-4 border-l-indigo-500"
                          : idx % 2 === 0
                          ? "bg-slate-900/30 hover:bg-slate-800/40"
                          : "bg-slate-900/60 hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="py-2.5 px-4 text-center font-mono text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-300">
                        {student.rollNumber}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-white">
                        {student.name}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-300">
                        {student.attendanceRate}%
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <RiskBadge category={student.riskCategory} size="sm" />
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* PRESENT Chip */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatus(student.studentId, "PRESENT");
                              setActiveRow(idx);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                              currentStatus === "PRESENT"
                                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-emerald-400"
                                : "bg-slate-800 text-slate-400 hover:text-emerald-300 hover:bg-slate-700/60"
                            }`}
                          >
                            <span>P</span>
                            <span className="hidden sm:inline text-[10px] font-normal">Present</span>
                          </button>

                          {/* ABSENT Chip */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatus(student.studentId, "ABSENT");
                              setActiveRow(idx);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                              currentStatus === "ABSENT"
                                ? "bg-rose-500 text-white shadow-sm shadow-rose-500/30 ring-1 ring-rose-400"
                                : "bg-slate-800 text-slate-400 hover:text-rose-300 hover:bg-slate-700/60"
                            }`}
                          >
                            <span>A</span>
                            <span className="hidden sm:inline text-[10px] font-normal">Absent</span>
                          </button>

                          {/* ON_DUTY Chip */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatus(student.studentId, "ON_DUTY");
                              setActiveRow(idx);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                              currentStatus === "ON_DUTY"
                                ? "bg-cyan-600 text-white shadow-sm shadow-cyan-600/30 ring-1 ring-cyan-400"
                                : "bg-slate-800 text-slate-400 hover:text-cyan-300 hover:bg-slate-700/60"
                            }`}
                          >
                            <span>O</span>
                            <span className="hidden sm:inline text-[10px] font-normal">OD</span>
                          </button>

                          {/* MEDICAL_LEAVE Chip */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatus(student.studentId, "MEDICAL_LEAVE");
                              setActiveRow(idx);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                              currentStatus === "MEDICAL_LEAVE"
                                ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30 ring-1 ring-amber-400"
                                : "bg-slate-800 text-slate-400 hover:text-amber-300 hover:bg-slate-700/60"
                            }`}
                          >
                            <span>M</span>
                            <span className="hidden sm:inline text-[10px] font-normal">Med</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4 text-slate-400 font-mono">
              <span>Total: <strong className="text-white">{roster.length}</strong></span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400 font-semibold">Present: <strong>{presentCount}</strong></span>
              <span className="text-rose-400 font-semibold">Absent: <strong>{absentCount}</strong></span>
              <span className="text-cyan-400 font-semibold">OD: <strong>{onDutyCount}</strong></span>
              <span className="text-amber-400 font-semibold">Medical: <strong>{medicalCount}</strong></span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => commitMutation.mutate()}
                disabled={commitMutation.isPending}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition shadow-lg shadow-indigo-600/20 flex items-center gap-2"
              >
                {commitMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Commit Attendance</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
