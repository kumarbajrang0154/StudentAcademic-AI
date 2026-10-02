"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  ArrowLeft,
  Plus,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Edit2,
  X,
} from "lucide-react";

interface AssessmentItem {
  id: string;
  title: string;
  type: string;
  maxScore: number;
  weight: number;
  dueDate: string | null;
}

interface StudentGradeRow {
  studentId: string;
  rollNumber: string;
  name: string;
  masteryScore: number;
  scores: Record<string, { score: number | null; gradedAt: string | null }>;
}

interface GradebookResponse {
  courseId: string;
  courseCode: string;
  courseName: string;
  assessments: AssessmentItem[];
  students: StudentGradeRow[];
}

export default function GradebookPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const courseId = params?.courseId as string;

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Score Entry state
  const [activeCell, setActiveCell] = useState<{
    student: StudentGradeRow;
    assessment: AssessmentItem;
    currentScore: number | null;
  } | null>(null);
  const [newScoreVal, setNewScoreVal] = useState<string>("");
  const [justificationVal, setJustificationVal] = useState<string>("");

  // Create Assessment form state
  const [assessmentTitle, setAssessmentTitle] = useState("");
  const [assessmentMaxScore, setAssessmentMaxScore] = useState<number>(100);
  const [assessmentWeight, setAssessmentWeight] = useState<number>(15);
  const [assessmentType, setAssessmentType] = useState("ASSIGNMENT");
  const [assessmentDueDate, setAssessmentDueDate] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch gradebook data
  const {
    data: gradebook,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["course-gradebook", courseId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/faculty/courses/${courseId}/gradebook`);
      if (!res.ok) {
        if (res.status === 403) throw new Error("403 Forbidden: You do not have permission to view this gradebook.");
        throw new Error("Failed to load gradebook");
      }
      return (await res.json()) as GradebookResponse;
    },
    enabled: Boolean(courseId),
  });

  // Calculate total existing weight
  const currentTotalWeight = gradebook?.assessments.reduce((acc, a) => acc + a.weight, 0) || 0;

  // Open Score edit modal
  const handleOpenScoreModal = (student: StudentGradeRow, assessment: AssessmentItem) => {
    const existing = student.scores[assessment.id]?.score;
    setActiveCell({
      student,
      assessment,
      currentScore: existing !== undefined ? existing : null,
    });
    setNewScoreVal(existing !== null && existing !== undefined ? String(existing) : "");
    setJustificationVal("");
    setIsScoreModalOpen(true);
  };

  // Submit single/batch score mutation
  const scoreMutation = useMutation({
    mutationFn: async () => {
      if (!activeCell) return;
      const numScore = parseFloat(newScoreVal);
      if (isNaN(numScore) || numScore < 0 || numScore > activeCell.assessment.maxScore) {
        throw new Error(`Score must be between 0 and ${activeCell.assessment.maxScore}`);
      }

      const isModifying =
        activeCell.currentScore !== null &&
        activeCell.currentScore !== undefined &&
        activeCell.currentScore !== numScore;

      if (isModifying && (!justificationVal || justificationVal.trim().length === 0)) {
        throw new Error("Justification is required when modifying an existing score");
      }

      const res = await apiFetch("/api/v1/marks/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId: activeCell.assessment.id,
          entries: [{ studentId: activeCell.student.studentId, score: numScore }],
          justification: isModifying ? justificationVal.trim() : undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        const errJson = JSON.parse(text);
        throw new Error(errJson.message || "Failed to save marks");
      }

      return res.json();
    },
    onSuccess: () => {
      setIsScoreModalOpen(false);
      setToastMessage({
        type: "success",
        text: `Score updated for ${activeCell?.student.name}!`,
      });
      queryClient.invalidateQueries({ queryKey: ["course-gradebook", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course-roster", courseId] });
      setTimeout(() => setToastMessage(null), 3500);
    },
    onError: (err: Error) => {
      setToastMessage({ type: "error", text: err.message });
      setTimeout(() => setToastMessage(null), 4500);
    },
  });

  // Create assessment mutation
  const createAssessmentMutation = useMutation({
    mutationFn: async () => {
      if (!assessmentTitle.trim()) {
        throw new Error("Title is required");
      }
      if (currentTotalWeight + assessmentWeight > 100) {
        throw new Error(
          `Weight exceeds 100%! Current total is ${currentTotalWeight}%, adding ${assessmentWeight}% would reach ${currentTotalWeight + assessmentWeight}%`,
        );
      }

      const res = await apiFetch("/api/v1/faculty/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          title: assessmentTitle.trim(),
          maxScore: assessmentMaxScore,
          weight: assessmentWeight,
          type: assessmentType,
          dueDate: assessmentDueDate ? new Date(assessmentDueDate).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        const errJson = JSON.parse(text);
        throw new Error(errJson.message || "Failed to create assessment");
      }

      return res.json();
    },
    onSuccess: () => {
      setIsCreateModalOpen(false);
      setAssessmentTitle("");
      setAssessmentWeight(10);
      setAssessmentDueDate("");
      setCreateError(null);
      setToastMessage({ type: "success", text: "New assessment created successfully!" });
      queryClient.invalidateQueries({ queryKey: ["course-gradebook", courseId] });
      setTimeout(() => setToastMessage(null), 3500);
    },
    onError: (err: Error) => {
      setCreateError(err.message);
    },
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/faculty/dashboard"
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition border border-slate-700/60"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-indigo-400">
                {gradebook?.courseCode || "Course"}
              </span>
              <span className="text-slate-500">•</span>
              <h1 className="text-xl font-bold text-white tracking-tight">Gradebook Matrix</h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {gradebook?.courseName || "Loading..."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] text-slate-400 block font-medium">Evaluated Weight</span>
            <span className="font-mono text-xs font-bold text-slate-200">
              {currentTotalWeight}% / 100%
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setIsCreateModalOpen(true);
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Assessment</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 transition ${
            toastMessage.type === "success"
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4 animate-pulse">
          <div className="h-6 bg-slate-800 rounded w-1/4" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 bg-slate-800/60 rounded" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="p-10 text-center bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="text-sm font-semibold text-rose-300">
            {error instanceof Error ? error.message : "Failed to load gradebook"}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Gradebook Matrix Table */}
      {!isLoading && !isError && gradebook && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4 w-28">Roll No</th>
                  <th className="py-3 px-4 min-w-[140px]">Student Name</th>
                  <th className="py-3 px-4 text-center w-24">Mastery %</th>
                  {gradebook.assessments.map((a) => (
                    <th key={a.id} className="py-3 px-4 text-center min-w-[130px]">
                      <div className="font-bold text-slate-200 truncate">{a.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono font-normal">
                        Max: {a.maxScore} • W: {a.weight}%
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans text-xs">
                {gradebook.students.map((student, idx) => (
                  <tr
                    key={student.studentId}
                    className={`transition ${
                      idx % 2 === 0
                        ? "bg-slate-900/30 hover:bg-slate-800/30"
                        : "bg-slate-900/60 hover:bg-slate-800/30"
                    }`}
                  >
                    <td className="py-2.5 px-4 text-center font-mono text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-300">
                      {student.rollNumber}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-white truncate">
                      {student.name}
                    </td>
                    <td className="py-2.5 px-4 text-center font-mono font-bold text-indigo-400">
                      {student.masteryScore}%
                    </td>

                    {/* Assessment score cells */}
                    {gradebook.assessments.map((a) => {
                      const scoreObj = student.scores[a.id];
                      const isPending = scoreObj?.score === null || scoreObj?.score === undefined;

                      return (
                        <td
                          key={a.id}
                          onClick={() => handleOpenScoreModal(student, a)}
                          className="py-2.5 px-4 text-center cursor-pointer group"
                        >
                          <div className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border transition group-hover:scale-105 border-slate-700/60 bg-slate-800/50 hover:border-indigo-500 hover:bg-indigo-600/10">
                            {isPending ? (
                              <span className="text-[11px] font-semibold text-amber-400/90 font-mono">
                                Pending
                              </span>
                            ) : (
                              <span className="font-mono font-bold text-slate-200">
                                {scoreObj.score}
                              </span>
                            )}
                            <Edit2 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition" />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Marks Dialog */}
      {isScoreModalOpen && activeCell && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-base">Enter / Edit Score</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeCell.student.name} ({activeCell.student.rollNumber})
                </p>
              </div>
              <button
                onClick={() => setIsScoreModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-300 font-medium mb-1">
                  <span>Assessment</span>
                  <span className="text-indigo-400 font-mono">
                    Max: {activeCell.assessment.maxScore} (Weight: {activeCell.assessment.weight}%)
                  </span>
                </div>
                <div className="px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-xs font-semibold text-slate-200">
                  {activeCell.assessment.title}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Score (0 - {activeCell.assessment.maxScore})
                </label>
                <input
                  type="number"
                  min={0}
                  max={activeCell.assessment.maxScore}
                  step="any"
                  value={newScoreVal}
                  onChange={(e) => setNewScoreVal(e.target.value)}
                  placeholder={`0 to ${activeCell.assessment.maxScore}`}
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Justification required if modifying existing score */}
              {activeCell.currentScore !== null &&
                activeCell.currentScore !== undefined &&
                parseFloat(newScoreVal) !== activeCell.currentScore && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Audit Justification Required</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      You are changing an existing score from{" "}
                      <strong className="text-white">{activeCell.currentScore}</strong> to{" "}
                      <strong className="text-white">{newScoreVal || "..."}</strong>. An AuditLog row will be written.
                    </p>
                    <textarea
                      rows={2}
                      value={justificationVal}
                      onChange={(e) => setJustificationVal(e.target.value)}
                      placeholder="e.g. Re-evaluation of question 2 calculation error"
                      required
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsScoreModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => scoreMutation.mutate()}
                disabled={scoreMutation.isPending}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-indigo-600/20 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {scoreMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Score</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Assessment Dialog */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-white text-base">Create New Assessment</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Available Weight:{" "}
                  <strong className="text-indigo-400">{100 - currentTotalWeight}%</strong>
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={assessmentTitle}
                  onChange={(e) => setAssessmentTitle(e.target.value)}
                  placeholder="e.g. Midterm Lab Exam"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Max Score
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={assessmentMaxScore}
                    onChange={(e) => setAssessmentMaxScore(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Weight (%)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100 - currentTotalWeight}
                    value={assessmentWeight}
                    onChange={(e) => setAssessmentWeight(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Type
                  </label>
                  <select
                    value={assessmentType}
                    onChange={(e) => setAssessmentType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ASSIGNMENT">Assignment</option>
                    <option value="QUIZ">Quiz</option>
                    <option value="EXAM">Exam</option>
                    <option value="LAB">Lab Assessment</option>
                    <option value="PROJECT">Project</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={assessmentDueDate}
                    onChange={(e) => setAssessmentDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createAssessmentMutation.mutate()}
                disabled={createAssessmentMutation.isPending}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-indigo-600/20 transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {createAssessmentMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Create Assessment</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
