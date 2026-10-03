"use client";

import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  Users,
  Search,
  UserPlus,
  Key,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Copy,
  Check,
  UserX,
  UserCheck,
  AlertCircle,
} from "lucide-react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "FACULTY" | "MENTOR" | "HOD" | "ADMIN";
  departmentId: string | null;
  department: { id: string; code: string; name: string } | null;
  headedDepartment: { id: string; code: string; name: string } | null;
  rollNumber: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

interface DepartmentOption {
  id: string;
  code: string;
  name: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [deptFilter, setDeptFilter] = useState<string>("ALL");

  // Create User Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"STUDENT" | "FACULTY" | "MENTOR" | "HOD" | "ADMIN">("STUDENT");
  const [newDeptId, setNewDeptId] = useState("");
  const [newRollNumber, setNewRollNumber] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temporaryPassword?: string;
  } | null>(null);
  const [replaceHODConfirm, setReplaceHODConfirm] = useState<{
    message: string;
    existingHOD: string;
  } | null>(null);

  // Edit User Modal State
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editDeptId, setEditDeptId] = useState("");
  const [editRollNumber, setEditRollNumber] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Reset Password State
  const [resetModalUser, setResetModalUser] = useState<UserRow | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetSuccessCreds, setResetSuccessCreds] = useState<{
    email: string;
    temporaryPassword?: string;
  } | null>(null);

  // Delete User State
  const [deleteModalUser, setDeleteModalUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteConflictMessage, setDeleteConflictMessage] = useState<string | null>(null);

  // Clipboard Copied State
  const [copied, setCopied] = useState(false);

  // Fetch departments for dropdowns
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/admin/departments");
      if (res.ok) {
        const json = await res.json();
        setDepartments(json || []);
      }
    } catch (err) {
      console.error("Failed to load departments", err);
    }
  }, []);

  // Fetch users with filters
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (roleFilter !== "ALL") params.append("role", roleFilter);
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (deptFilter !== "ALL") params.append("departmentId", deptFilter);

      const res = await apiFetch(`/api/v1/admin/users?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load users (${res.status})`);
      }
      const json = await res.json();
      setUsers(json.users || []);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, deptFilter]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Handle Create User Submit
  const handleCreateSubmit = async (e: React.FormEvent, forceReplace = false) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const res = await apiFetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim().toLowerCase(),
          role: newRole,
          departmentId: newDeptId || undefined,
          rollNumber: newRollNumber.trim() || undefined,
          replaceExistingHead: forceReplace,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409 && json.requiresConfirmation) {
          setReplaceHODConfirm({
            message: json.message,
            existingHOD: json.existingHOD?.name || "current HOD",
          });
          return;
        }
        throw new Error(json.message || "Failed to create user");
      }

      setReplaceHODConfirm(null);
      setCreatedCredentials({
        email: json.user.email,
        temporaryPassword: json.temporaryPassword,
      });
      await fetchUsers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Handle Edit User Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;

    setEditSubmitting(true);
    setEditError(null);

    try {
      const res = await apiFetch(`/api/v1/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim().toLowerCase(),
          departmentId: editDeptId || null,
          rollNumber: editRollNumber.trim() || null,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to update user");
      }

      setEditUser(null);
      await fetchUsers();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Handle Toggle Active/Inactive Status
  const handleToggleStatus = async (user: UserRow) => {
    try {
      const newStatus = !user.isActive;
      const res = await apiFetch(`/api/v1/admin/users/${user.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to toggle user status");
      }

      await fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Status update failed");
    }
  };

  // Handle Reset Password Submit
  const handleResetPassword = async () => {
    if (!resetModalUser) return;
    setResettingPassword(true);

    try {
      const res = await apiFetch(`/api/v1/admin/users/${resetModalUser.id}/reset-password`, {
        method: "PATCH",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to reset password");
      }

      const json = await res.json();
      setResetSuccessCreds({
        email: resetModalUser.email,
        temporaryPassword: json.temporaryPassword,
      });
      await fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setResettingPassword(false);
    }
  };

  // Handle Hard Delete User
  const handleDeleteUser = async () => {
    if (!deleteModalUser) return;
    setDeletingUser(true);
    setDeleteConflictMessage(null);

    try {
      const res = await apiFetch(`/api/v1/admin/users/${deleteModalUser.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setDeleteConflictMessage(json.message || "User has dependent records and cannot be deleted. Please deactivate instead.");
          return;
        }
        throw new Error(json.message || "Failed to delete user");
      }

      setDeleteModalUser(null);
      await fetchUsers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingUser(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "bg-rose-500/10 text-rose-300 border-rose-500/20";
      case "HOD":
        return "bg-amber-500/10 text-amber-300 border-amber-500/20";
      case "FACULTY":
        return "bg-violet-500/10 text-violet-300 border-violet-500/20";
      case "MENTOR":
        return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
      default:
        return "bg-sky-500/10 text-sky-300 border-sky-500/20";
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            User Directory & Access Control
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage institutional users across all roles, provision temporary passwords, and control status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setNewName("");
              setNewEmail("");
              setNewRole("STUDENT");
              setNewDeptId("");
              setNewRollNumber("");
              setCreateError(null);
              setCreatedCredentials(null);
              setReplaceHODConfirm(null);
              setCreateModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <UserPlus className="w-4 h-4" />
            Create User
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
            placeholder="Search by name, email, roll no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Role Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 font-medium mr-1">Role:</span>
            {["ALL", "STUDENT", "FACULTY", "MENTOR", "HOD", "ADMIN"].map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  roleFilter === r
                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-400 font-medium mr-1">Status:</span>
            {["ALL", "ACTIVE", "INACTIVE"].map((st) => (
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

          {/* Department Filter */}
          {departments.length > 0 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-2.5 py-1.5 outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} - {d.name}
                </option>
              ))}
            </select>
          )}
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
            onClick={fetchUsers}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading user directory...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No users match the active search and filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department / Program</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Security</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {users.map((u) => {
                  const deptDisplay =
                    u.headedDepartment
                      ? `HOD: ${u.headedDepartment.code}`
                      : u.department
                      ? u.department.code
                      : "Unassigned";

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100 flex items-center gap-2">
                          {u.name}
                          {u.rollNumber && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({u.rollNumber})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getRoleBadge(
                            u.role,
                          )}`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{deptDisplay}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition ${
                            u.isActive
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                          }`}
                          title="Click to toggle account status"
                        >
                          {u.isActive ? (
                            <>
                              <UserCheck className="w-3 h-3" /> Active
                            </>
                          ) : (
                            <>
                              <UserX className="w-3 h-3" /> Deactivated
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        {u.mustChangePassword ? (
                          <span className="text-[10px] text-amber-400 font-medium">
                            Must reset password
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Verified</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditUser(u);
                              setEditName(u.name);
                              setEditEmail(u.email);
                              setEditDeptId(u.departmentId || "");
                              setEditRollNumber(u.rollNumber || "");
                              setEditError(null);
                            }}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
                            title="Edit User Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setResetModalUser(u);
                              setResetSuccessCreds(null);
                            }}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-amber-400 transition"
                            title="Reset Password"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteModalUser(u);
                              setDeleteConflictMessage(null);
                            }}
                            className="p-1.5 hover:bg-rose-500/20 rounded-lg text-slate-400 hover:text-rose-400 transition"
                            title="Delete User"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Create User Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                Create Institutional User
              </h3>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdCredentials ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4" />
                    User Created Successfully
                  </div>
                  <p className="text-xs text-slate-300">
                    A secure 14-character temporary password was generated. It will be displayed only once.
                  </p>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between font-mono text-sm text-amber-300">
                    <span>{createdCredentials.temporaryPassword}</span>
                    <button
                      onClick={() => copyToClipboard(createdCredentials.temporaryPassword || "")}
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition flex items-center gap-1 text-xs"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    The user will be required to choose a new password upon first sign-in.
                  </p>
                </div>

                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition"
                >
                  Done
                </button>
              </div>
            ) : replaceHODConfirm ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" />
                    Department Already Has HOD
                  </div>
                  <p className="text-xs text-slate-300">
                    {replaceHODConfirm.message}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Replacing the HOD will change {replaceHODConfirm.existingHOD}'s role to FACULTY.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setReplaceHODConfirm(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleCreateSubmit(e, true)}
                    disabled={createSubmitting}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                  >
                    {createSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm Replacement
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={(e) => handleCreateSubmit(e, false)} className="space-y-3">
                {createError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                    {createError}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Dr. Alex Mercer"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Institutional Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. alex.mercer@demo.edu"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Role *
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="STUDENT">Student</option>
                      <option value="FACULTY">Faculty</option>
                      <option value="MENTOR">Mentor</option>
                      <option value="HOD">HOD (Department Head)</option>
                      <option value="ADMIN">System Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Department {newRole === "HOD" ? "*" : ""}
                    </label>
                    <select
                      value={newDeptId}
                      required={newRole === "HOD"}
                      onChange={(e) => setNewDeptId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">None / Unassigned</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} - {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {newRole === "STUDENT" && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Roll Number (Optional)
                    </label>
                    <input
                      type="text"
                      value={newRollNumber}
                      onChange={(e) => setNewRollNumber(e.target.value)}
                      placeholder="e.g. CS2026-042"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

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
                    disabled={createSubmitting}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                  >
                    {createSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Create Account
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-400" />
                Edit User ({editUser.name})
              </h3>
              <button
                onClick={() => setEditUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3">
              {editError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Full Name
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
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={editDeptId}
                  onChange={(e) => setEditDeptId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">None / Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {editUser.role === "STUDENT" && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    value={editRollNumber}
                    onChange={(e) => setEditRollNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                >
                  {editSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                Reset Password
              </h3>
              <button
                onClick={() => setResetModalUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetSuccessCreds ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4" />
                    New Password Generated
                  </div>
                  <p className="text-xs text-slate-300">
                    A new 14-character temporary password was generated for {resetSuccessCreds.email}.
                  </p>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between font-mono text-sm text-amber-300">
                    <span>{resetSuccessCreds.temporaryPassword}</span>
                    <button
                      onClick={() => copyToClipboard(resetSuccessCreds.temporaryPassword || "")}
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition flex items-center gap-1 text-xs"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    The user will be required to change this password on next login.
                  </p>
                </div>

                <button
                  onClick={() => setResetModalUser(null)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">
                  Are you sure you want to generate a new temporary password for{" "}
                  <strong className="text-white">{resetModalUser.name}</strong> ({resetModalUser.email})?
                </p>
                <p className="text-[11px] text-slate-400">
                  Their previous password will be invalidated immediately, and they will be flagged to change their password on next sign-in.
                </p>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resettingPassword}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                  >
                    {resettingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Generate New Password
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                Delete User
              </h3>
              <button
                onClick={() => setDeleteModalUser(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteConflictMessage ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                    <AlertCircle className="w-4 h-4" />
                    Cannot Delete User
                  </div>
                  <p className="text-xs text-slate-300">{deleteConflictMessage}</p>
                  <p className="text-[11px] text-slate-400">
                    To maintain database integrity and audit logs, users with associated data cannot be hard deleted. You can deactivate this account instead.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setDeleteModalUser(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Close
                  </button>
                  <button
                    onClick={async () => {
                      if (deleteModalUser) {
                        await handleToggleStatus(deleteModalUser);
                        setDeleteModalUser(null);
                      }
                    }}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition"
                  >
                    Deactivate Account
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-300">
                  Are you sure you want to permanently delete{" "}
                  <strong className="text-white">{deleteModalUser.name}</strong> ({deleteModalUser.email})?
                </p>
                <p className="text-[11px] text-slate-400">
                  This operation is permanent. If this user has any enrollments, mentorship records, or teaching sessions, the deletion will be rejected.
                </p>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setDeleteModalUser(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteUser}
                    disabled={deletingUser}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2"
                  >
                    {deletingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Delete Permanently
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
