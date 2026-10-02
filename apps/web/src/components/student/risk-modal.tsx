"use client";

import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  AlertOctagon,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { RiskBadge } from "./risk-badge";

interface FactorAttribution {
  factor: string;
  contribution: number;
  percentage?: number;
  evidence: string;
}

interface ProtectiveFactor {
  factor: string;
  contribution: number;
  evidence: string;
}

interface RiskExplanationResponse {
  studentId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  compositeRiskScore: number;
  riskLevel: string;
  overrideReason: string | null;
  velocity: number;
  velocityBand: string;
  featureAttributions: FactorAttribution[];
  protectiveFactors: ProtectiveFactor[];
  absencePatterns?: {
    weekdayBreakdown: Record<string, number>;
    patternDescription: string;
  };
  prescribedInterventions: string[];
}

interface RiskModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  courseId: string;
  persistedRiskCategory?: string;
}

export function RiskModal({
  isOpen,
  onClose,
  studentId,
  courseId,
  persistedRiskCategory,
}: RiskModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const { data, isLoading, error, refetch } = useQuery<RiskExplanationResponse>({
    queryKey: ["risk-explanation", studentId, courseId],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/v1/students/${encodeURIComponent(studentId)}/risk-explanation?courseId=${encodeURIComponent(courseId)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to load risk explanation: ${res.statusText}`);
      }
      return res.json();
    },
    enabled: isOpen && !!studentId && !!courseId,
  });

  if (!isOpen) return null;

  // Chart data: combine risk increasing (positive contribution) and protective (negative contribution)
  const chartData = data
    ? [
        ...data.featureAttributions.map((f) => ({
          name: f.factor.charAt(0).toUpperCase() + f.factor.slice(1),
          contribution: Math.round(f.contribution * 10) / 10,
          type: "risk" as const,
        })),
        ...data.protectiveFactors.map((f) => ({
          name: f.factor.charAt(0).toUpperCase() + f.factor.slice(1),
          // ensure protective is negative on chart for contrast
          contribution: -Math.abs(Math.round(f.contribution * 10) / 10),
          type: "protective" as const,
        })),
      ]
    : [];

  const displayCategory = persistedRiskCategory || data?.riskLevel || "SAFE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="risk-modal-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/60 p-6 z-10 text-slate-100"
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <RiskBadge category={displayCategory} />
              <span className="text-xs font-mono text-slate-400">
                Score: {data ? Math.round(data.compositeRiskScore) : "--"}/100
              </span>
            </div>
            <h2 id="risk-modal-title" className="text-xl font-bold text-white flex items-center gap-2">
              Why am I at risk in {data?.courseCode || "Course"}?
            </h2>
            <p className="text-sm text-slate-400">
              {data?.courseName || "Academic risk analysis and factor breakdown"}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <p className="text-sm">Calculating feature attributions & risk factors...</p>
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-rose-400 mb-4 text-sm">Failed to load risk analysis</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
            >
              Retry
            </button>
          </div>
        ) : data ? (
          <div className="space-y-6 pt-5">
            {/* Automatic Override Notice (Critical SSoT) */}
            {data.overrideReason && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3">
                <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-rose-300">
                    Automatic Critical Override Active
                  </h4>
                  <p className="text-xs text-rose-200/90 mt-1 leading-relaxed">
                    {data.overrideReason}
                  </p>
                </div>
              </div>
            )}

            {/* Velocity status */}
            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2.5">
                {data.velocityBand === "IMPROVING" ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : data.velocityBand === "STEEP_DECLINE" ? (
                  <TrendingDown className="w-4 h-4 text-rose-400" />
                ) : data.velocityBand === "DECLINING" ? (
                  <TrendingDown className="w-4 h-4 text-amber-400" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-400" />
                )}
                <div>
                  <div className="text-xs text-slate-400">Academic Trajectory</div>
                  <div className="text-sm font-semibold text-white">
                    Velocity Band: <span className="font-mono text-indigo-300">{data.velocityBand}</span>
                  </div>
                </div>
              </div>
              <div className="text-right font-mono text-sm">
                <span className={data.velocity < 0 ? "text-rose-400" : "text-emerald-400"}>
                  {data.velocity > 0 ? `+${data.velocity.toFixed(2)}` : data.velocity.toFixed(2)}%/day
                </span>
              </div>
            </div>

            {/* Waterfall / Contribution Bar Chart */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-300">Feature Contribution Breakdown</span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> Risk Increasing
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Protective
                  </span>
                </div>
              </div>

              <div className="h-44 w-full bg-slate-950/40 p-2 rounded-xl border border-slate-800">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}`} />
                    <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={12} width={80} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length && payload[0]) {
                          const item = payload[0].payload as { name: string; contribution: number; type: string };
                          return (
                            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg shadow-xl text-xs">
                              <span className="font-semibold text-white">{item.name}</span>:{" "}
                              <span className={item.type === "risk" ? "text-rose-400 font-mono" : "text-emerald-400 font-mono"}>
                                {item.contribution > 0 ? `+${item.contribution}` : item.contribution} pts
                              </span>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine x={0} stroke="#475569" strokeDasharray="3 3" />
                    <Bar dataKey="contribution" radius={[4, 4, 4, 4]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.type === "risk" ? "#F43F5E" : "#10B981"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Plain-English Evidence List */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Observable Evidence & Drivers
              </h4>
              <div className="space-y-2">
                {data.featureAttributions.map((fa, i) => (
                  <div
                    key={`risk-factor-${i}`}
                    className="p-3 bg-slate-950/50 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-xs"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-rose-200 capitalize">
                        {fa.factor} Deficit:
                      </span>{" "}
                      <span className="text-slate-300">{fa.evidence}</span>
                    </div>
                  </div>
                ))}

                {data.protectiveFactors.map((pf, i) => (
                  <div
                    key={`prot-factor-${i}`}
                    className="p-3 bg-slate-950/50 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-xs"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-emerald-200 capitalize">
                        {pf.factor} (Protective):
                      </span>{" "}
                      <span className="text-slate-300">{pf.evidence}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Absence Patterns if any */}
            {data.absencePatterns && data.absencePatterns.patternDescription && (
              <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl flex items-start gap-2.5 text-xs">
                <Calendar className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200">Temporal Absence Pattern:</span>{" "}
                  <span className="text-slate-400">{data.absencePatterns.patternDescription}</span>
                </div>
              </div>
            )}

            {/* Prescribed Next Steps */}
            {data.prescribedInterventions.length > 0 && (
              <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Prescribed Actions & Interventions
                  </h4>
                  <Link
                    href="/student/academics/prescriptions"
                    onClick={onClose}
                    className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
                  >
                    View Study Plan <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {data.prescribedInterventions.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
