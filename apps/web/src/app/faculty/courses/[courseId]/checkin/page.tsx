"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  QrCode,
  Timer,
  Users,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Info,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseInfo {
  id: string;
  code: string;
  name: string;
}

interface WindowStatus {
  windowId: string;
  courseId: string;
  sessionId: string;
  isOpen: boolean;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
  checkedInCount: number;
  msUntilNextCode: number;
}

// ─── QR Code (client-side, no network) ───────────────────────────────────────

function QRCodeSVG({ value, size = 200 }: { value: string; size?: number }) {
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    // Dynamic import of qrcode library (client-side only)
    import("qrcode")
      .then((QRCode) => QRCode.toString(value, { type: "svg", margin: 2, width: size }))
      .then((svg) => setQrSvg(svg))
      .catch(() => setQrSvg(null));
  }, [value, size]);

  if (!qrSvg) {
    return (
      <div
        style={{ width: size, height: size }}
        className="bg-white rounded-xl flex items-center justify-center"
      >
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className="bg-white rounded-xl p-2"
      dangerouslySetInnerHTML={{ __html: qrSvg }}
    />
  );
}

// ─── Countdown Ring ───────────────────────────────────────────────────────────

function CountdownRing({
  msRemaining,
  totalMs,
}: {
  msRemaining: number;
  totalMs: number;
}) {
  const pct = msRemaining / totalMs;
  const r = 20;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;

  return (
    <svg width="60" height="60" className="rotate-[-90deg]">
      <circle cx="30" cy="30" r={r} fill="none" stroke="#1e293b" strokeWidth="4" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke="#6366f1"
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s linear" }}
      />
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FacultyCheckinPage() {
  const params = useParams();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);

  // Window state
  const [windowStatus, setWindowStatus] = useState<WindowStatus | null>(null);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState<string | null>(null);
  const [msUntilNext, setMsUntilNext] = useState(30_000);
  const [durationMin, setDurationMin] = useState(10);
  const [sessionDate, setSessionDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  // UI state
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load course info ────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadCourse() {
      setCourseLoading(true);
      try {
        const res = await apiFetch("/api/v1/faculty/courses");
        if (res.ok) {
          const json = await res.json();
          const found = (json.courses as CourseInfo[]).find((c) => c.id === courseId);
          if (found) setCourse(found);
        }
      } catch {
        // ignore
      } finally {
        setCourseLoading(false);
      }
    }
    loadCourse();
  }, [courseId]);

  // ── Fetch code every second (client-side countdown + refresh on step) ───────
  const fetchCode = useCallback(async () => {
    if (!windowId) return;
    try {
      const res = await apiFetch(
        `/api/v1/faculty/courses/${courseId}/checkin/code?windowId=${windowId}`
      );
      if (res.ok) {
        const json = await res.json();
        setDisplayCode(json.code as string);
        setMsUntilNext(json.msUntilNext as number);
      }
    } catch {
      // ignore transient errors
    }
  }, [windowId, courseId]);

  // ── Poll window status every 5 s ────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/api/v1/faculty/courses/${courseId}/checkin/status`
      );
      if (res.ok) {
        const json = await res.json();
        const w = json.window as WindowStatus | null;
        setWindowStatus(w);
        if (w && !w.isOpen && windowId) {
          // Window expired naturally
          setWindowId(null);
          setDisplayCode(null);
        }
      }
    } catch {
      // ignore
    }
  }, [courseId, windowId]);

  // ── Set up polling when window is open ──────────────────────────────────────
  useEffect(() => {
    if (windowId) {
      fetchCode();
      pollStatus();
      codeRef.current = setInterval(fetchCode, 5_000);
      pollRef.current = setInterval(pollStatus, 5_000);
    } else {
      if (codeRef.current) clearInterval(codeRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (codeRef.current) clearInterval(codeRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [windowId, fetchCode, pollStatus]);

  // ── Also load last window status on mount ───────────────────────────────────
  useEffect(() => {
    pollStatus();
  }, [pollStatus]);

  // ── Start window ─────────────────────────────────────────────────────────────
  const handleStart = async () => {
    setStarting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch(
        `/api/v1/faculty/courses/${courseId}/checkin/start`,
        {
          method: "POST",
          body: JSON.stringify({ sessionDate, durationMin }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "Failed to start check-in window");
        return;
      }
      setWindowId(json.windowId as string);
      setSuccess(`Check-in window opened! Students have ${durationMin} minutes to check in.`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  // ── Close window ─────────────────────────────────────────────────────────────
  const handleClose = async () => {
    if (!windowId) return;
    setClosing(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/v1/faculty/courses/${courseId}/checkin/close`,
        {
          method: "POST",
          body: JSON.stringify({ windowId }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "Failed to close window");
        return;
      }
      setSuccess(
        `Window closed. ${json.checkedInCount} student(s) checked in. ` +
          `Review the attendance grid to confirm or fill in the rest.`
      );
      setWindowId(null);
      setDisplayCode(null);
      await pollStatus();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setClosing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const isWindowOpen = windowStatus?.isOpen && windowId;
  const checkedInCount = windowStatus?.checkedInCount ?? 0;

  // Construct the student check-in URL (they'd see a page where they can enter the code)
  const studentCheckinUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/student/checkin?courseId=${courseId}`
      : "";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <QrCode className="w-6 h-6 text-indigo-400" />
            QR Self Check-in
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {courseLoading ? (
              <span className="text-slate-500">Loading course…</span>
            ) : course ? (
              <>
                <span className="font-mono text-indigo-300">{course.code}</span>
                {" — "}
                {course.name}
              </>
            ) : (
              <span className="text-rose-400">Course not found</span>
            )}
          </p>
        </div>

        {/* Honest limitations notice */}
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-xs text-amber-300 max-w-sm">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Note:</strong> Code-sharing between students is possible. Always review
            the attendance grid before committing — absent students stay unmarked for your
            review.
          </span>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          {success}
        </div>
      )}

      {/* No window open — show start form */}
      {!isWindowOpen && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-white">Open a Check-in Window</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Session Date
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Window Duration (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={starting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {starting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <QrCode className="w-4 h-4" />
            )}
            {starting ? "Opening…" : "Start Check-in Window"}
          </button>
        </div>
      )}

      {/* Window is open — show QR + code + stats */}
      {isWindowOpen && displayCode && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: QR + code */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 flex flex-col items-center gap-6">
            <div className="flex items-center gap-4">
              <CountdownRing msRemaining={msUntilNext} totalMs={30_000} />
              <div className="text-center">
                <p className="text-xs text-slate-400 mb-1">Rotating every 30 s</p>
                <p className="text-6xl font-mono font-bold tracking-widest text-white tabular-nums">
                  {displayCode}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 w-full flex flex-col items-center gap-3">
              <p className="text-xs text-slate-400 text-center">
                Scan QR or enter code at{" "}
                <span className="font-mono text-indigo-300">/student/checkin</span>
              </p>
              <QRCodeSVG value={studentCheckinUrl} size={180} />
            </div>
          </div>

          {/* Right: stats + close */}
          <div className="space-y-4">
            {/* Live count */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-white">Checked-in students</span>
                <span className="ml-auto text-xs text-slate-500 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> live
                </span>
              </div>
              <p className="text-5xl font-bold text-emerald-400 tabular-nums">
                {checkedInCount}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                via QR self check-in (PRESENT)
              </p>
            </div>

            {/* Window time */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <Timer className="w-5 h-5 text-indigo-400" />
                <span className="font-semibold text-white">Window closes</span>
              </div>
              <p className="text-sm text-slate-300 font-mono">
                {windowStatus?.endsAt
                  ? new Date(windowStatus.endsAt).toLocaleTimeString()
                  : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Students not checked in will remain unmarked for your review.
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              disabled={closing}
              className="w-full py-3 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {closing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {closing ? "Closing…" : "Close Check-in Window"}
            </button>

            <p className="text-xs text-slate-500 text-center">
              After closing, review and commit attendance in the{" "}
              <a
                href={`/faculty/courses/${courseId}/attendance-grid`}
                className="text-indigo-400 underline underline-offset-2"
              >
                Attendance Grid
              </a>
              .
            </p>
          </div>
        </div>
      )}

      {/* Last closed window summary */}
      {!isWindowOpen && windowStatus && !windowStatus.isOpen && (
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 text-sm">
          <p className="text-slate-400 mb-2 font-medium">Last check-in window</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-slate-500 block">Opened</span>
              <span className="text-white font-mono">
                {new Date(windowStatus.startsAt).toLocaleTimeString()}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Closed</span>
              <span className="text-white font-mono">
                {windowStatus.closedAt
                  ? new Date(windowStatus.closedAt).toLocaleTimeString()
                  : new Date(windowStatus.endsAt).toLocaleTimeString() + " (expired)"}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Checked In</span>
              <span className="text-emerald-400 font-bold text-lg">
                {windowStatus.checkedInCount}
              </span>
            </div>
            <div className="flex items-end">
              <a
                href={`/faculty/courses/${courseId}/attendance-grid`}
                className="text-xs px-3 py-1.5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded-lg hover:bg-indigo-600/30 transition"
              >
                Review Grid →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
