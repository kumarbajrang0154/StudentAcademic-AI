"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { MentorShell } from "@/components/mentor/mentor-shell";
import {
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  Download,
  Filter,
} from "lucide-react";

interface Intervention {
  id: string;
  title: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MISSED";
  scheduledAt: string | null;
  scheduledFor: string;
  durationMin: number;
  notes: string | null;
  preScoreAvg: number | null;
  postScoreAvg: number | null;
  student: { id: string; name: string; rollNumber: string };
}

interface InterventionsResponse {
  interventions: Intervention[];
}

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Scheduled", value: "SCHEDULED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Missed", value: "MISSED" },
];

function InterventionStatusBadge({ status }: { status: Intervention["status"] }) {
  const map: Record<Intervention["status"], { label: string; cls: string; icon: React.ReactNode }> = {
    SCHEDULED: {
      label: "Scheduled",
      cls: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
      icon: <Clock className="w-3 h-3" />,
    },
    COMPLETED: {
      label: "Completed",
      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      icon: <CheckCircle className="w-3 h-3" />,
    },
    CANCELLED: {
      label: "Cancelled",
      cls: "bg-slate-500/10 text-slate-400 border-slate-500/30",
      icon: <XCircle className="w-3 h-3" />,
    },
    MISSED: {
      label: "Missed",
      cls: "bg-rose-500/10 text-rose-400 border-rose-500/30",
      icon: <AlertTriangle className="w-3 h-3" />,
    },
  };
  const { label, cls, icon } = map[status] ?? map.SCHEDULED;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}

function StatusUpdateButton({
  interventionId,
  currentStatus,
}: {
  interventionId: string;
  currentStatus: Intervention["status"];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const transitions: Partial<Record<Intervention["status"], Intervention["status"][]>> = {
    SCHEDULED: ["COMPLETED", "CANCELLED", "MISSED"],
    MISSED: ["SCHEDULED"],
  };
  const options = transitions[currentStatus] ?? [];

  const mutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const r = await apiFetch(`/api/v1/interventions/${interventionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["interventions"] });
      setOpen(false);
    },
  });

  if (options.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700/60 transition"
      >
        Update <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-40 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden w-36">
            {options.map((s) => (
              <button
                key={s}
                onClick={() => mutation.mutate(s)}
                disabled={mutation.isPending}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                Mark {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function InterventionsPage() {
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading, error } = useQuery<InterventionsResponse>({
    queryKey: ["interventions", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const r = await apiFetch(`/api/v1/interventions?${params.toString()}`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    },
    staleTime: 30_000,
  });

  const interventions = data?.interventions ?? [];

  const upcoming = interventions.filter((i) => i.status === "SCHEDULED").length;
  const completed = interventions.filter((i) => i.status === "COMPLETED").length;

  return (
    <MentorShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-400" />
            Interventions
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Track and manage your mentoring sessions.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total", value: interventions.length, color: "text-white" },
            { label: "Upcoming", value: upcoming, color: "text-indigo-400" },
            { label: "Completed", value: completed, color: "text-emerald-400" },
            {
              label: "Missed",
              value: interventions.filter((i) => i.status === "MISSED").length,
              color: "text-rose-400",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-1"
            >
              <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                {s.label}
              </span>
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                id={`filter-${o.value || "all"}`}
                onClick={() => setStatusFilter(o.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                  statusFilter === o.value
                    ? "bg-indigo-600/15 border-indigo-500/30 text-indigo-400"
                    : "border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-rose-300 text-sm">
            {(error as Error).message}
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-slate-900/40 border border-slate-800/60 animate-pulse"
              />
            ))}
          </div>
        ) : interventions.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl px-6 py-10 text-center text-slate-500">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {statusFilter ? "No interventions match this filter." : "No interventions yet."}
            </p>
            <p className="text-xs mt-1">
              Schedule one from a mentee&apos;s profile page.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {interventions.map((iv) => {
              const dt = iv.scheduledAt || iv.scheduledFor;
              const date = dt ? new Date(dt) : null;

              return (
                <div
                  key={iv.id}
                  id={`intervention-${iv.id}`}
                  className="bg-slate-900/60 border border-slate-800/80 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  {/* Date pill */}
                  <div className="shrink-0 w-16 text-center bg-slate-800/60 rounded-xl py-2">
                    {date ? (
                      <>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                          {date.toLocaleDateString(undefined, { month: "short" })}
                        </p>
                        <p className="text-xl font-bold text-white leading-tight">
                          {date.getDate()}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {date.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">TBD</span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-white">
                        {iv.title}
                      </span>
                      <InterventionStatusBadge status={iv.status} />
                    </div>
                    <p className="text-xs text-slate-400">
                      {iv.student.name}{" "}
                      <span className="font-mono text-slate-500">
                        ({iv.student.rollNumber})
                      </span>{" "}
                      · {iv.durationMin} min
                    </p>
                    {iv.notes && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                        {iv.notes}
                      </p>
                    )}
                    {iv.preScoreAvg !== null && iv.postScoreAvg !== null && (
                      <p className="text-xs mt-1">
                        Pre:{" "}
                        <span className="text-slate-300">
                          {Math.round(iv.preScoreAvg)}%
                        </span>{" "}
                        → Post:{" "}
                        <span
                          className={
                            iv.postScoreAvg >= iv.preScoreAvg
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }
                        >
                          {Math.round(iv.postScoreAvg)}%
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusUpdateButton
                      interventionId={iv.id}
                      currentStatus={iv.status}
                    />
                    {iv.status === "SCHEDULED" && (
                      <a
                        href={`/api/v1/interventions/${iv.id}/ics`}
                        download
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-400 hover:bg-teal-500/5 px-2.5 py-1.5 rounded-lg border border-slate-700/60 hover:border-teal-500/30 transition"
                        title="Download .ics calendar invite"
                      >
                        <Download className="w-3.5 h-3.5" />
                        .ics
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MentorShell>
  );
}
