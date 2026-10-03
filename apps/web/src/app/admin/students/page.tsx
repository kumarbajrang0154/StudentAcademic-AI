"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  GraduationCap,
  Search,
  Upload,
  BookOpen,
  Plus,
  AlertTriangle,
  Loader2,
  X,
  Download,
  CheckCircle2,
  FileSpreadsheet,
  Users,
  RefreshCw,
} from "lucide-react";

interface StudentUser {
  id: string;
  name: string;
  email: string;
  rollNumber: string | null;
  isActive: boolean;
  department: { id: string; code: string; name: string } | null;
  enrollments?: Array<{
    id: string;
    courseId: string;
    course: { id: string; code: string; name: string };
  }>;
  mentorAssignmentsAsStudent?: Array<{
    id: string;
    mentor: { id: string; name: string; email: string };
  }>;
}

interface CourseOption {
  id: string;
  code: string;
  name: string;
}

interface MentorOption {
  id: string;
  name: string;
  email: string;
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentUser[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [mentors, setMentors] = useState<MentorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Course Enroll Modal
  const [enrollStudent, setEnrollStudent] = useState<StudentUser | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Mentor Assign Modal
  const [assignStudent, setAssignStudent] = useState<StudentUser | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // CSV Import Modal
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [validatingCsv, setValidatingCsv] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvValidationResult, setCsvValidationResult] = useState<{
    isValid: boolean;
    totalRows: number;
    validRowsCount: number;
    errorRowsCount: number;
    preview: Array<{
      row: number;
      name: string;
      email: string;
      rollNumber?: string;
      departmentCode?: string;
      status: "VALID" | "ERROR";
      error?: string;
    }>;
  } | null>(null);
  const [importSuccessData, setImportSuccessData] = useState<{
    createdCount: number;
    downloadableCsv?: string;
  } | null>(null);

  // Fetch students, courses, mentors
  const fetchStudents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.append("role", "STUDENT");
      if (search.trim()) params.append("search", search.trim());

      const res = await apiFetch(`/api/v1/admin/users?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load students (${res.status})`);
      }
      const json = await res.json();
      setStudents(json.users || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadSupportingData = useCallback(async () => {
    try {
      const [coursesRes, mentorsRes] = await Promise.all([
        apiFetch("/api/v1/admin/courses"),
        apiFetch("/api/v1/admin/users?role=MENTOR&status=ACTIVE"),
      ]);
      if (coursesRes.ok) {
        const cJson = await coursesRes.json();
        setCourses(cJson || []);
      }
      if (mentorsRes.ok) {
        const mJson = await mentorsRes.json();
        setMentors(mJson.users || []);
      }
    } catch (err) {
      console.error("Failed to load courses or mentors", err);
    }
  }, []);

  useEffect(() => {
    loadSupportingData();
  }, [loadSupportingData]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Handle Enroll
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollStudent || !selectedCourseId) return;

    setEnrolling(true);
    setEnrollError(null);
    try {
      const res = await apiFetch(`/api/v1/admin/students/${enrollStudent.id}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourseId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to enroll student");
      }

      setEnrollStudent(null);
      setSelectedCourseId("");
      await fetchStudents();
    } catch (err: unknown) {
      setEnrollError(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  };

  // Handle Unenroll
  const handleUnenroll = async (studentId: string, courseId: string) => {
    if (!confirm("Are you sure you want to unenroll this student from the course?")) return;
    try {
      const res = await apiFetch(`/api/v1/admin/students/${studentId}/unenroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to unenroll student");
      }
      await fetchStudents();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Unenrollment failed");
    }
  };

  // Handle Assign Mentor
  const handleAssignMentorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignStudent || !selectedMentorId) return;

    setAssigning(true);
    setAssignError(null);
    try {
      const res = await apiFetch(`/api/v1/admin/students/${assignStudent.id}/mentor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorId: selectedMentorId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to assign mentor");
      }

      setAssignStudent(null);
      setSelectedMentorId("");
      await fetchStudents();
    } catch (err: unknown) {
      setAssignError(err instanceof Error ? err.message : "Mentor assignment failed");
    } finally {
      setAssigning(false);
    }
  };

  // Parse CSV text into rows
  const parseCsvText = (text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    // Check if first line is header
    const firstLine = lines[0] ?? "";
    const startIndex = firstLine.toLowerCase().includes("email") ? 1 : 0;
    const rows = [];

    for (let i = startIndex; i < lines.length; i++) {
      const currentLine = lines[i];
      if (!currentLine) continue;
      const parts = currentLine.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        rows.push({
          name: parts[0] || "",
          email: parts[1] || "",
          rollNumber: parts[2] || undefined,
          departmentCode: parts[3] || undefined,
        });
      }
    }
    return rows;
  };

  // Handle Validate CSV
  const handleValidateCsv = async () => {
    const rows = parseCsvText(csvText);
    if (rows.length === 0) {
      alert("Please provide at least one valid CSV row (format: name, email, rollNumber, departmentCode)");
      return;
    }

    setValidatingCsv(true);
    try {
      const res = await apiFetch("/api/v1/admin/students/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmCreate: false, rows }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "CSV validation failed");
      }

      const json = await res.json();
      setCsvValidationResult(json);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Validation error");
    } finally {
      setValidatingCsv(false);
    }
  };

  // Handle Confirm Import CSV
  const handleConfirmImport = async () => {
    const rows = parseCsvText(csvText);
    setImportingCsv(true);
    try {
      const res = await apiFetch("/api/v1/admin/students/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmCreate: true, rows }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "CSV import failed");
      }

      const json = await res.json();
      setImportSuccessData({
        createdCount: json.createdCount ?? 0,
        downloadableCsv: json.downloadableCsv,
      });
      await fetchStudents();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Import error");
    } finally {
      setImportingCsv(false);
    }
  };

  const handleDownloadCredentialsCsv = () => {
    if (!importSuccessData?.downloadableCsv) return;
    const blob = new Blob([importSuccessData.downloadableCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `imported_students_credentials_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-indigo-400" />
            Student Enrollments & Mentorship
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage student course enrollments, active mentor allocations, and bulk CSV onboarding.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCsvText("");
              setCsvValidationResult(null);
              setImportSuccessData(null);
              setCsvModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <Upload className="w-4 h-4" />
            Import Students from CSV
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by student name, email, roll no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <button
          onClick={fetchStudents}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error state with retry */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs text-rose-200">{error}</span>
          </div>
          <button
            onClick={fetchStudents}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Students Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading students...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No students found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Assigned Mentor</th>
                  <th className="py-3 px-4">Course Enrollments</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {students.map((s) => {
                  const activeMentor = s.mentorAssignmentsAsStudent?.[0]?.mentor;

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                          {s.name}
                          {s.rollNumber && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({s.rollNumber})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{s.email}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {s.department?.code || "Unassigned"}
                      </td>
                      <td className="py-3 px-4">
                        {activeMentor ? (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-200 font-medium">
                              {activeMentor.name}
                            </span>
                            <button
                              onClick={() => {
                                setAssignStudent(s);
                                setSelectedMentorId(activeMentor.id);
                                setAssignError(null);
                              }}
                              className="text-[10px] text-indigo-400 hover:underline"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAssignStudent(s);
                              setSelectedMentorId("");
                              setAssignError(null);
                            }}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Assign Mentor
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {s.enrollments && s.enrollments.length > 0 ? (
                            s.enrollments.map((e) => (
                              <span
                                key={e.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                              >
                                {e.course.code}
                                <button
                                  onClick={() => handleUnenroll(s.id, e.courseId)}
                                  className="text-slate-400 hover:text-rose-400 transition"
                                  title={`Unenroll from ${e.course.code}`}
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-[11px]">Not enrolled</span>
                          )}

                          <button
                            onClick={() => {
                              setEnrollStudent(s);
                              setSelectedCourseId("");
                              setEnrollError(null);
                            }}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-indigo-400 transition"
                            title="Enroll in course"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            s.isActive
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {s.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Enroll in Course Modal */}
      {enrollStudent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Enroll Student in Course
              </h3>
              <button
                onClick={() => setEnrollStudent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-4">
              {enrollError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                  {enrollError}
                </div>
              )}

              <p className="text-xs text-slate-300">
                Enroll <strong className="text-white">{enrollStudent.name}</strong> ({enrollStudent.email}) into an academic course.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Select Course *
                </label>
                <select
                  required
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select a course...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEnrollStudent(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enrolling || !selectedCourseId}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                >
                  {enrolling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Enrollment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Mentor Modal */}
      {assignStudent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                Assign Dedicated Mentor
              </h3>
              <button
                onClick={() => setAssignStudent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignMentorSubmit} className="space-y-4">
              {assignError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                  {assignError}
                </div>
              )}

              <p className="text-xs text-slate-300">
                Assign an active mentor for <strong className="text-white">{assignStudent.name}</strong>. A student may have exactly one active mentor assignment at any time.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Select Mentor *
                </label>
                <select
                  required
                  value={selectedMentorId}
                  onChange={(e) => setSelectedMentorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select a mentor...</option>
                  {mentors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAssignStudent(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning || !selectedMentorId}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                >
                  {assigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Assign Mentor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                Bulk Student CSV Onboarding
              </h3>
              <button
                onClick={() => setCsvModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importSuccessData ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4" />
                    Import Completed Successfully
                  </div>
                  <p className="text-xs text-slate-300">
                    Created <strong className="text-white">{importSuccessData.createdCount}</strong> new student accounts with random temporary passwords.
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Download the credentials CSV file now. Passwords are shown only in this file and will be required to be reset by each student on first login.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleDownloadCredentialsCsv}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    <Download className="w-4 h-4" />
                    Download Credentials CSV
                  </button>
                  <button
                    onClick={() => setCsvModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">
                  Paste CSV contents below. Format: <code className="text-indigo-300 font-mono">name,email,rollNumber,departmentCode</code> (one per line).
                </p>

                <textarea
                  rows={6}
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value);
                    setCsvValidationResult(null);
                  }}
                  placeholder={`John Doe,john@demo.edu,CS2026-001,CSE\nJane Smith,jane@demo.edu,CS2026-002,CSE`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />

                {/* Validation Preview */}
                {csvValidationResult && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">
                        Total Rows: {csvValidationResult.totalRows}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">
                          {csvValidationResult.validRowsCount} Valid
                        </span>
                        {csvValidationResult.errorRowsCount > 0 && (
                          <span className="text-rose-400">
                            {csvValidationResult.errorRowsCount} Errors
                          </span>
                        )}
                      </div>
                    </div>

                    {csvValidationResult.errorRowsCount > 0 && (
                      <div className="max-h-24 overflow-y-auto space-y-1 text-[11px] text-rose-300 border-t border-slate-800 pt-2">
                        {csvValidationResult.preview
                          .filter((r) => r.status === "ERROR")
                          .map((r) => (
                            <div key={r.row}>
                              Row {r.row} ({r.email}): {r.error}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCsvModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  {!csvValidationResult ? (
                    <button
                      type="button"
                      onClick={handleValidateCsv}
                      disabled={validatingCsv || !csvText.trim()}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                    >
                      {validatingCsv && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Validate CSV
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={importingCsv || csvValidationResult.validRowsCount === 0}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                    >
                      {importingCsv && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirm & Create {csvValidationResult.validRowsCount} Students
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
