"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { StudentShell } from "@/components/student/student-shell";
import { RiskBadge, RiskLevel } from "@/components/student/risk-badge";
import { RiskModal } from "@/components/student/risk-modal";
import {
  HelpCircle,
  X,
  Clock,
  Layers,
  ChevronRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface CourseListItem {
  courseId: string;
  courseCode: string;
  courseName: string;
  facultyName: string;
  credits: number;
  riskScore: number;
  riskCategory: RiskLevel;
  masteryScore: number;
  attendanceRate: number;
  velocity: number;
}

interface AssessmentItem {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  maxScore: number;
  weight: number;
  rawScore: number | null;
  normalizedScore: number | null;
  status: "EVALUATED" | "Awaiting Evaluation" | string;
  questionCount: number;
}

interface ScoreHistoryPoint {
  assessmentId: string;
  title: string;
  type: string;
  dueDate: string;
  rawScore: number;
  maxScore: number;
  normalizedScore: number;
  weight: number;
}

interface CourseDetailResponse {
  course: {
    id: string;
    code: string;
    name: string;
    credits: number;
    semester: string;
    faculty: { id: string; name: string; email: string } | null;
    units: { id: string; unitNumber: number; title: string; description?: string }[];
  };
  metrics: {
    attendanceRate: number;
    masteryScore: number;
    velocity: number;
    submissionDeficit: number;
    riskScore: number;
    riskCategory: RiskLevel;
  };
  assessmentBreakdown: AssessmentItem[];
  scoreHistory: ScoreHistoryPoint[];
}

function StudentSubjectsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const initialCourseId = searchParams.get("courseId");

  const [selectedDrawerCourseId, setSelectedDrawerCourseId] = useState<string | null>(
    initialCourseId || null,
  );
  const [selectedRiskCourse, setSelectedRiskCourse] = useState<{
    courseId: string;
    riskCategory: string;
  } | null>(null);

  // 1. Fetch Overview courses
  const {
    data: overviewData,
    isLoading: isOverviewLoading,
    refetch: refetchOverview,
  } = useQuery<{ courses: CourseListItem[] }>({
    queryKey: ["student-overview"],
    queryFn: async () => {
      const res = await apiFetch("/api/v1/student/overview");
      if (!res.ok) throw new Error("Failed to load enrolled courses");
      return res.json();
    },
  });

  // 2. Fetch Selected Course Detail when drawer is opened
  const {
    data: courseDetail,
    isLoading: isDetailLoading,
    error: detailError,
  } = useQuery<CourseDetailResponse>({
    queryKey: ["student-course-detail", selectedDrawerCourseId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/student/courses/${selectedDrawerCourseId}`);
      if (!res.ok) throw new Error("Failed to load course details");
      return res.json();
    },
    enabled: !!selectedDrawerCourseId,
  });

  // Handle escape to close drawer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedDrawerCourseId) {
        setSelectedDrawerCourseId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDrawerCourseId]);

  return (
    <StudentShell>
      {/* Risk Modal */}
      {selectedRiskCourse && (
        <RiskModal
          isOpen={!!selectedRiskCourse}
          onClose={() => setSelectedRiskCourse(null)}
          studentId={user?.id || ""}
          courseId={selectedRiskCourse.courseId}
          persistedRiskCategory={selectedRiskCourse.riskCategory}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Academics &amp; Enrolled Subjects
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Course curriculum, weighted assessment breakdowns, and longitudinal mastery trajectories.
          </p>
        </div>

        <button
          onClick={() => refetchOverview()}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          <span>Sync Courses</span>
        </button>
      </div>

      {/* Course List Grid */}
      {isOverviewLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-60 rounded-2xl bg-slate-900/60 border border-slate-800 animate-shimmer"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {overviewData?.courses.map((course) => {
            const isAmberOrRed =
              course.riskCategory === "CRITICAL" || course.riskCategory === "MODERATE";

            return (
              <div
                key={course.courseId}
                className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-md shadow-lg shadow-black/20 flex flex-col justify-between hover:border-slate-700/60 transition group cursor-pointer"
                onClick={() => setSelectedDrawerCourseId(course.courseId)}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded-md bg-slate-800 text-indigo-300 border border-slate-700">
                      {course.courseCode}
                    </span>
                    <RiskBadge category={course.riskCategory} size="sm" />
                  </div>

                  <h3 className="font-bold text-base text-white tracking-tight group-hover:text-indigo-300 transition-colors mb-1 line-clamp-1">
                    {course.courseName}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Instructor: {course.facultyName} • {course.credits} Credits
                  </p>

                  {/* Mastery Progress Bar */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Mastery Score</span>
                      <span className="font-mono font-bold text-white">
                        {course.masteryScore.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          course.masteryScore >= 75
                            ? "bg-emerald-500"
                            : course.masteryScore >= 50
                              ? "bg-indigo-500"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, course.masteryScore))}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Attendance</span>
                      <span
                        className={`font-mono font-semibold ${
                          course.attendanceRate >= 75 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {course.attendanceRate.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Velocity</span>
                      <span
                        className={`font-mono font-semibold ${
                          course.velocity >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {course.velocity >= 0 ? `+${course.velocity.toFixed(2)}` : course.velocity.toFixed(2)}%/d
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs text-indigo-400 group-hover:text-indigo-300 flex items-center gap-1 font-semibold">
                    View Syllabus &amp; Scores <ChevronRight className="w-3.5 h-3.5" />
                  </span>

                  {isAmberOrRed && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRiskCourse({
                          courseId: course.courseId,
                          riskCategory: course.riskCategory,
                        });
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 transition"
                    >
                      <HelpCircle className="w-3 h-3 text-rose-400" />
                      <span>Why at risk?</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-over Drawer for Course Detail */}
      {selectedDrawerCourseId && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedDrawerCourseId(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col text-slate-100">
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-950/50">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                      {courseDetail?.course.code || "Course"}
                    </span>
                    {courseDetail && (
                      <RiskBadge category={courseDetail.metrics.riskCategory} size="sm" />
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    {courseDetail?.course.name || "Loading Course Details..."}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {courseDetail?.course.credits} Credits • {courseDetail?.course.semester} • Instructor:{" "}
                    {courseDetail?.course.faculty?.name || "Faculty Member"}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedDrawerCourseId(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {isDetailLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <p className="text-sm">Loading assessment breakdown &amp; syllabus...</p>
                  </div>
                ) : detailError ? (
                  <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                    <p className="text-sm text-rose-300">Failed to load course details</p>
                  </div>
                ) : courseDetail ? (
                  <>
                    {/* Metrics Row */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[11px] text-slate-400">Mastery</span>
                        <p className="text-xl font-mono font-bold text-white mt-0.5">
                          {courseDetail.metrics.masteryScore.toFixed(1)}%
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[11px] text-slate-400">Attendance</span>
                        <p className="text-xl font-mono font-bold text-emerald-400 mt-0.5">
                          {courseDetail.metrics.attendanceRate.toFixed(1)}%
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[11px] text-slate-400">Trajectory</span>
                        <p
                          className={`text-xl font-mono font-bold mt-0.5 ${
                            courseDetail.metrics.velocity >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {courseDetail.metrics.velocity >= 0 ? "+" : ""}
                          {courseDetail.metrics.velocity.toFixed(2)}%/d
                        </p>
                      </div>
                    </div>

                    {/* Why am I at risk action if Amber/Red */}
                    {(courseDetail.metrics.riskCategory === "CRITICAL" ||
                      courseDetail.metrics.riskCategory === "MODERATE") && (
                      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-semibold text-rose-300">
                            Academic Attention Required
                          </h4>
                          <p className="text-[11px] text-rose-200/80 mt-0.5">
                            This course is currently flagged as {courseDetail.metrics.riskCategory}.
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            setSelectedRiskCourse({
                              courseId: courseDetail.course.id,
                              riskCategory: courseDetail.metrics.riskCategory,
                            })
                          }
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition flex items-center gap-1.5 shadow-md shadow-rose-950"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Why am I at risk?</span>
                        </button>
                      </div>
                    )}

                    {/* Score History Chart */}
                    {courseDetail.scoreHistory.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                            Assessment Score History
                          </h3>
                          <span className="text-[11px] font-mono text-slate-500">
                            Evaluated Tasks
                          </span>
                        </div>
                        <div className="h-48 w-full bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={courseDetail.scoreHistory}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                              <XAxis dataKey="title" stroke="#64748B" fontSize={10} />
                              <YAxis domain={[0, 100]} stroke="#64748B" fontSize={10} unit="%" />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length && payload[0]) {
                                    const item = payload[0].payload as ScoreHistoryPoint;
                                    return (
                                      <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg shadow-xl text-xs">
                                        <p className="font-semibold text-white">{item.title}</p>
                                        <p className="text-[11px] text-slate-400">
                                          Score: {item.rawScore}/{item.maxScore} (
                                          <span className="text-indigo-400 font-mono">
                                            {item.normalizedScore}%
                                          </span>
                                          )
                                        </p>
                                        <p className="text-[10px] text-slate-500">Weight: {item.weight}%</p>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="normalizedScore"
                                stroke="#4F46E5"
                                strokeWidth={2.5}
                                dot={{ fill: "#6366F1", r: 4 }}
                                activeDot={{ r: 6 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Assessment Breakdown List */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Assessment Breakdown
                      </h3>
                      <div className="space-y-3">
                        {courseDetail.assessmentBreakdown.map((assessment) => {
                          const isEvaluated = assessment.status === "EVALUATED";
                          const dueDateFormatted = assessment.dueDate
                            ? new Date(assessment.dueDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "TBD";

                          return (
                            <div
                              key={assessment.id}
                              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2.5"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-xs font-semibold text-white block">
                                    {assessment.title}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {assessment.type} • Weight: {assessment.weight}% • Due: {dueDateFormatted}
                                  </span>
                                </div>

                                {isEvaluated ? (
                                  <div className="text-right">
                                    <span className="font-mono font-bold text-sm text-emerald-400">
                                      {assessment.rawScore} / {assessment.maxScore}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400 block">
                                      ({assessment.normalizedScore?.toFixed(1)}%)
                                    </span>
                                  </div>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Awaiting Evaluation
                                  </span>
                                )}
                              </div>

                              {/* Progress bar: solid for evaluated, dashed for awaiting evaluation */}
                              {isEvaluated ? (
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      (assessment.normalizedScore ?? 0) >= 75
                                        ? "bg-emerald-500"
                                        : (assessment.normalizedScore ?? 0) >= 50
                                          ? "bg-indigo-500"
                                          : "bg-rose-500"
                                    }`}
                                    style={{
                                      width: `${Math.min(100, Math.max(0, assessment.normalizedScore ?? 0))}%`,
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-full h-1.5 border-t-2 border-dashed border-slate-700/80" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Unit List */}
                    {courseDetail.course.units.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-indigo-400" />
                          Curriculum Syllabus Units
                        </h3>
                        <div className="space-y-2">
                          {courseDetail.course.units.map((unit) => (
                            <div
                              key={unit.id}
                              className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 flex items-start gap-3"
                            >
                              <span className="w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-300 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                                {unit.unitNumber}
                              </span>
                              <div>
                                <h4 className="text-xs font-semibold text-white">{unit.title}</h4>
                                {unit.description && (
                                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                                    {unit.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </StudentShell>
  );
}

export default function StudentSubjectsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-white">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      }
    >
      <StudentSubjectsContent />
    </Suspense>
  );
}
