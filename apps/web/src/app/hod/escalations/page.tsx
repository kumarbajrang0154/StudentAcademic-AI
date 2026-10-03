"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  ChevronRight,
  Loader2,
  X,
  RefreshCw,
} from "lucide-react";

interface EscalationItem {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  department: string;
  tier: number;
  severity: "STANDARD" | "SEVERE";
  status: "OPEN" | "ESCALATED" | "RESOLVED" | "DISMISSED";
  triggerChannels: string[] | null;
  dispatchedAt: string | null;
  dispatchedByName: string | null;
  assignedToName: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  notificationsCount: number;
}

export default function HodEscalationsPage() {
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>(" ");

  // Detail Drawer & Resolve Modal
  const [selectedCase, setSelectedCase] = useState<EscalationItem | null>(null);
  const [resolveModalCase, setResolveModalCase] = useState<EscalationItem | null>(null);
  const [resolutionNote, setResolutionNote] = useState<string>("");
  const [isResolving, setIsResolving] = useState<boolean>(false);

  const fetchEscalations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (severityFilter !== "ALL") params.append("severity", severityFilter);

      const res = await apiFetch(`/api/v1/hod/escalations?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load escalations (${res.status})`);
      }
      const json = await res.json();
      setEscalations(json.escalations || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load escalations");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    fetchEscalations();
  }, [fetchEscalations]);

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveModalCase || !resolutionNote.trim()) return;

    try {
      setIsResolving(true);
      const res = await apiFetch(`/api/v1/hod/escalations/${resolveModalCase.id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "RESOLVED",
          resolutionNote: resolutionNote.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to resolve escalation");
      }

      setResolveModalCase(null);
      setResolutionNote("");
      if (selectedCase?.id === resolveModalCase.id) {
        setSelectedCase(null);
      }
      await fetchEscalations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Resolution failed");
    } finally {
      setIsResolving(false);
    }
  };

  const filtered = escalations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      c.studentName?.toLowerCase().includes(q) ||
      c.studentEmail?.toLowerCase().includes(q) ||
      c.department?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            Department Escalation Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Tracking Tier-1 academic alerts, multi-channel dispatches, and student remediations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchEscalations}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs font-semibold hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <span className="text-xs font-semibold px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
            {filtered.length} Case(s) Listed
          </span>
        </div>
      </div>

      {/* Error state with Retry */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs text-rose-200">{error}</span>
          </div>
          <button
            onClick={fetchEscalations}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by student name or email..."
            value={search.trim()}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 font-medium mr-1">Status:</span>
            {["ALL", "ESCALATED", "OPEN", "RESOLVED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  statusFilter === st
                    ? "bg-sky-600/30 text-sky-300 border border-sky-500/40"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 font-medium mr-1">Severity:</span>
            {["ALL", "STANDARD", "SEVERE"].map((sv) => (
              <button
                key={sv}
                onClick={() => setSeverityFilter(sv)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  severityFilter === sv
                    ? "bg-amber-600/30 text-amber-300 border border-amber-500/40"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {sv}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Escalations Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
            <span>Loading escalation cases...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No escalation cases match your active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Tier / Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Dispatched Info</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filtered.map((item) => {
                  const isSevere = item.severity === "SEVERE";
                  const isResolved = item.status === "RESOLVED";

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/30 transition cursor-pointer"
                      onClick={() => setSelectedCase(item)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100">{item.studentName}</div>
                        <div className="text-[11px] text-slate-400">{item.studentEmail}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-200">Tier {item.tier}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isSevere
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {item.severity}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isResolved
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {isResolved ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-[11px] text-slate-300">
                          {item.dispatchedAt ? (
                            <span>{new Date(item.dispatchedAt).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-slate-500">Not Dispatched</span>
                          )}
                        </div>
                        {item.triggerChannels && (
                          <div className="text-[10px] text-slate-400">
                            {item.triggerChannels.join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!isResolved && (
                            <button
                              onClick={() => {
                                setResolveModalCase(item);
                                setResolutionNote("");
                              }}
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded text-[11px] font-semibold transition"
                            >
                              Resolve
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedCase(item)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Case Details Drawer */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-lg h-full p-6 overflow-y-auto space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Escalation Case Details</h3>
                  <div className="text-xs text-slate-400">Case ID: {selectedCase.id}</div>
                </div>
                <button
                  onClick={() => setSelectedCase(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Student Overview */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Target Student
                </div>
                <div className="text-sm font-bold text-white">{selectedCase.studentName}</div>
                <div className="text-xs text-slate-300">{selectedCase.studentEmail}</div>
                <div className="text-xs text-slate-400">Department: {selectedCase.department}</div>
              </div>

              {/* Status and Severity */}
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Status</div>
                  <span className="text-xs font-bold text-slate-200">{selectedCase.status}</span>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Tier</div>
                  <span className="text-xs font-bold text-slate-200">Tier {selectedCase.tier}</span>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Severity</div>
                  <span className="text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                    {selectedCase.severity} Severity
                  </span>
                </div>
              </div>

              {/* Dispatch Timeline */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Dispatch Timeline & Governance
                </div>

                <div className="space-y-2.5 text-xs text-slate-300 border-l-2 border-sky-500/30 pl-4 ml-2">
                  <div className="relative">
                    <div className="font-semibold text-white">Case Initialized</div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(selectedCase.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {selectedCase.dispatchedAt && (
                    <div className="relative">
                      <div className="font-semibold text-amber-300">Synchronously Dispatched</div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(selectedCase.dispatchedAt).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-1">
                        Dispatched By: {selectedCase.dispatchedByName || "System Rule Trigger"}
                      </div>
                    </div>
                  )}

                  {selectedCase.status === "RESOLVED" && (
                    <div className="relative">
                      <div className="font-semibold text-emerald-400">Resolved by Authority</div>
                      <div className="text-[11px] text-slate-400">
                        {selectedCase.resolvedAt ? new Date(selectedCase.resolvedAt).toLocaleString() : ""}
                      </div>
                      {selectedCase.resolutionNote && (
                        <div className="mt-2 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 text-xs italic">
                          "{selectedCase.resolutionNote}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedCase.status !== "RESOLVED" && (
              <div className="pt-6 border-t border-slate-800">
                <button
                  onClick={() => {
                    setResolveModalCase(selectedCase);
                    setResolutionNote("");
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark Case as Resolved
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resolution Modal */}
      {resolveModalCase && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Resolve Escalation Case
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter mandatory resolution summary and academic remediation plan for {resolveModalCase.studentName}.
            </p>

            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Resolution Note (Required)
                </label>
                <textarea
                  rows={4}
                  required
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Detail the mentor meeting outcome, remediation commitments, or academic progress verified..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResolveModalCase(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResolving || !resolutionNote.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                >
                  {isResolving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
