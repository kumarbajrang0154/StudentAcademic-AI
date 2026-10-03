"use client";

import React, { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { MentorShell } from "@/components/mentor/mentor-shell";
import { RiskBadge, RiskLevel } from "@/components/student/risk-badge";
import { RiskModal } from "@/components/student/risk-modal";
import {
  ArrowLeft,
  TrendingUp,
  AlertTriangle,
  HelpCircle,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Zap,
  BookOpen,
  Calendar,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  YAxis,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseDetail {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  attendanceRate: number;
  masteryScore: number;
  velocity: number;
  riskCategory: RiskLevel;
  riskScore: number;
}

interface WeakTopic {
  topic: string;
  accuracy: number;
  failureCount: number;
}

interface Intervention {
  id: string;
  title: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MISSED";
  scheduledAt: string | null;
  durationMin: number;
  notes: string | null;
  actionItems: unknown;
  preScoreAvg: number | null;
  postScoreAvg: number | null;
}

interface MentorNote {
  id: string;
  body: string;
  createdAt: string;
  mentorName: string;
}

interface MenteeDetail {
  student: {
    id: string;
    name: string;
    email: string;
    rollNumber: string;
    guardianConsent: { consentGiven: boolean; consentAt: string | null } | null;
  };
  courses: CourseDetail[];
  sparkline: { date: string; score: number }[];
  topRiskDrivers: { factor: string; impact: number; explanation: string }[];
  overrideReason: string | null;
  weakTopics: WeakTopic[];
  interventions: Intervention[];
  notes: MentorNote[];
}

interface DetailResponse {
  mentee: MenteeDetail;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InterventionStatusBadge({ status }: { status: Intervention["status"] }) {
  const map: Record<Intervention["status"], { label: string; cls: string }> = {
    SCHEDULED: { label: "Scheduled", cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30" },
    COMPLETED: { label: "Completed", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    CANCELLED: { label: "Cancelled", cls: "bg-slate-500/10 text-slate-400 border-slate-500/30" },
    MISSED: { label: "Missed", cls: "bg-rose-500/10 text-rose-400 border-rose-500/30" },
  };
  const { label, cls } = map[status] ?? map.SCHEDULED;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Intervene Modal ──────────────────────────────────────────────────────────

interface InterveneModalProps {
  studentId: string;
  studentName: string;
  onClose: () => void;
}

function InterveneModal({ studentId, studentName, onClose }: InterveneModalProps) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMin, setDurationMin] = useState(15);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/api/v1/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          title: title.trim() || `Mentor session – ${studentName}`,
          scheduledAt: scheduledAt || null,
          durationMin,
          notes: notes.trim() || null,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? `${r.status}`);
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mentee-detail", studentId] });
      qc.invalidateQueries({ queryKey: ["interventions"] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-teal-400" />
            Schedule Intervention
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-400">
            Creating intervention session for{" "}
            <span className="text-white font-semibold">{studentName}</span>
          </p>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2 text-rose-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Session Title
            </label>
            <input
              id="intervene-title"
              type="text"
              placeholder={`Mentor session – ${studentName}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Scheduled Date &amp; Time
              </label>
              <input
                id="intervene-datetime"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Duration (minutes)
              </label>
              <select
                id="intervene-duration"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition"
              >
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Notes (optional)
            </label>
            <textarea
              id="intervene-notes"
              rows={3}
              placeholder="Topics to cover, action items…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition resize-none"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700/60 text-sm text-slate-400 hover:text-white hover:border-slate-600 transition"
          >
            Cancel
          </button>
          <button
            id="intervene-submit"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Escalation Dialog ────────────────────────────────────────────────────────

interface EscalationDialogProps {
  studentId: string;
  studentName: string;
  onClose: () => void;
}

function EscalationDialog({ studentId, studentName, onClose }: EscalationDialogProps) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/api/v1/mentor/escalation-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, reason: reason.trim() }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? `${r.status}`);
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mentee-detail", studentId] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-rose-500/30 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Request Escalation
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-400">
            Escalating case for{" "}
            <span className="text-white font-semibold">{studentName}</span> to HOD. Provide a
            detailed reason.
          </p>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2 text-rose-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Reason for Escalation <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="escalation-reason"
              rows={4}
              placeholder="Describe the situation requiring HOD attention…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/20 transition resize-none"
            />
            <p className="text-[11px] text-slate-500 mt-1">{reason.length} / 1000</p>
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700/60 text-sm text-slate-400 hover:text-white hover:border-slate-600 transition"
          >
            Cancel
          </button>
          <button
            id="escalation-submit"
            onClick={() => {
              if (!reason.trim()) {
                setError("Reason cannot be empty");
                return;
              }
              mutation.mutate();
            }}
            disabled={mutation.isPending || !reason.trim()}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            Escalate
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MenteeDetailPage() {
  const params = useParams();
  const studentId = params.studentId as string;
  const router = useRouter();
  const qc = useQueryClient();

  const [riskModal, setRiskModal] = useState<{ courseId: string; riskCategory: string } | null>(null);
  const [showIntervene, setShowIntervene] = useState(false);
  const [showEscalation, setShowEscalation] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState("");
  const noteSendRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: ["mentee-detail", studentId],
    queryFn: async () => {
      const r = await apiFetch(`/api/v1/mentor/mentees/${encodeURIComponent(studentId)}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? `${r.status}`);
      }
      return r.json();
    },
    enabled: !!studentId,
    staleTime: 30_000,
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(
        `/api/v1/mentor/mentees/${encodeURIComponent(studentId)}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: noteText.trim() }),
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.message ?? `${r.status}`);
      }
      return r.json();
    },
    onSuccess: () => {
      setNoteText("");
      setNoteError("");
      qc.invalidateQueries({ queryKey: ["mentee-detail", studentId] });
    },
    onError: (err: Error) => setNoteError(err.message),
  });

  const mentee = data?.mentee;
  const student = mentee?.student;
  const sparkline = mentee?.sparkline ?? [];

  if (isLoading) {
    return (
      <MentorShell>
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </MentorShell>
    );
  }

  if (error || !mentee) {
    return (
      <MentorShell>
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <XCircle className="w-10 h-10 text-rose-400" />
          <p className="text-slate-400 text-sm">
            {error ? (error as Error).message : "Student not found."}
          </p>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-teal-400 hover:text-teal-300 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Go back
          </button>
        </div>
      </MentorShell>
    );
  }

  return (
    <MentorShell>
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Mentees
      </button>

      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-5 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-700 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl shrink-0 shadow-lg">
          {student!.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-white">{student!.name}</h1>
            <span className="font-mono text-sm text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
              {student!.rollNumber}
            </span>
            {mentee.courses.length > 0 && (
              <RiskBadge
                category={
                  mentee.courses.reduce((worst, c) => {
                    const ord = { CRITICAL: 2, MODERATE: 1, SAFE: 0 } as Record<string, number>;
                    return (ord[c.riskCategory] ?? 0) > (ord[worst] ?? 0)
                      ? c.riskCategory
                      : worst;
                  }, "SAFE" as RiskLevel)
                }
              />
            )}
          </div>
          <p className="text-sm text-slate-400 mt-0.5">{student!.email}</p>
          {mentee.overrideReason && (
            <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Override: {mentee.overrideReason}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 shrink-0 flex-wrap">
          <button
            id="btn-intervene"
            onClick={() => setShowIntervene(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600/15 border border-teal-500/30 text-teal-300 text-sm font-medium hover:bg-teal-600/25 transition"
          >
            <Zap className="w-4 h-4" />
            Intervene
          </button>
          <button
            id="btn-escalate"
            onClick={() => setShowEscalation(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600/10 border border-rose-500/30 text-rose-300 text-sm font-medium hover:bg-rose-600/20 transition"
          >
            <AlertTriangle className="w-4 h-4" />
            Escalate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sparkline */}
          {sparkline.length > 1 && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-400" />
                Mastery Trend (14 days)
              </h2>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={sparkline}>
                  <defs>
                    <linearGradient id="menteeSparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v) => [
                      typeof v === "number" ? `${v.toFixed(1)}%` : String(v),
                      "Mastery",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#14b8a6"
                    strokeWidth={2}
                    fill="url(#menteeSparkGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Course Cards */}
          <div>
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              Enrolled Courses
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mentee.courses.map((c) => (
                <div
                  key={c.courseId}
                  className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono text-slate-400">
                        {c.courseCode}
                      </span>
                      <p className="text-sm font-semibold text-white mt-0.5 leading-tight">
                        {c.courseName}
                      </p>
                    </div>
                    <RiskBadge category={c.riskCategory} size="sm" showIcon={false} />
                  </div>

                  {/* Progress bars */}
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Attendance</span>
                        <span
                          className={
                            c.attendanceRate >= 75 ? "text-emerald-400" : "text-rose-400"
                          }
                        >
                          {Math.round(c.attendanceRate)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            c.attendanceRate >= 75 ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, c.attendanceRate)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Mastery</span>
                        <span
                          className={
                            c.masteryScore >= 60 ? "text-indigo-400" : "text-amber-400"
                          }
                        >
                          {Math.round(c.masteryScore)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            c.masteryScore >= 60 ? "bg-indigo-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${Math.min(100, c.masteryScore)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    id={`btn-risk-${c.courseId}`}
                    onClick={() =>
                      setRiskModal({
                        courseId: c.courseId,
                        riskCategory: c.riskCategory,
                      })
                    }
                    className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-teal-400 hover:bg-teal-500/5 px-3 py-1.5 rounded-lg border border-slate-700/60 hover:border-teal-500/30 transition"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Why at risk?
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Weak Topics */}
          {mentee.weakTopics.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">
                Weak Topics
              </h2>
              <div className="space-y-2.5">
                {mentee.weakTopics.map((t) => (
                  <div key={t.topic} className="flex items-center gap-3">
                    <span className="text-xs text-slate-300 flex-1 truncate">
                      {t.topic}
                    </span>
                    <span className="text-xs text-rose-400 shrink-0">
                      {Math.round(t.accuracy * 100)}% accuracy
                    </span>
                    <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
                      <div
                        className="h-full bg-rose-500 rounded-full"
                        style={{ width: `${Math.min(100, t.accuracy * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Intervention History */}
          {mentee.interventions.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                Intervention History
              </h2>
              <div className="space-y-3">
                {mentee.interventions.map((iv) => (
                  <div
                    key={iv.id}
                    className="flex items-start gap-3 px-3 py-3 bg-slate-800/40 rounded-xl border border-slate-700/40"
                  >
                    <div className="shrink-0 mt-0.5">
                      {iv.status === "COMPLETED" ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : iv.status === "SCHEDULED" ? (
                        <Clock className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-white">
                          {iv.title}
                        </span>
                        <InterventionStatusBadge status={iv.status} />
                      </div>
                      {iv.scheduledAt && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {new Date(iv.scheduledAt).toLocaleString()} · {iv.durationMin} min
                        </p>
                      )}
                      {iv.notes && (
                        <p className="text-[11px] text-slate-400 mt-1">{iv.notes}</p>
                      )}
                      {iv.preScoreAvg !== null && iv.postScoreAvg !== null && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Pre: {Math.round(iv.preScoreAvg)}% → Post:{" "}
                          <span
                            className={
                              iv.postScoreAvg > iv.preScoreAvg
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }
                          >
                            {Math.round(iv.postScoreAvg)}%
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (1/3) */}
        <div className="space-y-6">
          {/* Risk Drivers */}
          {mentee.topRiskDrivers.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Top Risk Drivers
              </h2>
              <div className="space-y-3">
                {mentee.topRiskDrivers.map((d) => (
                  <div key={d.factor}>
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span className="capitalize">{d.factor}</span>
                      <span className="text-rose-400 font-medium">
                        +{d.impact.toFixed(1)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500/70 rounded-full"
                        style={{ width: `${Math.min(100, d.impact)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{d.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes Timeline */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-teal-400" />
              Mentor Notes
            </h2>

            {/* Add Note */}
            <div className="mb-4">
              <textarea
                id="note-input"
                rows={3}
                placeholder="Add a note about this mentee…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition resize-none"
              />
              {noteError && (
                <p className="text-xs text-rose-400 mt-1">{noteError}</p>
              )}
              <button
                ref={noteSendRef}
                id="note-submit"
                onClick={() => {
                  if (!noteText.trim()) {
                    setNoteError("Note cannot be empty");
                    return;
                  }
                  addNote.mutate();
                }}
                disabled={addNote.isPending || !noteText.trim()}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-teal-600/15 border border-teal-500/30 text-teal-300 text-sm font-medium hover:bg-teal-600/25 transition disabled:opacity-50"
              >
                {addNote.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Save Note
              </button>
            </div>

            {/* Timeline */}
            {mentee.notes.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-3">
                No notes yet.
              </p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {mentee.notes.map((n) => (
                  <div
                    key={n.id}
                    className="relative pl-5 before:absolute before:left-1.5 before:top-2 before:bottom-0 before:w-px before:bg-slate-700/60"
                  >
                    <div className="absolute left-0 top-2 w-3 h-3 rounded-full bg-teal-500/30 border border-teal-500/60" />
                    <div className="bg-slate-800/40 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {n.mentorName} ·{" "}
                        {new Date(n.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Guardian Consent */}
          {student!.guardianConsent !== null && (
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400">
              <p className="font-medium text-slate-300 mb-1">Guardian Consent</p>
              {student!.guardianConsent.consentGiven ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Given on{" "}
                  {student!.guardianConsent.consentAt
                    ? new Date(student!.guardianConsent.consentAt).toLocaleDateString()
                    : "—"}
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Pending
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {riskModal && (
        <RiskModal
          isOpen={!!riskModal}
          onClose={() => setRiskModal(null)}
          studentId={studentId}
          courseId={riskModal.courseId}
          persistedRiskCategory={riskModal.riskCategory}
        />
      )}

      {showIntervene && (
        <InterveneModal
          studentId={studentId}
          studentName={student!.name}
          onClose={() => setShowIntervene(false)}
        />
      )}

      {showEscalation && (
        <EscalationDialog
          studentId={studentId}
          studentName={student!.name}
          onClose={() => setShowEscalation(false)}
        />
      )}
    </MentorShell>
  );
}
