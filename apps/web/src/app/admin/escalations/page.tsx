"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  ChevronRight,
  Loader2,
  X,
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

export default function AdminEscalationsPage() {
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  // Detail Drawer & Resolve Modal
  const [selectedCase, setSelectedCase] = useState<EscalationItem | null>(null);
  const [resolveModalCase, setResolveModalCase] = useState<EscalationItem | null>(null);
  const [resolutionNote, setResolutionNote] = useState<string>("");
  const [isResolving, setIsResolving] = useState<boolean>(false);

  const fetchEscalations = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (severityFilter !== "ALL") params.append("severity", severityFilter);

      const res = await apiFetch(`/api/v1/admin/escalations?${params.toString()}`);
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
  };

  useEffect(() => {
    fetchEscalations();
  }, [statusFilter, severityFilter]);

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveModalCase || !resolutionNote.trim()) return;

    try {
      setIsResolving(true);
      const res = await apiFetch(`/api/v1/admin/escalations/${resolveModalCase.id}`, {
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
      fetchEscalations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Resolution update failed");
    } finally {
      setIsResolving(false);
    }
  };

  const filtered = escalations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.studentName.toLowerCase().includes(q) ||
      c.studentEmail.toLowerCase().includes(q) ||
      c.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            Institutional Escalation Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Tracking Tier-1 academic alerts, multi-channel dispatches, calendar holds, and resolution notes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
            {filtered.length} Case(s) Listed
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by student name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
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
                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
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
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading escalation cases...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400 text-xs">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
            No escalation records found matching the active filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-3">Dept</th>
                  <th className="py-3.5 px-3">Tier & Severity</th>
                  <th className="py-3.5 px-3">Channels</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3">Dispatched / Resolved</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-800/40 transition cursor-pointer"
                    onClick={() => setSelectedCase(item)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{item.studentName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{item.studentEmail}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-300">{item.department}</span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          Tier {item.tier}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            item.severity === "SEVERE"
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                              : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          }`}
                        >
                          {item.severity}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {item.triggerChannels && item.triggerChannels.length > 0 ? (
                          item.triggerChannels.map((ch, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400"
                            >
                              {ch}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">None</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${
                          item.status === "RESOLVED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : item.status === "ESCALATED"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {item.status === "RESOLVED" && <CheckCircle2 className="w-3 h-3" />}
                        {item.status === "ESCALATED" && <Clock className="w-3 h-3" />}
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[11px] text-slate-400">
                      {item.status === "RESOLVED" ? (
                        <span>
                          {item.resolvedAt ? new Date(item.resolvedAt).toLocaleDateString() : "Resolved"}
                        </span>
                      ) : item.dispatchedAt ? (
                        <span>{new Date(item.dispatchedAt).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-slate-400 italic">Pending dispatch</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {item.status !== "RESOLVED" && (
                          <button
                            onClick={() => {
                              setResolveModalCase(item);
                              setResolutionNote("");
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition"
                          >
                            Resolve
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedCase(item)}
                          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Detail Drawer */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-white text-base">Escalation Case Details</h3>
                  <p className="text-xs text-slate-400">Case ID: {selectedCase.id.slice(0, 8)}...</p>
                </div>
                <button
                  onClick={() => setSelectedCase(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Student Card */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="text-[10px] uppercase font-semibold text-slate-400">Target Student</div>
                <p className="text-sm font-bold text-white">{selectedCase.studentName}</p>
                <p className="text-xs text-slate-400 font-mono">{selectedCase.studentEmail}</p>
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Dept: {selectedCase.department}
                  </span>
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

                <div className="space-y-2.5 text-xs text-slate-300 border-l-2 border-indigo-500/30 pl-4 ml-2">
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
                      <div className="font-semibold text-emerald-400">Resolved by Administrator</div>
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
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
