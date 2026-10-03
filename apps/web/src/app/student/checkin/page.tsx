"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";

interface CourseInfo {
  id: string;
  code: string;
  name: string;
}

function CheckinForm() {
  const params = useSearchParams();
  const prefilledCourseId = params.get("courseId") ?? "";

  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState(prefilledCourseId);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    async function loadCourses() {
      setCoursesLoading(true);
      try {
        const res = await apiFetch("/api/v1/student/overview");
        if (res.ok) {
          const json = await res.json();
          const list = (json.courses ?? []).map((c: { courseId: string; courseCode: string; courseName: string }) => ({
            id: c.courseId,
            code: c.courseCode,
            name: c.courseName,
          }));
          setCourses(list);
          if (!selectedCourseId && list.length > 0) {
            setSelectedCourseId(list[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        setCoursesLoading(false);
      }
    }
    loadCourses();
  // selectedCourseId is intentionally excluded — only run on mount
  // (pre-fill from URL param is handled by useState initial value)
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || code.length !== 6) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/v1/student/checkin", {
        method: "POST",
        body: JSON.stringify({ courseId: selectedCourseId, code }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: json.message ?? "Checked in successfully!" });
        setCode("");
      } else {
        setResult({ ok: false, message: json.message ?? "Check-in failed. Please try again." });
      }
    } catch {
      setResult({ ok: false, message: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-indigo-600/20 rounded-xl">
              <QrCode className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Class Check-in</h1>
              <p className="text-xs text-slate-400">Enter the code shown by your faculty</p>
            </div>
          </div>

          {/* Success result */}
          {result?.ok && (
            <div className="mb-6 flex items-start gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <p className="font-semibold">Attendance Recorded!</p>
                <p className="text-emerald-400/80 text-xs mt-0.5">{result.message}</p>
              </div>
            </div>
          )}

          {/* Error result */}
          {result && !result.ok && (
            <div className="mb-6 flex items-start gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
              <p>{result.message}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Course selector */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Course
              </label>
              {coursesLoading ? (
                <div className="h-10 rounded-xl bg-slate-800 animate-pulse" />
              ) : (
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  {courses.length === 0 && (
                    <option value="">No courses found</option>
                  )}
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Code input */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                6-digit Check-in Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-2xl font-mono tracking-[0.4em] text-center focus:outline-none focus:border-indigo-500"
                autoComplete="off"
              />
              <p className="text-xs text-slate-500 mt-1 text-center">
                Code rotates every 30 seconds — enter quickly
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || code.length !== 6 || !selectedCourseId}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Check In <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Honesty note */}
          <p className="text-xs text-slate-500 text-center mt-6">
            Your check-in is recorded instantly. Faculty will review and commit final attendance.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function StudentCheckinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090D16] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      }
    >
      <CheckinForm />
    </Suspense>
  );
}
