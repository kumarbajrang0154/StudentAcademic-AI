"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  Users,
  Search,
  AlertTriangle,
  ChevronRight,
  Loader2,
  CheckCircle2,
  X,
  ShieldCheck,
} from "lucide-react";

interface StudentRow {
  id: string;
  name: string;
  email: string;
  department: string;
  attendanceRate: number;
  masteryScore: number;
  riskCategory: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  activeEscalation: {
    id: string;
    tier: number;
    status: string;
  } | null;
  coursesCount: number;
  guardianConsent: boolean;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (riskFilter !== "ALL") params.append("riskCategory", riskFilter);
      if (search.trim()) params.append("search", search.trim());

      const res = await apiFetch(`/api/v1/admin/students?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load students (${res.status})`);
      }
      const json = await res.json();
      setStudents(json.students || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [riskFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStudents();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Student Academic Monitoring
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Departmental roster with real-time statutory attendance compliance and composite risk classification.
          </p>
        </div>

        <span className="text-xs font-semibold px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 self-start sm:self-auto">
          {students.length} Student(s) Monitored
        </span>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80 flex items-center gap-2">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by student name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-200 text-xs font-semibold rounded-lg transition"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-1.5 text-xs overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <span className="text-slate-400 font-medium mr-1">Risk Tier:</span>
          {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((tier) => (
            <button
              key={tier}
              onClick={() => setRiskFilter(tier)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                riskFilter === tier
                  ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                  : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading departmental roster...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-400 text-xs">{error}</div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
            No student records found matching the active criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4">Student</th>
                  <th className="py-3.5 px-3">Dept</th>
                  <th className="py-3.5 px-3">Attendance</th>
                  <th className="py-3.5 px-3">Mastery</th>
                  <th className="py-3.5 px-3">Risk Tier</th>
                  <th className="py-3.5 px-3">Escalation</th>
                  <th className="py-3.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {students.map((st) => (
                  <tr
                    key={st.id}
                    onClick={() => setSelectedStudent(st)}
                    className="hover:bg-slate-800/40 transition cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{st.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{st.email}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-slate-300">
                        {typeof st.department === "object"
                          ? ((st.department as { code?: string; name?: string })?.code ||
                             (st.department as { code?: string; name?: string })?.name ||
                             "CSE")
                          : st.department || "CSE"}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold font-mono ${
                            st.attendanceRate < 75 ? "text-rose-400" : "text-emerald-400"
                          }`}
                        >
                          {st.attendanceRate}%
                        </span>
                        {st.attendanceRate < 75 && (
                          <span
                            title="Below 75% statutory requirement"
                            className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          >
                            Debarred
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold font-mono text-slate-200">
                        {st.masteryScore}%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          st.riskCategory === "CRITICAL"
                            ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                            : st.riskCategory === "HIGH"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : st.riskCategory === "MEDIUM"
                            ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                        }`}
                      >
                        {st.riskCategory}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {st.activeEscalation ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" />
                          Tier-{st.activeEscalation.tier} ({st.activeEscalation.status})
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student Details Slide-over Drawer */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-bold text-white text-base">Student Academic Dossier</h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedStudent.email}</p>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Core Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Attendance</div>
                  <div className={`text-xl font-bold font-mono mt-1 ${
                    selectedStudent.attendanceRate < 75 ? "text-rose-400" : "text-emerald-400"
                  }`}>
                    {selectedStudent.attendanceRate}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {selectedStudent.attendanceRate < 75 ? "Below 75% limit" : "Satisfactory"}
                  </div>
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Course Mastery</div>
                  <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                    {selectedStudent.masteryScore}%
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Across {selectedStudent.coursesCount} enrolled courses
                  </div>
                </div>
              </div>

              {/* Guardian & Privacy Consent Status */}
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  Privacy & Guardian Consent (Module 8 Hook)
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Guardian Notification Consent:</span>
                  <span className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                    selectedStudent.guardianConsent
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {selectedStudent.guardianConsent ? "Opted In" : "Pending / Default"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  Note: Phone numbers and passwords are masked by institutional privacy policy.
                </p>
              </div>

              {/* Active Escalation Case if any */}
              {selectedStudent.activeEscalation && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Active Tier-{selectedStudent.activeEscalation.tier} Escalation Case
                  </div>
                  <p className="text-xs text-slate-300">
                    Status: <span className="font-semibold text-white">{selectedStudent.activeEscalation.status}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-800">
              <button
                onClick={() => setSelectedStudent(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
