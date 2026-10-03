"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  Shield,
  Lock,
  FileText,
  CheckCircle2,
  Loader2,
  Sliders,
} from "lucide-react";

interface SettingsData {
  rbacMatrix: Record<string, Record<string, string> | string[]>;
  weights: {
    attendance: number;
    mastery: number;
    velocity: number;
  };
  thresholds: {
    criticalRiskCutoff: number;
    highRiskCutoff: number;
    attendanceDebarmentLimit: number;
    bottleneckFailRateLimit: number;
  };
}

interface AuditLogRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: string;
  justification: string;
  createdAt: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"RBAC" | "WEIGHTS" | "AUDIT">("RBAC");

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [settingsRes, auditRes] = await Promise.all([
        apiFetch("/api/v1/admin/settings"),
        apiFetch("/api/v1/admin/audit"),
      ]);

      if (!settingsRes.ok || !auditRes.ok) {
        throw new Error("Failed to load settings or audit logs");
      }

      const settingsJson = await settingsRes.json();
      const auditJson = await auditRes.json();

      setSettings({
        rbacMatrix: settingsJson.rbacMatrix || {},
        weights: settingsJson.weights || {
          attendance: settingsJson.riskWeights?.attendance ?? 0.35,
          mastery: settingsJson.riskWeights?.mastery ?? 0.45,
          velocity: settingsJson.riskWeights?.velocity ?? 0.20,
        },
        thresholds: {
          criticalRiskCutoff: settingsJson.thresholds?.criticalRiskCutoff ?? 65,
          highRiskCutoff: settingsJson.thresholds?.highRiskCutoff ?? 40,
          attendanceDebarmentLimit:
            settingsJson.thresholds?.attendanceDebarmentLimit ??
            settingsJson.thresholds?.mandatoryAttendance ??
            75,
          bottleneckFailRateLimit:
            settingsJson.thresholds?.bottleneckFailRateLimit ?? 0.4,
        },
      });
      const rawLogs = (auditJson.logs || auditJson.auditLogs || []) as Array<
        Record<string, unknown>
      >;
      const normalizedLogs = rawLogs.map((l) => ({
        id: String(l.id || ""),
        userId: String(l.userId || l.modifiedById || ""),
        userName: String(
          l.userName ||
            (l.modifiedBy as { name?: string } | undefined)?.name ||
            "System",
        ),
        userEmail: String(
          l.userEmail ||
            (l.modifiedBy as { email?: string } | undefined)?.email ||
            "system@university.edu",
        ),
        userRole: String(
          l.userRole ||
            (l.modifiedBy as { role?: string } | undefined)?.role ||
            "SYSTEM",
        ),
        action: String(
          l.action || l.justification || `${String(l.entity || "Entity")} modified`,
        ),
        entity: String(l.entity || "System"),
        entityId: String(l.entityId || ""),
        justification: String(l.justification || ""),
        createdAt: String(l.createdAt || new Date().toISOString()),
      }));
      setAuditLogs(normalizedLogs);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load system settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-400" />
            Institutional Governance & Audit Trails
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Read-only RBAC capability matrix, statistical risk weights, and immutable append-only audit records.
          </p>
        </div>

        <span className="text-xs font-semibold px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 self-start sm:self-auto">
          Read-Only Institutional Policy
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("RBAC")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === "RBAC"
              ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/40"
              : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Lock className="w-4 h-4" />
          RBAC Permissions Matrix
        </button>

        <button
          onClick={() => setActiveTab("WEIGHTS")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === "WEIGHTS"
              ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/40"
              : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Sliders className="w-4 h-4" />
          Model Weights & Thresholds
        </button>

        <button
          onClick={() => setActiveTab("AUDIT")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 ${
            activeTab === "AUDIT"
              ? "bg-indigo-600/30 text-indigo-200 border border-indigo-500/40"
              : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <FileText className="w-4 h-4" />
          Immutable Audit Log ({auditLogs.length})
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
          <span>Loading governance records...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-rose-400 text-xs flex flex-col items-center gap-3">
          <span>{error}</span>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      ) : activeTab === "RBAC" && settings ? (
        /* RBAC Matrix Table */
        <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white">Role-Based Access Control (RBAC) Matrix</h2>
            <p className="text-xs text-slate-400">
              Institutional authorization boundaries enforced at API gateway and route layers.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Scope Level</th>
                  <th className="py-3 px-4">Granted Permissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {Object.entries(settings.rbacMatrix).map(([role, permissions]) => (
                  <tr key={role} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-white">{role}</td>
                    <td className="py-3.5 px-4">
                      <span className="text-[11px] font-mono text-slate-300">
                        {role === "ADMIN"
                          ? "Global (All Departments)"
                          : role === "HOD"
                          ? "Single Department (Enforced by canAccessDepartment)"
                          : role === "FACULTY"
                          ? "Assigned Courses & Cohorts"
                          : role === "MENTOR"
                          ? "Assigned Mentees"
                          : "Self Only"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {Array.isArray(permissions)
                          ? permissions.map((p) => (
                              <span
                                key={p}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700 font-mono"
                              >
                                {p}
                              </span>
                            ))
                          : typeof permissions === "object" && permissions !== null
                          ? Object.entries(permissions).map(([perm, scope]) => (
                              <span
                                key={perm}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700 font-mono"
                              >
                                {perm}
                                {scope && scope !== "ALL" ? ` (${scope})` : ""}
                              </span>
                            ))
                          : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "WEIGHTS" && settings ? (
        /* Weights & Thresholds */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Composite Academic Risk Weights
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-300 font-medium">Mastery Score Weight</span>
                <span className="font-mono font-bold text-white text-xs">
                  {settings.weights.mastery * 100}%
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-300 font-medium">Attendance Rate Weight</span>
                <span className="font-mono font-bold text-white text-xs">
                  {settings.weights.attendance * 100}%
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-300 font-medium">Velocity Trajectory Weight</span>
                <span className="font-mono font-bold text-white text-xs">
                  {settings.weights.velocity * 100}%
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Institutional Threshold Standards
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-300 font-medium">Mandatory Debarment Limit</span>
                <span className="font-mono font-bold text-rose-400 text-xs">
                  &lt; {settings.thresholds.attendanceDebarmentLimit}% Attendance
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-300 font-medium">Critical Risk Score Cutoff</span>
                <span className="font-mono font-bold text-amber-400 text-xs">
                  &ge; {settings.thresholds.criticalRiskCutoff}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-300 font-medium">Curriculum Bottleneck Failure Cutoff</span>
                <span className="font-mono font-bold text-amber-400 text-xs">
                  &gt; {settings.thresholds.bottleneckFailRateLimit * 100}% Failure
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Immutable Audit Log Viewer */
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Append-Only Institutional Audit Log</h2>
              <p className="text-xs text-slate-400">
                Tamper-evident trail for marks updates, attendance overrides, and escalation triggers.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Immutable (POST/DELETE routes disabled)
            </span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
              No audit logs recorded in active scope.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-3">Actor</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Action / Justification</th>
                    <th className="py-3 px-4 text-right">Entity Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-white">{log.userName}</span>
                        <div className="text-[10px] text-slate-400">{log.userEmail}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {log.userRole}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-200">
                        {log.justification || log.action}
                      </td>
                      <td className="py-3 px-4 text-right text-indigo-300 text-[11px]">
                        {log.entity} #{log.entityId ? log.entityId.slice(0, 8) : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
