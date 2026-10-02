"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { StudentShell } from "@/components/student/student-shell";
import {
  Sparkles,
  BookOpen,
  Video,
  FileText,
  ExternalLink,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

interface ResourceItem {
  id: string;
  title: string;
  type: string;
  url: string;
  chapterRef: string;
}

interface PrescriptionItem {
  topicTag: string;
  courseCode: string;
  courseName: string;
  currentMastery: number;
  resources: ResourceItem[];
  isFallback: boolean;
  demandNotice?: string;
}

interface PrescriptionsResponse {
  studentId: string;
  prescriptions: PrescriptionItem[];
}

export default function StudentPrescriptionsPage() {
  const { data, isLoading, error, refetch } = useQuery<PrescriptionsResponse>({
    queryKey: ["student-prescriptions"],
    queryFn: async () => {
      const res = await fetch("/api/v1/student/prescriptions");
      if (!res.ok) throw new Error("Failed to load prescribed study plan");
      return res.json();
    },
  });

  return (
    <StudentShell>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg">
              <Sparkles className="w-6 h-6" />
            </span>
            <span>Academic Prescriptions &amp; Study Interventions</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Personalized corrective pathways and curated remedial learning resources for topics under 50% mastery.
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          <span>Refresh Plan</span>
        </button>
      </div>

      {isLoading && (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800 animate-shimmer"
            />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <div className="p-8 rounded-2xl bg-slate-900/80 border border-rose-500/20 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-lg font-semibold text-white">Could not load study prescriptions</h3>
          <p className="text-sm text-slate-400">
            {error instanceof Error ? error.message : "Failed to load prescriptions."}
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
        <div className="space-y-6">
          {data.prescriptions.length === 0 ? (
            /* Empty State: Perfect Mastery! */
            <div className="p-12 rounded-2xl bg-slate-900/70 border border-emerald-500/30 text-center space-y-4 max-w-xl mx-auto backdrop-blur-md">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white">No Topic Deficits Detected</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                You have maintained above 50% mastery on all evaluated assessment questions across all enrolled courses. Continue your upward velocity!
              </p>
              <div className="pt-2">
                <Link
                  href="/student/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition"
                >
                  <span>Return to Overview</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Prescriptions Cards */}
              {data.prescriptions.map((p, index) => (
                <div
                  key={`${p.topicTag}-${index}`}
                  className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-xl shadow-black/20 space-y-5 hover:border-slate-700/60 transition"
                >
                  {/* Topic Header & Mastery Progress */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                          {p.courseCode}
                        </span>
                        <span className="text-xs text-slate-400">{p.courseName}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white tracking-tight">
                        Target Remedial Topic: {p.topicTag}
                      </h3>
                    </div>

                    <div className="sm:text-right">
                      <div className="flex items-center sm:justify-end gap-2 text-xs mb-1">
                        <span className="text-slate-400">Current Topic Mastery:</span>
                        <span className="font-mono font-bold text-rose-400">
                          {p.currentMastery.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(5, p.currentMastery))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Peer Demand Notice if present */}
                  {p.demandNotice && (
                    <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-center gap-2.5 text-xs text-indigo-200">
                      <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{p.demandNotice}. Consider organizing a collaborative study session.</span>
                    </div>
                  )}

                  {/* Recommended Resources List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Prescribed Learning Resources &amp; References
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {p.resources.map((res) => {
                        const isVideo = res.type.toUpperCase().includes("VIDEO");
                        const isPractice = res.type.toUpperCase().includes("PRACTICE");

                        return (
                          <a
                            key={res.id}
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-indigo-500/40 hover:bg-slate-950/90 transition flex items-start justify-between gap-3 group"
                          >
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400 group-hover:bg-indigo-600/20 transition shrink-0 mt-0.5">
                                {isVideo ? (
                                  <Video className="w-4 h-4" />
                                ) : isPractice ? (
                                  <FileText className="w-4 h-4" />
                                ) : (
                                  <BookOpen className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <h5 className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors">
                                  {res.title}
                                </h5>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Ref: {res.chapterRef} • {res.type}
                                </p>
                              </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0 transition" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </StudentShell>
  );
}
