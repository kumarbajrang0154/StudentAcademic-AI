import { prisma, Role, RiskCategory, AttendanceStatus, AssessmentType } from "@student-academic-ai/database";
import { AuthUser, canAccessCourse } from "../lib/rbac.js";
import {
  parseVoiceAttendance,
  parseVoiceMarks,
  RosterStudent,
} from "@student-academic-ai/core";
import { recomputeCourseEnrollments } from "./enrollment.service.js";

export interface FacultyCourseSummary {
  id: string;
  code: string;
  name: string;
  credits: number;
  departmentId: string;
  sessionCount: number;
  lastAttendanceDate: string | null;
  enrolledCount: number;
  classHealth: {
    critical: number;
    moderate: number;
    safe: number;
  };
}

export interface RosterItem {
  studentId: string;
  rollNumber: string;
  name: string;
  email: string;
  attendanceRate: number;
  masteryScore: number;
  riskCategory: RiskCategory;
}

export interface GradebookAssessment {
  id: string;
  title: string;
  type: string;
  maxScore: number;
  weight: number;
  dueDate: string | null;
}

export interface GradebookStudent {
  studentId: string;
  rollNumber: string;
  name: string;
  masteryScore: number;
  scores: Record<string, { score: number | null; gradedAt: string | null }>;
}

export interface GradebookResult {
  courseId: string;
  courseCode: string;
  courseName: string;
  assessments: GradebookAssessment[];
  students: GradebookStudent[];
}

export interface MenteeItem {
  studentId: string;
  rollNumber: string;
  name: string;
  email: string;
  aggregateAttendance: number;
  overallMastery: number;
  overallVelocity: number;
  highestRiskCategory: RiskCategory;
  courses: {
    courseId: string;
    courseCode: string;
    attendanceRate: number;
    masteryScore: number;
    riskCategory: RiskCategory;
  }[];
}

/**
 * Loads accessible courses with health counts, session count, and last attendance date.
 */
export async function getFacultyCourses(
  user: AuthUser,
): Promise<FacultyCourseSummary[]> {
  let whereClause = {};

  if (user.role === Role.ADMIN) {
    whereClause = {};
  } else if (user.role === Role.HOD) {
    whereClause = { departmentId: user.departmentId ?? "" };
  } else if (user.role === Role.FACULTY) {
    whereClause = {
      sessions: {
        some: { facultyId: user.id },
      },
    };
  } else {
    // MENTOR, STUDENT
    return [];
  }

  const courses = await prisma.course.findMany({
    where: whereClause,
    include: {
      enrollments: {
        select: {
          riskCategory: true,
        },
      },
      sessions: {
        orderBy: { sessionDate: "desc" },
        take: 1,
        select: { sessionDate: true },
      },
      _count: {
        select: { sessions: true, enrollments: true },
      },
    },
    orderBy: { code: "asc" },
  });

  return courses.map((c) => {
    let critical = 0;
    let moderate = 0;
    let safe = 0;

    for (const e of c.enrollments) {
      if (e.riskCategory === RiskCategory.CRITICAL) critical++;
      else if (e.riskCategory === RiskCategory.MODERATE) moderate++;
      else safe++;
    }

    const lastAttendanceDate =
      c.sessions[0]?.sessionDate ? c.sessions[0].sessionDate.toISOString() : null;

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      credits: c.credits,
      departmentId: c.departmentId,
      sessionCount: c._count.sessions,
      lastAttendanceDate,
      enrolledCount: c._count.enrollments,
      classHealth: {
        critical,
        moderate,
        safe,
      },
    };
  });
}

/**
 * Loads course roster with roll numbers and current academic metrics.
 */
export async function getCourseRoster(
  courseId: string,
  user: AuthUser,
): Promise<{
  courseId: string;
  courseCode: string;
  courseName: string;
  roster: RosterItem[];
}> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      sessions: {
        select: { facultyId: true },
      },
    },
  });

  if (!course) {
    const err = new Error("Course not found");
    (err as unknown as { statusCode: number }).statusCode = 404;
    throw err;
  }

  // Mentor can read roster if they have mentees or for view, but verify canAccessCourse or mentor
  const isMentorWithAccess = user.role === Role.MENTOR;
  if (!isMentorWithAccess && !canAccessCourse(user, course)) {
    const err = new Error("Forbidden: You do not have permission to access this course");
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { student: { email: "asc" } },
  });

  const roster: RosterItem[] = enrollments.map((e) => {
    const rollNumber = e.student.email.startsWith("student")
      ? `2026-CS-${e.student.email.slice(7, 9)}`
      : e.student.email.split("@")[0]!;

    return {
      studentId: e.student.id,
      rollNumber,
      name: e.student.name,
      email: e.student.email,
      attendanceRate: e.attendanceRate ?? 100,
      masteryScore: e.masteryScore ?? 0,
      riskCategory: e.riskCategory ?? RiskCategory.SAFE,
    };
  });

  return {
    courseId: course.id,
    courseCode: course.code,
    courseName: course.name,
    roster,
  };
}

/**
 * Loads students x assessments gradebook matrix.
 */
export async function getCourseGradebook(
  courseId: string,
  user: AuthUser,
): Promise<GradebookResult> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      sessions: {
        select: { facultyId: true },
      },
    },
  });

  if (!course) {
    const err = new Error("Course not found");
    (err as unknown as { statusCode: number }).statusCode = 404;
    throw err;
  }

  if (!canAccessCourse(user, course)) {
    const err = new Error("Forbidden: You do not have permission to access this course");
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  const assessments = await prisma.assessment.findMany({
    where: { courseId },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      title: true,
      type: true,
      maxScore: true,
      weight: true,
      dueDate: true,
    },
  });

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          studentScores: {
            where: {
              assessment: { courseId },
            },
            select: {
              assessmentId: true,
              score: true,
              gradedAt: true,
            },
          },
        },
      },
    },
    orderBy: { student: { email: "asc" } },
  });

  const students: GradebookStudent[] = enrollments.map((e) => {
    const rollNumber = e.student.email.startsWith("student")
      ? `2026-CS-${e.student.email.slice(7, 9)}`
      : e.student.email.split("@")[0]!;

    const scoresMap: Record<string, { score: number | null; gradedAt: string | null }> = {};
    for (const a of assessments) {
      const match = e.student.studentScores.find((s) => s.assessmentId === a.id);
      scoresMap[a.id] = {
        score: match ? match.score : null,
        gradedAt: match?.gradedAt ? match.gradedAt.toISOString() : null,
      };
    }

    return {
      studentId: e.student.id,
      rollNumber,
      name: e.student.name,
      masteryScore: e.masteryScore ?? 0,
      scores: scoresMap,
    };
  });

  return {
    courseId: course.id,
    courseCode: course.code,
    courseName: course.name,
    assessments: assessments.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      maxScore: a.maxScore,
      weight: a.weight,
      dueDate: a.dueDate ? a.dueDate.toISOString() : null,
    })),
    students,
  };
}

/**
 * Creates an assessment, strictly enforcing that total weight <= 100%.
 */
export async function createAssessment(
  courseId: string,
  data: {
    title: string;
    maxScore: number;
    weight: number;
    type?: AssessmentType;
    dueDate?: Date;
  },
  user: AuthUser,
) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      sessions: {
        select: { facultyId: true },
      },
    },
  });

  if (!course) {
    const err = new Error("Course not found");
    (err as unknown as { statusCode: number }).statusCode = 404;
    throw err;
  }

  if (!canAccessCourse(user, course)) {
    const err = new Error("Forbidden: You do not have permission to modify this course");
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  // Calculate current sum of weights
  const existing = await prisma.assessment.aggregate({
    where: { courseId },
    _sum: { weight: true },
  });

  const currentTotal = existing._sum.weight ?? 0;
  if (currentTotal + data.weight > 100) {
    const err = new Error(
      `Assessment weight sum cannot exceed 100% (currently ${currentTotal}%, adding ${data.weight}% would be ${currentTotal + data.weight}%)`,
    );
    (err as unknown as { statusCode: number }).statusCode = 400;
    throw err;
  }

  return prisma.assessment.create({
    data: {
      courseId,
      title: data.title,
      maxScore: data.maxScore,
      weight: data.weight,
      type: data.type ?? AssessmentType.ASSIGNMENT,
      dueDate: data.dueDate,
    },
  });
}

/**
 * Loads assigned mentees for a mentor user.
 */
export async function getMentorMentees(user: AuthUser): Promise<MenteeItem[]> {
  let whereStudent = {};

  if (user.role === Role.MENTOR) {
    const assignments = await prisma.mentorAssignment.findMany({
      where: { mentorId: user.id, active: true },
      select: { studentId: true },
    });
    whereStudent = { id: { in: assignments.map((a) => a.studentId) } };
  } else if (user.role === Role.HOD) {
    whereStudent = { departmentId: user.departmentId ?? "" };
  } else if (user.role === Role.ADMIN) {
    whereStudent = {};
  } else {
    return [];
  }

  const students = await prisma.user.findMany({
    where: {
      role: Role.STUDENT,
      ...whereStudent,
    },
    include: {
      enrollments: {
        include: {
          course: {
            select: { id: true, code: true, name: true },
          },
        },
      },
    },
    orderBy: { email: "asc" },
  });

  return students.map((s) => {
    const rollNumber = s.email.startsWith("student")
      ? `2026-CS-${s.email.slice(7, 9)}`
      : s.email.split("@")[0]!;

    let totalAttendance = 0;
    let totalMastery = 0;
    let totalVelocity = 0;
    let count = 0;
    let highestRisk: RiskCategory = RiskCategory.SAFE;

    const courses = s.enrollments.map((e) => {
      const att = e.attendanceRate ?? 100;
      const mast = e.masteryScore ?? 0;
      const vel = e.velocity ?? 0;
      const risk = e.riskCategory ?? RiskCategory.SAFE;

      totalAttendance += att;
      totalMastery += mast;
      totalVelocity += vel;
      count++;

      if (risk === RiskCategory.CRITICAL) {
        highestRisk = RiskCategory.CRITICAL;
      } else if (risk === RiskCategory.MODERATE && highestRisk !== RiskCategory.CRITICAL) {
        highestRisk = RiskCategory.MODERATE;
      }

      return {
        courseId: e.course.id,
        courseCode: e.course.code,
        attendanceRate: att,
        masteryScore: mast,
        riskCategory: risk,
      };
    });

    const aggregateAttendance = count > 0 ? Math.round((totalAttendance / count) * 10) / 10 : 100;
    const overallMastery = count > 0 ? Math.round((totalMastery / count) * 10) / 10 : 0;
    const overallVelocity = count > 0 ? Math.round((totalVelocity / count) * 1000) / 1000 : 0;

    return {
      studentId: s.id,
      rollNumber,
      name: s.name,
      email: s.email,
      aggregateAttendance,
      overallMastery,
      overallVelocity,
      highestRiskCategory: highestRisk,
      courses,
    };
  });
}

/**
 * Wraps core voice parser against course roster.
 */
export async function parseFacultyVoice(
  transcript: string,
  courseId: string,
  mode: "ATTENDANCE" | "MARKS",
  speechConfidence: number = 1.0,
  maxScore: number = 100,
) {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    include: {
      student: { select: { id: true, email: true, name: true } },
    },
  });

  const roster: RosterStudent[] = enrollments.map((e) => ({
    id: e.student.id,
    rollNumber: e.student.email.startsWith("student")
      ? `2026-CS-${e.student.email.slice(7, 9)}`
      : e.student.email.split("@")[0]!,
    name: e.student.name,
  }));

  if (mode === "ATTENDANCE") {
    return parseVoiceAttendance(transcript, roster, speechConfidence);
  } else {
    return parseVoiceMarks(transcript, roster, maxScore, speechConfidence);
  }
}

/**
 * Bulk attendance submission:
 * - Validates duplicate students and roster enrollment
 * - Creates ClassSession if missing
 * - Upserts AttendanceRecord in ONE transaction
 * - Recomputes course enrollments in bulk AFTER commit
 */
export async function recordAttendanceBatch(
  courseId: string,
  sessionDate: Date | string,
  entries: { studentId: string; status: AttendanceStatus; remarks?: string }[],
  user: AuthUser,
) {
  // 1. RBAC & Scope
  if (user.role === Role.STUDENT || user.role === Role.MENTOR) {
    const err = new Error("Forbidden: Mentors and students cannot record attendance");
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { sessions: { select: { facultyId: true } } },
  });

  if (!course) {
    const err = new Error("Course not found");
    (err as unknown as { statusCode: number }).statusCode = 404;
    throw err;
  }

  if (!canAccessCourse(user, course)) {
    const err = new Error("Forbidden: You do not have permission to record attendance for this course");
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  // 2. Validate duplicates
  const seenStudents = new Set<string>();
  for (const entry of entries) {
    if (seenStudents.has(entry.studentId)) {
      const err = new Error(`Duplicate student entry in batch: ${entry.studentId}`);
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }
    seenStudents.add(entry.studentId);
  }

  // 3. Validate roster enrollment
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    select: { studentId: true },
  });
  const enrolledStudentIds = new Set(enrollments.map((e) => e.studentId));

  for (const entry of entries) {
    if (!enrolledStudentIds.has(entry.studentId)) {
      const err = new Error(`Student ${entry.studentId} is not enrolled in this course`);
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }
  }

  // 4. Find or create ClassSession for sessionDate
  const parsedDate = typeof sessionDate === "string" ? new Date(sessionDate) : sessionDate;
  const startOfDay = new Date(parsedDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(parsedDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  let session = await prisma.classSession.findFirst({
    where: {
      courseId,
      sessionDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  if (!session) {
    session = await prisma.classSession.create({
      data: {
        courseId,
        facultyId: user.id,
        sessionDate: parsedDate,
        topic: "Regular Lecture",
      },
    });
  }

  // 5. Bulk upsert AttendanceRecords in ONE transaction
  let present = 0;
  let absent = 0;
  let onDuty = 0;
  let medicalLeave = 0;

  const ops = entries.map((entry) => {
    if (entry.status === AttendanceStatus.PRESENT) present++;
    else if (entry.status === AttendanceStatus.ABSENT) absent++;
    else if (entry.status === AttendanceStatus.ON_DUTY) onDuty++;
    else if (entry.status === AttendanceStatus.MEDICAL_LEAVE) medicalLeave++;

    return prisma.attendanceRecord.upsert({
      where: {
        sessionId_studentId: {
          sessionId: session!.id,
          studentId: entry.studentId,
        },
      },
      create: {
        sessionId: session!.id,
        studentId: entry.studentId,
        status: entry.status,
        remarks: entry.remarks,
      },
      update: {
        status: entry.status,
        remarks: entry.remarks,
      },
    });
  });

  await prisma.$transaction(ops);

  // 6. Bulk recompute CourseEnrollments after commit
  const studentIds = entries.map((e) => e.studentId);
  await recomputeCourseEnrollments(courseId, studentIds);

  return {
    processed: entries.length,
    counts: {
      present,
      absent,
      onDuty,
      medicalLeave,
    },
    sessionId: session.id,
  };
}

/**
 * Bulk marks submission:
 * - 0 <= score <= maxScore validation
 * - Justification required if modifying an already saved score
 * - AuditLog row written for each modified score
 * - QuestionScore consistency: marks entry updates StudentScore total
 * - Recomputes course enrollments in bulk AFTER commit
 */
export async function recordMarksBatch(
  assessmentId: string,
  entries: { studentId: string; score: number }[],
  justification: string | undefined,
  user: AuthUser,
) {
  // 1. RBAC & Scope
  if (user.role === Role.STUDENT || user.role === Role.MENTOR) {
    const err = new Error("Forbidden: Mentors and students cannot record marks");
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      course: {
        include: { sessions: { select: { facultyId: true } } },
      },
      scores: true,
    },
  });

  if (!assessment) {
    const err = new Error("Assessment not found");
    (err as unknown as { statusCode: number }).statusCode = 404;
    throw err;
  }

  if (!canAccessCourse(user, assessment.course)) {
    const err = new Error("Forbidden: You do not have permission to record marks for this course");
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  // 2. Validate entries
  const seenStudents = new Set<string>();
  for (const entry of entries) {
    if (seenStudents.has(entry.studentId)) {
      const err = new Error(`Duplicate student entry in marks batch: ${entry.studentId}`);
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }
    seenStudents.add(entry.studentId);

    if (entry.score < 0 || entry.score > assessment.maxScore) {
      const err = new Error(
        `Score ${entry.score} is out of range (0 to ${assessment.maxScore}) for student ${entry.studentId}`,
      );
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }
  }

  // 3. Validate roster enrollment
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId: assessment.courseId },
    select: { studentId: true },
  });
  const enrolledStudentIds = new Set(enrollments.map((e) => e.studentId));

  for (const entry of entries) {
    if (!enrolledStudentIds.has(entry.studentId)) {
      const err = new Error(`Student ${entry.studentId} is not enrolled in this course`);
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }
  }

  // 4. Check for modified existing scores
  const existingScoresMap = new Map<string, { id: string; score: number }>();
  for (const s of assessment.scores) {
    existingScoresMap.set(s.studentId, { id: s.id, score: s.score });
  }

  const modifications: {
    scoreId: string;
    studentId: string;
    previousScore: number;
    newScore: number;
  }[] = [];

  for (const entry of entries) {
    const existing = existingScoresMap.get(entry.studentId);
    if (existing && existing.score !== entry.score) {
      modifications.push({
        scoreId: existing.id,
        studentId: entry.studentId,
        previousScore: existing.score,
        newScore: entry.score,
      });
    }
  }

  if (modifications.length > 0 && (!justification || justification.trim().length === 0)) {
    const err = new Error(
      "Justification is required when modifying existing marks",
    );
    (err as unknown as { statusCode: number }).statusCode = 400;
    throw err;
  }

  // 5. Transaction: upsert StudentScore + write AuditLog rows
  const ops = [];

  for (const entry of entries) {
    ops.push(
      prisma.studentScore.upsert({
        where: {
          assessmentId_studentId: {
            assessmentId,
            studentId: entry.studentId,
          },
        },
        create: {
          assessmentId,
          studentId: entry.studentId,
          score: entry.score,
          gradedAt: new Date(),
        },
        update: {
          score: entry.score,
          gradedAt: new Date(),
        },
      }),
    );
  }

  for (const mod of modifications) {
    ops.push(
      prisma.auditLog.create({
        data: {
          entity: "StudentScore",
          entityId: mod.scoreId,
          previousValue: { score: mod.previousScore },
          newValue: { score: mod.newScore },
          modifiedById: user.id,
          justification: justification!.trim(),
        },
      }),
    );
  }

  await prisma.$transaction(ops);

  // 6. Bulk recompute CourseEnrollments after commit
  const studentIds = entries.map((e) => e.studentId);
  await recomputeCourseEnrollments(assessment.courseId, studentIds);

  return {
    processed: entries.length,
    modifiedCount: modifications.length,
    assessmentId,
    courseId: assessment.courseId,
  };
}
