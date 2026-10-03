"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Search,
  Loader2,
  AlertTriangle,
  X,
  RefreshCw,
  GraduationCap,
  Award,
} from "lucide-react";

interface CourseRow {
  id: string;
  code: string;
  name: string;
  credits: number;
  departmentId: string;
  department: { id: string; code: string; name: string };
  facultyId: string | null;
  faculty: { id: string; name: string; email: string } | null;
  _count: {
    enrollments: number;
    sessions: number;
    assessments: number;
  };
}

interface DepartmentOption {
  id: string;
  code: string;
  name: string;
}

interface FacultyOption {
  id: string;
  name: string;
  email: string;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [facultyList, setFacultyList] = useState<FacultyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Create Course Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCredits, setNewCredits] = useState(3);
  const [newDeptId, setNewDeptId] = useState("");
  const [newFacultyId, setNewFacultyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Course Modal
  const [editCourse, setEditCourse] = useState<CourseRow | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editCredits, setNewEditCredits] = useState(3);
  const [editFacultyId, setEditFacultyId] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Course Modal
  const [deleteCourse, setDeleteCourse] = useState<CourseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConflict, setDeleteConflict] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch("/api/v1/admin/courses");
      if (!res.ok) {
        throw new Error(`Failed to load courses (${res.status})`);
      }
      const json = await res.json();
      setCourses(json || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSupportingData = useCallback(async () => {
    try {
      const [deptRes, facRes] = await Promise.all([
        apiFetch("/api/v1/admin/departments"),
        apiFetch("/api/v1/admin/users?role=FACULTY&status=ACTIVE"),
      ]);
      if (deptRes.ok) {
        const dJson = await deptRes.json();
        setDepartments(dJson || []);
      }
      if (facRes.ok) {
        const fJson = await facRes.json();
        setFacultyList(fJson.users || []);
      }
    } catch (err) {
      console.error("Failed to load departments or faculty", err);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
    loadSupportingData();
  }, [fetchCourses, loadSupportingData]);

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const res = await apiFetch("/api/v1/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim().toUpperCase(),
          name: newName.trim(),
          credits: Number(newCredits) || 3,
          departmentId: newDeptId,
          facultyId: newFacultyId || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to create course");
      }

      setCreateModalOpen(false);
      setNewCode("");
      setNewName("");
      setNewCredits(3);
      setNewDeptId("");
      setNewFacultyId("");
      await fetchCourses();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Creation failed");
    } finally {
      setCreating(false);
    }
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCourse) return;

    setEditing(true);
    setEditError(null);

    try {
      const res = await apiFetch(`/api/v1/admin/courses/${editCourse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editCode.trim().toUpperCase(),
          name: editName.trim(),
          credits: Number(editCredits) || 3,
          facultyId: editFacultyId || null,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to update course");
      }

      setEditCourse(null);
      await fetchCourses();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setEditing(false);
    }
  };

  // Handle Delete Submit
  const handleDeleteSubmit = async () => {
    if (!deleteCourse) return;

    setDeleting(true);
    setDeleteConflict(null);

    try {
      const res = await apiFetch(`/api/v1/admin/courses/${deleteCourse.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setDeleteConflict(json.message || "Course has existing enrollments, sessions, or assessment records and cannot be deleted.");
          return;
        }
        throw new Error(json.message || "Failed to delete course");
      }

      setDeleteCourse(null);
      await fetchCourses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = courses.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.code.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.department.code.toLowerCase().includes(q) ||
      (c.faculty?.name && c.faculty.name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-400" />
            Course Catalog & Faculty Assignment
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Institutional master directory of academic courses, credit definitions, and assigned instructors.
          </p>
        </div>

        <button
          onClick={() => {
            setNewCode("");
            setNewName("");
            setNewCredits(3);
            setNewDeptId(departments[0]?.id || "");
            setNewFacultyId("");
            setCreateError(null);
            setCreateModalOpen(true);
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          Create Course
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by code, title, or instructor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <button
          onClick={fetchCourses}
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
            onClick={fetchCourses}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Courses Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading courses...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No courses found. Click "Create Course" to add a new course offering.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Credits</th>
                  <th className="py-3 px-4">Assigned Faculty</th>
                  <th className="py-3 px-4 text-center">Enrolled</th>
                  <th className="py-3 px-4 text-center">Assessments</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-100">{c.code}</div>
                      <div className="text-[11px] text-slate-400">{c.name}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px]">
                        {c.department.code}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono">{c.credits} cr</td>
                    <td className="py-3 px-4">
                      {c.faculty ? (
                        <div>
                          <div className="font-semibold text-slate-200">{c.faculty.name}</div>
                          <div className="text-[10px] text-slate-500">{c.faculty.email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-slate-300 font-semibold">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-500" />
                        {c._count.enrollments}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-slate-300 font-semibold">
                        <Award className="w-3.5 h-3.5 text-slate-500" />
                        {c._count.assessments}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setEditCourse(c);
                            setEditCode(c.code);
                            setEditName(c.name);
                            setNewEditCredits(c.credits);
                            setEditFacultyId(c.facultyId || "");
                            setEditError(null);
                          }}
                          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
                          title="Edit Course"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteCourse(c);
                            setDeleteConflict(null);
                          }}
                          className="p-1.5 hover:bg-rose-500/20 rounded-lg text-slate-400 hover:text-rose-400 transition"
                          title="Delete Course"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Create Course Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Create New Course
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {createError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Course Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS201, EEE302"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Course Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Data Structures and Algorithms"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Department *
                  </label>
                  <select
                    required
                    value={newDeptId}
                    onChange={(e) => setNewDeptId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select department...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Credits (1 - 10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={newCredits}
                    onChange={(e) => setNewCredits(parseInt(e.target.value, 10) || 3)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Assign Faculty
                </label>
                <select
                  value={newFacultyId}
                  onChange={(e) => setNewFacultyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {facultyList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newDeptId}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                >
                  {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editCourse && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-400" />
                Edit Course ({editCourse.code})
              </h3>
              <button
                onClick={() => setEditCourse(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {editError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Course Code
                </label>
                <input
                  type="text"
                  required
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Course Title
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Credits
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={editCredits}
                  onChange={(e) => setNewEditCredits(parseInt(e.target.value, 10) || 3)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Assigned Faculty
                </label>
                <select
                  value={editFacultyId}
                  onChange={(e) => setEditFacultyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Unassigned</option>
                  {facultyList.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditCourse(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editing}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                >
                  {editing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Course Modal */}
      {deleteCourse && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                Delete Course ({deleteCourse.code})
              </h3>
              <button
                onClick={() => setDeleteCourse(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteConflict ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" />
                    Cannot Delete Course
                  </div>
                  <p className="text-xs text-slate-300">{deleteConflict}</p>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setDeleteCourse(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">
                  Are you sure you want to delete course <strong className="text-white">{deleteCourse.code} - {deleteCourse.name}</strong>?
                </p>
                <p className="text-[11px] text-slate-400">
                  Deletion will be rejected if students are enrolled or teaching sessions exist.
                </p>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDeleteCourse(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSubmit}
                    disabled={deleting}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                  >
                    {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Delete Course
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
