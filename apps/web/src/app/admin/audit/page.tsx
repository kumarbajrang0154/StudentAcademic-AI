"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  FileText,
  Search,
  Eye,
  X,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  entity: string;
  entityId: string;
  action?: string;
  justification: string | null;
  previousValue: any;
  newValue: any;
  modifiedById: string;
  createdAt: string;
  modifiedBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Inspect Modal
  const [inspectEntry, setInspectEntry] = useState<AuditLogEntry | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("limit", String(limit));
      if (entityFilter !== "ALL") params.append("entity", entityFilter);

      const res = await apiFetch(`/api/v1/admin/audit?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load audit logs (${res.status})`);
      }
      const json = await res.json();
      setLogs(json.auditLogs || json.logs || []);
      setTotal(json.total || (json.auditLogs || []).length);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load audit trail");
    } finally {
      setLoading(false);
    }
  }, [page, limit, entityFilter]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const filteredLogs = logs.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.entity.toLowerCase().includes(q) ||
      l.entityId.toLowerCase().includes(q) ||
      (l.justification && l.justification.toLowerCase().includes(q)) ||
      (l.modifiedBy?.name && l.modifiedBy.name.toLowerCase().includes(q)) ||
      (l.modifiedBy?.email && l.modifiedBy.email.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-400" />
            Append-Only Audit Trail
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Immutable institutional log of user provisioning, role promotions, enrollment changes, and configuration updates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAuditLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search action, entity ID, actor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Entity Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Entity:</span>
          {[
            "ALL",
            "User",
            "Department",
            "Course",
            "CourseEnrollment",
            "MentorAssignment",
            "ReportExport",
          ].map((ent) => (
            <button
              key={ent}
              onClick={() => {
                setEntityFilter(ent);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                entityFilter === ent
                  ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                  : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {ent}
            </button>
          ))}
        </div>
      </div>

      {/* Error state with retry */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs text-rose-200">{error}</span>
          </div>
          <button
            onClick={fetchAuditLogs}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading audit events...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No audit records found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Action & Justification</th>
                  <th className="py-3 px-4">Modified By</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {l.entity}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-100 max-w-md truncate">
                        {l.justification || `${l.entity} modified`}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Target ID: {l.entityId}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {l.modifiedBy ? (
                        <div>
                          <div className="font-semibold text-slate-200">{l.modifiedBy.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {l.modifiedBy.email} ({l.modifiedBy.role})
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">System Autonomous</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setInspectEntry(l)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-medium transition inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3 h-3" />
                        Inspect Diff
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {total > limit && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total} events
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inspect Diff Modal */}
      {inspectEntry && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  Audit Event Details
                </h3>
                <span className="text-[11px] text-slate-500 font-mono">
                  Event ID: {inspectEntry.id}
                </span>
              </div>
              <button
                onClick={() => setInspectEntry(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Event Header Card */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{inspectEntry.justification}</span>
                <span className="text-slate-400 text-[11px]">
                  {new Date(inspectEntry.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Entity: <strong className="text-slate-200">{inspectEntry.entity}</strong> (ID: {inspectEntry.entityId})
              </div>
              <div className="text-[11px] text-slate-400">
                Actor:{" "}
                <strong className="text-slate-200">
                  {inspectEntry.modifiedBy?.name || "System"} ({inspectEntry.modifiedBy?.email || "internal"})
                </strong>
              </div>
            </div>

            {/* Diff Viewer Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="space-y-1.5">
                <div className="text-[11px] font-sans font-semibold text-rose-400 uppercase tracking-wider">
                  Previous State
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl h-48 overflow-y-auto text-[11px] text-slate-300 whitespace-pre-wrap">
                  {inspectEntry.previousValue
                    ? JSON.stringify(inspectEntry.previousValue, null, 2)
                    : "// None (Creation or fresh record)"}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-sans font-semibold text-emerald-400 uppercase tracking-wider">
                  New State
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl h-48 overflow-y-auto text-[11px] text-slate-300 whitespace-pre-wrap">
                  {inspectEntry.newValue
                    ? JSON.stringify(inspectEntry.newValue, null, 2)
                    : "// None (Deletion or revoked record)"}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setInspectEntry(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
