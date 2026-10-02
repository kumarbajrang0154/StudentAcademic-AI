"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StudentShell } from "@/components/student/student-shell";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Bell,
} from "lucide-react";

interface CalendarDeadline {
  assessmentId: string;
  title: string;
  type: string;
  courseCode: string;
  courseName: string;
  dueDate: string;
  hoursRemaining: number;
  reminderState: "T-2h" | "T-24h" | "T-48h" | "UPCOMING" | "PAST_DUE";
  isEvaluated: boolean;
  score: number | null;
  maxScore: number;
}

interface TimetableSlot {
  id: string;
  courseCode: string;
  courseName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  roomNumber: string;
}

interface CalendarApiResponse {
  studentId: string;
  deadlines: CalendarDeadline[];
  schedule: TimetableSlot[];
}

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function StudentCalendarPage() {
  const [activeTab, setActiveTab] = useState<"DEADLINES" | "TIMETABLE">("DEADLINES");

  const { data, isLoading, error, refetch } = useQuery<CalendarApiResponse>({
    queryKey: ["student-calendar"],
    queryFn: async () => {
      const res = await fetch("/api/v1/student/calendar");
      if (!res.ok) throw new Error("Failed to load academic calendar");
      return res.json();
    },
  });

  // Group timetable slots by day
  const scheduleByDay = React.useMemo(() => {
    if (!data?.schedule) return {};
    const map: Record<number, TimetableSlot[]> = {};
    for (const slot of data.schedule) {
      if (!map[slot.dayOfWeek]) map[slot.dayOfWeek] = [];
      map[slot.dayOfWeek]!.push(slot);
    }
    return map;
  }, [data?.schedule]);

  return (
    <StudentShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg">
              <CalendarIcon className="w-6 h-6" />
            </span>
            <span>Academic Calendar &amp; Schedule</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Proactive milestone countdowns, assignment submission reminders, and weekly timetable.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          <span>Sync Calendar</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 w-full sm:w-fit mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("DEADLINES")}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
            activeTab === "DEADLINES"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-950"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Upcoming Deadlines &amp; Reminders</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("TIMETABLE")}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
            activeTab === "TIMETABLE"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-950"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Weekly Lecture Timetable</span>
        </button>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-slate-900/60 border border-slate-800 animate-shimmer"
            />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-rose-500/20 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-lg font-semibold text-white">Could not load calendar</h3>
          <p className="text-sm text-slate-400">
            {error instanceof Error ? error.message : "Failed to load schedule."}
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
        <>
          {/* TAB 1: DEADLINES */}
          {activeTab === "DEADLINES" && (
            <div className="space-y-4">
              {data.deadlines.length === 0 ? (
                <div className="p-12 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-slate-400 text-sm">
                  No upcoming deadlines or assessment submissions.
                </div>
              ) : (
                data.deadlines.map((dl) => {
                  const dueDate = new Date(dl.dueDate);
                  const formattedDate = dueDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={dl.assessmentId}
                      className={`p-5 rounded-2xl bg-slate-900/70 border backdrop-blur-md shadow-lg shadow-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                        dl.reminderState === "T-2h"
                          ? "border-rose-500/40 bg-rose-950/10"
                          : dl.reminderState === "T-24h" || dl.reminderState === "T-48h"
                            ? "border-amber-500/40 bg-amber-950/10"
                            : "border-slate-800/80 hover:border-slate-700"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                            {dl.courseCode}
                          </span>
                          <span className="text-xs text-slate-400">{dl.type}</span>
                        </div>
                        <h3 className="text-base font-bold text-white tracking-tight">
                          {dl.title}
                        </h3>
                        <p className="text-xs text-slate-400">
                          Due: <span className="text-slate-300">{formattedDate}</span> (Max Score: {dl.maxScore})
                        </p>
                      </div>

                      {/* Reminder State Badge */}
                      <div className="flex items-center gap-3 sm:self-center">
                        {dl.reminderState === "T-2h" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                            <AlertCircle className="w-3.5 h-3.5" />
                            T-2h (Urgent Submission)
                          </span>
                        )}
                        {dl.reminderState === "T-24h" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <Clock className="w-3.5 h-3.5" />
                            T-24h (Due Tomorrow)
                          </span>
                        )}
                        {dl.reminderState === "T-48h" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            <Clock className="w-3.5 h-3.5" />
                            T-48h Reminder
                          </span>
                        )}
                        {dl.reminderState === "UPCOMING" && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            Upcoming ({Math.round(dl.hoursRemaining / 24)}d remaining)
                          </span>
                        )}
                        {dl.reminderState === "PAST_DUE" && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            {dl.isEvaluated ? `Evaluated: ${dl.score}/${dl.maxScore}` : "Submitted / Past Due"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: TIMETABLE */}
          {activeTab === "TIMETABLE" && (
            <div className="space-y-6">
              {[1, 2, 3, 4, 5].map((dayNum) => {
                const dayName = DAYS_OF_WEEK[dayNum];
                const slots = scheduleByDay[dayNum] || [];

                return (
                  <div
                    key={dayNum}
                    className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-lg space-y-4"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                        {dayName}
                      </h3>
                      <span className="text-xs font-mono text-slate-400">
                        {slots.length} {slots.length === 1 ? "session" : "sessions"}
                      </span>
                    </div>

                    {slots.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">No scheduled lectures</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {slots.map((slot) => (
                          <div
                            key={slot.id}
                            className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 hover:border-indigo-500/30 transition"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-indigo-300">
                                {slot.courseCode}
                              </span>
                              <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-500" />
                                {slot.startTime} - {slot.endTime}
                              </span>
                            </div>

                            <h4 className="text-xs font-semibold text-white truncate">
                              {slot.courseName}
                            </h4>

                            <div className="flex items-center gap-1 text-[11px] text-slate-400 pt-1">
                              <MapPin className="w-3 h-3 text-cyan-400" />
                              <span>Room: {slot.roomNumber}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </StudentShell>
  );
}
