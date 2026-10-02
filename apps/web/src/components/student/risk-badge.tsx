"use client";

import React from "react";
import { ShieldCheck, AlertTriangle, AlertOctagon } from "lucide-react";

export type RiskLevel = "CRITICAL" | "MODERATE" | "SAFE" | string;

interface RiskBadgeProps {
  category: RiskLevel;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function RiskBadge({
  category,
  size = "md",
  showIcon = true,
  className = "",
}: RiskBadgeProps) {
  const normCategory = (category || "SAFE").toUpperCase();

  if (normCategory === "CRITICAL") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-full border bg-rose-500/10 border-rose-500/30 text-rose-300 ${
          size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs sm:text-sm"
        } ${className}`}
      >
        {showIcon && <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
        <span>Critical Risk</span>
      </span>
    );
  }

  if (normCategory === "MODERATE") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-300 ${
          size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs sm:text-sm"
        } ${className}`}
      >
        {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
        <span>Moderate Risk</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs sm:text-sm"
      } ${className}`}
    >
      {showIcon && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
      <span>Safe</span>
    </span>
  );
}
