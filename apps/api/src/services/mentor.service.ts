import {
  prisma,
  Role,
  RiskCategory,
  InterventionStatus,
  Prisma,
} from "@student-academic-ai/database";
import { AuthUser } from "../lib/rbac.js";
import {
  findInterventionSlot,
  INTERVENTION_DURATION_MIN,
  velocityBand,
  explainRisk,
  academicMetricsToRiskInputs,
} from "@student-academic-ai/core";

export interface MentorOverviewStats {
  countsByRisk: {
    critical: number;
    moderate: number;
    safe: number;
  };
  needsAttention: {
    studentId: string;
    rollNumber: string;
    name: string;
    email: string;
    worstRiskCategory: RiskCategory;
    reasons: string[];
    attendanceRate: number;
    masteryScore: number;
    velocity: number;
  }[];
  avgAttendance: number;
  avgMastery: number;
  upcomingInterventionsCount: number;
  unreadNotificationsCount: number;
}

export interface MenteeListItem {
  studentId: string;
  rollNumber: string;
  name: string;
  email: string;
  overallAttendance: number;
  mastery: number;
  worstRiskCategory: RiskCategory;
  coursesAtRiskCount: number;
  velocityBand: string;
  lastInterventionDate: string | null;
}

export interface MenteeCourseDetail {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  attendanceRate: number;
  masteryScore: number;
  velocity: number;
  riskCategory: RiskCategory;
  riskScore: number;
}

export interface MenteeDetailView {
  student: {
    id: string;
    name: string;
    email: string;
    rollNumber: string;
    guardianConsent: {
      consentGiven: boolean;
      consentAt: string | null;
    } | null;
  };
  courses: MenteeCourseDetail[];
  sparkline: { date: string; score: number }[];
  topRiskDrivers: { factor: string; impact: number; explanation: string }[];
  overrideReason: string | null;
  weakTopics: { topic: string; accuracy: number; failureCount: number }[];
  interventions: {
    id: string;
    title: string;
    status: InterventionStatus;
    scheduledAt: string | null;
    durationMin: number;
    notes: string | null;
    actionItems: unknown;
    preScoreAvg: number | null;
    postScoreAvg: number | null;
  }[];
  notes: {
    id: string;
    body: string;
    createdAt: string;
    mentorName: string;
  }[];
}

/**
 * 1. GET /api/v1/mentor/overview
 */
export async function getMentorOverview(user: AuthUser): Promise<MentorOverviewStats> {
  const isMentor = user.role === Role.MENTOR;

  // Active mentee assignments for this mentor (or all for admin)
  const assignments = await prisma.mentorAssignment.findMany({
    where: {
      ...(isMentor ? { mentorId: user.id } : {}),
      active: true,
    },
    select: { studentId: true },
  });

  const menteeStudentIds = Array.from(new Set(assignments.map((a) => a.studentId)));

  if (menteeStudentIds.length === 0) {
    return {
      countsByRisk: { critical: 0, moderate: 0, safe: 0 },
      needsAttention: [],
      avgAttendance: 0,
      avgMastery: 0,
      upcomingInterventionsCount: 0,
      unreadNotificationsCount: 0,
    };
  }

  // Bulk load enrollments, students, upcoming interventions, and notifications in parallel
  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [enrollments, students, upcomingInterventions, unreadNotificationsCount] =
    await Promise.all([
      prisma.courseEnrollment.findMany({
        where: { studentId: { in: menteeStudentIds } },
        select: {
          studentId: true,
          attendanceRate: true,
          masteryScore: true,
          velocity: true,
          riskCategory: true,
        },
      }),
      prisma.user.findMany({
        where: { id: { in: menteeStudentIds } },
        select: { id: true, name: true, email: true },
      }),
      prisma.intervention.count({
        where: {
          ...(isMentor ? { mentorId: user.id } : {}),
          status: InterventionStatus.SCHEDULED,
          OR: [
            { scheduledAt: { gte: now, lte: next7Days } },
            { scheduledFor: { gte: now, lte: next7Days } },
          ],
        },
      }),
      prisma.notification.count({
        where: {
          userId: user.id,
          readAt: null,
        },
      }),
    ]);

  // Aggregate per mentee
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const menteeGroups = new Map<string, typeof enrollments>();

  for (const enr of enrollments) {
    const list = menteeGroups.get(enr.studentId) ?? [];
    list.push(enr);
    menteeGroups.set(enr.studentId, list);
  }

  let totalAttendanceSum = 0;
  let totalMasterySum = 0;
  let studentCount = 0;

  const countsByRisk = { critical: 0, moderate: 0, safe: 0 };
  const needsAttention: MentorOverviewStats["needsAttention"] = [];

  for (const studentId of menteeStudentIds) {
    const enrs = menteeGroups.get(studentId) ?? [];
    const studentInfo = studentMap.get(studentId);
    if (!studentInfo) continue;

    studentCount++;

    // Calculate aggregated student metrics across courses
    const attList = enrs.map((e) => e.attendanceRate ?? 0);
    const masteryList = enrs.map((e) => e.masteryScore ?? 0);
    const velList = enrs.map((e) => e.velocity ?? 0);

    const avgAtt = attList.length ? attList.reduce((a, b) => a + b, 0) / attList.length : 0;
    const avgMst = masteryList.length
      ? masteryList.reduce((a, b) => a + b, 0) / masteryList.length
      : 0;
    const worstVel = velList.length ? Math.min(...velList) : 0;

    totalAttendanceSum += avgAtt;
    totalMasterySum += avgMst;

    // Worst risk category
    let worstRisk: RiskCategory = RiskCategory.SAFE;
    const criticalCourses = enrs.filter((e) => e.riskCategory === RiskCategory.CRITICAL);
    const moderateCourses = enrs.filter((e) => e.riskCategory === RiskCategory.MODERATE);

    if (criticalCourses.length > 0) {
      worstRisk = RiskCategory.CRITICAL;
      countsByRisk.critical++;
    } else if (moderateCourses.length > 0) {
      worstRisk = RiskCategory.MODERATE;
      countsByRisk.moderate++;
    } else {
      countsByRisk.safe++;
    }

    // Reason chips: Critical in >= 1 course OR velocity <= -1.5 OR attendance < 75
    const reasons: string[] = [];
    if (criticalCourses.length > 0) {
      reasons.push(
        criticalCourses.length === 1
          ? "Critical in 1 course"
          : `Critical in ${criticalCourses.length} courses`,
      );
    }
    if (avgAtt < 75) {
      reasons.push(`Attendance ${Math.round(avgAtt * 10) / 10}%`);
    }
    if (worstVel <= -1.5) {
      reasons.push(`Velocity ${Math.round(worstVel * 10) / 10}%/day`);
    }

    if (reasons.length > 0) {
      const match = studentInfo.email.match(/^student(\d+)@/);
      const rollNumber = match ? `2026-CS-${match[1]}` : "CS-STUDENT";

      needsAttention.push({
        studentId,
        rollNumber,
        name: studentInfo.name,
        email: studentInfo.email,
        worstRiskCategory: worstRisk,
        reasons,
        attendanceRate: Math.round(avgAtt * 10) / 10,
        masteryScore: Math.round(avgMst * 10) / 10,
        velocity: Math.round(worstVel * 100) / 100,
      });
    }
  }

  // Sort needsAttention: Critical worst risk first, then by attendance asc
  needsAttention.sort((a, b) => {
    const riskRank = { CRITICAL: 3, MODERATE: 2, SAFE: 1 };
    const diff = (riskRank[b.worstRiskCategory] ?? 0) - (riskRank[a.worstRiskCategory] ?? 0);
    if (diff !== 0) return diff;
    return a.attendanceRate - b.attendanceRate;
  });

  return {
    countsByRisk,
    needsAttention,
    avgAttendance: studentCount ? Math.round((totalAttendanceSum / studentCount) * 10) / 10 : 0,
    avgMastery: studentCount ? Math.round((totalMasterySum / studentCount) * 10) / 10 : 0,
    upcomingInterventionsCount: upcomingInterventions,
    unreadNotificationsCount,
  };
}

/**
 * 2. GET /api/v1/mentor/mentees
 */
export async function getMentorMenteesList(
  user: AuthUser,
  filters: { search?: string; risk?: string; sort?: string } = {},
): Promise<MenteeListItem[]> {
  const isMentor = user.role === Role.MENTOR;

  const assignments = await prisma.mentorAssignment.findMany({
    where: {
      ...(isMentor ? { mentorId: user.id } : {}),
      active: true,
    },
    select: { studentId: true },
  });

  const studentIds = Array.from(new Set(assignments.map((a) => a.studentId)));
  if (studentIds.length === 0) return [];

  const [students, enrollments, interventions] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.courseEnrollment.findMany({
      where: { studentId: { in: studentIds } },
      select: {
        studentId: true,
        attendanceRate: true,
        masteryScore: true,
        velocity: true,
        riskCategory: true,
      },
    }),
    prisma.intervention.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, scheduledAt: true, scheduledFor: true },
      orderBy: { scheduledFor: "desc" },
    }),
  ]);

  const enrsByStudent = new Map<string, typeof enrollments>();
  for (const enr of enrollments) {
    const list = enrsByStudent.get(enr.studentId) ?? [];
    list.push(enr);
    enrsByStudent.set(enr.studentId, list);
  }

  const latestInterventionMap = new Map<string, string>();
  for (const intv of interventions) {
    if (!latestInterventionMap.has(intv.studentId)) {
      const d = intv.scheduledAt || intv.scheduledFor;
      latestInterventionMap.set(intv.studentId, d ? d.toISOString() : "");
    }
  }

  const items: MenteeListItem[] = [];

  for (const s of students) {
    const enrs = enrsByStudent.get(s.id) ?? [];
    const attList = enrs.map((e) => e.attendanceRate ?? 0);
    const mstList = enrs.map((e) => e.masteryScore ?? 0);
    const velList = enrs.map((e) => e.velocity ?? 0);

    const overallAttendance = attList.length
      ? Math.round((attList.reduce((a, b) => a + b, 0) / attList.length) * 10) / 10
      : 0;
    const mastery = mstList.length
      ? Math.round((mstList.reduce((a, b) => a + b, 0) / mstList.length) * 10) / 10
      : 0;
    const avgVel = velList.length ? velList.reduce((a, b) => a + b, 0) / velList.length : 0;

    const criticalCoursesCount = enrs.filter((e) => e.riskCategory === RiskCategory.CRITICAL).length;
    const moderateCoursesCount = enrs.filter((e) => e.riskCategory === RiskCategory.MODERATE).length;

    let worstRiskCategory: RiskCategory = RiskCategory.SAFE;
    if (criticalCoursesCount > 0) worstRiskCategory = RiskCategory.CRITICAL;
    else if (moderateCoursesCount > 0) worstRiskCategory = RiskCategory.MODERATE;

    const match = s.email.match(/^student(\d+)@/);
    const rollNumber = match ? `2026-CS-${match[1]}` : "CS-STUDENT";

    items.push({
      studentId: s.id,
      rollNumber,
      name: s.name,
      email: s.email,
      overallAttendance,
      mastery,
      worstRiskCategory,
      coursesAtRiskCount: criticalCoursesCount + moderateCoursesCount,
      velocityBand: velocityBand(avgVel),
      lastInterventionDate: latestInterventionMap.get(s.id) || null,
    });
  }

  // Filter search
  let result = items;
  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    result = result.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.rollNumber.toLowerCase().includes(q),
    );
  }

  // Filter risk
  if (filters.risk && filters.risk !== "ALL") {
    result = result.filter((m) => m.worstRiskCategory === filters.risk);
  }

  // Sort
  if (filters.sort === "attendance") {
    result.sort((a, b) => a.overallAttendance - b.overallAttendance);
  } else if (filters.sort === "mastery") {
    result.sort((a, b) => a.mastery - b.mastery);
  } else if (filters.sort === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // Default: worst risk first (CRITICAL > MODERATE > SAFE)
    const riskRank = { CRITICAL: 3, MODERATE: 2, SAFE: 1 };
    result.sort(
      (a, b) =>
        (riskRank[b.worstRiskCategory] ?? 0) - (riskRank[a.worstRiskCategory] ?? 0) ||
        a.overallAttendance - b.overallAttendance,
    );
  }

  return result;
}

/**
 * 3. GET /api/v1/mentor/mentees/:studentId
 */
export async function getMenteeDetail(
  user: AuthUser,
  studentId: string,
): Promise<MenteeDetailView> {
  // Validate mentee scope
  if (user.role === Role.MENTOR) {
    const assignment = await prisma.mentorAssignment.findFirst({
      where: { mentorId: user.id, studentId, active: true },
    });
    if (!assignment) {
      throw new Error("FORBIDDEN_NOT_MENTEE");
    }
  }

  const [student, enrollments, interventions, notes, guardianContact, scores] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, email: true },
      }),
      prisma.courseEnrollment.findMany({
        where: { studentId },
        include: { course: true },
        orderBy: { course: { code: "asc" } },
      }),
      prisma.intervention.findMany({
        where: { studentId },
        orderBy: { scheduledFor: "desc" },
      }),
      prisma.mentorNote.findMany({
        where: { studentId },
        include: { mentor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.guardianContact.findFirst({
        where: { studentId },
        select: { consentGiven: true, consentAt: true },
      }),
      prisma.studentScore.findMany({
        where: { studentId },
        include: {
          assessment: {
            select: { title: true, dueDate: true, maxScore: true, weight: true },
          },
        },
        orderBy: { assessment: { dueDate: "asc" } },
      }),
    ]);

  if (!student) throw new Error("STUDENT_NOT_FOUND");

  const match = student.email.match(/^student(\d+)@/);
  const rollNumber = match ? `2026-CS-${match[1]}` : "CS-STUDENT";

  const courses: MenteeCourseDetail[] = enrollments.map((e) => ({
    courseId: e.courseId,
    courseCode: e.course.code,
    courseName: e.course.name,
    credits: e.course.credits,
    attendanceRate: e.attendanceRate ?? 0,
    masteryScore: e.masteryScore ?? 0,
    velocity: e.velocity ?? 0,
    riskCategory: e.riskCategory ?? RiskCategory.SAFE,
    riskScore: e.riskScore ?? 0,
  }));

  // Sparkline from chronological scores
  const sparkline = scores.map((s) => ({
    date: s.assessment.dueDate ? s.assessment.dueDate.toISOString().slice(5, 10) : "T",
    score: Math.round((s.score / s.assessment.maxScore) * 100),
  }));

  // Weak topics (scores < 50% maxScore on assessment questions)
  const questionScores = await prisma.questionScore.findMany({
    where: { studentId },
    include: { question: { select: { topicTag: true, maxScore: true } } },
  });

  const topicMap = new Map<string, { total: number; count: number; fails: number }>();
  for (const qs of questionScores) {
    const tag = qs.question.topicTag;
    const current = topicMap.get(tag) ?? { total: 0, count: 0, fails: 0 };
    current.total += qs.score;
    current.count += qs.question.maxScore;
    if (qs.score < qs.question.maxScore * 0.5) current.fails++;
    topicMap.set(tag, current);
  }

  const weakTopics = Array.from(topicMap.entries())
    .map(([topic, stats]) => ({
      topic,
      accuracy: Math.round((stats.total / stats.count) * 100),
      failureCount: stats.fails,
    }))
    .filter((t) => t.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  // Top risk drivers (from worst course)
  const worstEnrollment = enrollments.find((e) => e.riskCategory === RiskCategory.CRITICAL) || enrollments[0];
  let topRiskDrivers: { factor: string; impact: number; explanation: string }[] = [];
  let overrideReason: string | null = null;

  if (worstEnrollment) {
    const inputs = academicMetricsToRiskInputs(
      worstEnrollment.attendanceRate ?? 70,
      worstEnrollment.masteryScore ?? 50,
      worstEnrollment.velocity ?? 0,
      100 - (worstEnrollment.submissionDeficit ?? 0),
    );
    const explanation = explainRisk(inputs);
    topRiskDrivers = explanation.riskIncreasingFactors.map((f) => ({
      factor: f.factor,
      impact: f.percentage,
      explanation: `${f.factor.charAt(0).toUpperCase() + f.factor.slice(1)} accounts for ${f.percentage}% of risk contribution`,
    }));

    const vel = worstEnrollment.velocity ?? 0;
    const attRate = worstEnrollment.attendanceRate ?? 0;
    const mastScore = worstEnrollment.masteryScore ?? 0;
    if (worstEnrollment.riskCategory === RiskCategory.CRITICAL && explanation.compositeScore < 65) {
      if (vel <= -1.5) {
        overrideReason = `Velocity ${vel.toFixed(2)}%/day triggered automatic Critical override`;
      } else if (attRate <= 60 && mastScore <= 35) {
        overrideReason = `Low attendance (${attRate.toFixed(1)}%) and low mastery (${mastScore.toFixed(1)}%) triggered automatic Critical override`;
      } else {
        overrideReason = "Acute risk indicator triggered automatic Critical override";
      }
    }
  }

  return {
    student: {
      id: student.id,
      name: student.name,
      email: student.email,
      rollNumber,
      guardianConsent: guardianContact
        ? {
            consentGiven: guardianContact.consentGiven,
            consentAt: guardianContact.consentAt ? guardianContact.consentAt.toISOString() : null,
          }
        : null,
    },
    courses,
    sparkline,
    topRiskDrivers,
    overrideReason,
    weakTopics,
    interventions: interventions.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      scheduledAt: i.scheduledAt ? i.scheduledAt.toISOString() : i.scheduledFor.toISOString(),
      durationMin: i.durationMin,
      notes: i.notes,
      actionItems: i.actionItems,
      preScoreAvg: i.preScoreAvg,
      postScoreAvg: i.postScoreAvg,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      mentorName: n.mentor.name,
    })),
  };
}

/**
 * 4. NOTES: Create & List
 */
export async function getMenteeNotes(user: AuthUser, studentId: string) {
  if (user.role === Role.MENTOR) {
    const assignment = await prisma.mentorAssignment.findFirst({
      where: { mentorId: user.id, studentId, active: true },
    });
    if (!assignment) throw new Error("FORBIDDEN_NOT_MENTEE");
  }

  const notes = await prisma.mentorNote.findMany({
    where: { studentId },
    include: { mentor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return notes.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
    mentorName: n.mentor.name,
  }));
}

export async function createMenteeNote(user: AuthUser, studentId: string, body: string) {
  if (user.role === Role.MENTOR) {
    const assignment = await prisma.mentorAssignment.findFirst({
      where: { mentorId: user.id, studentId, active: true },
    });
    if (!assignment) throw new Error("FORBIDDEN_NOT_MENTEE");
  }

  const note = await prisma.mentorNote.create({
    data: {
      mentorId: user.id,
      studentId,
      body: body.trim(),
    },
    include: { mentor: { select: { name: true } } },
  });

  return {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    mentorName: note.mentor.name,
  };
}

/**
 * 5. INTERVENTIONS: Schedule, List, Patch, ICS
 */
export async function scheduleIntervention(
  user: AuthUser,
  params: {
    studentId: string;
    courseId?: string;
    title?: string;
    notes?: string;
    scheduledAt?: string;
    durationMin?: number;
  },
) {
  if (user.role === Role.MENTOR) {
    const assignment = await prisma.mentorAssignment.findFirst({
      where: { mentorId: user.id, studentId: params.studentId, active: true },
    });
    if (!assignment) throw new Error("FORBIDDEN_NOT_MENTEE");
  }

  let slotStart: Date;
  let durationMin = params.durationMin ?? INTERVENTION_DURATION_MIN;

  if (params.scheduledAt) {
    slotStart = new Date(params.scheduledAt);
  } else {
    // Auto-find slot using pure findInterventionSlot
    const [timetableSlots, existingInterventions] = await Promise.all([
      prisma.timetableSlot.findMany({
        where: {
          course: {
            enrollments: { some: { studentId: params.studentId } },
          },
        },
        select: { dayOfWeek: true, startTime: true, endTime: true },
      }),
      prisma.intervention.findMany({
        where: {
          mentorId: user.id,
          status: InterventionStatus.SCHEDULED,
        },
        select: { scheduledAt: true, scheduledFor: true, durationMin: true },
      }),
    ]);

    const findResult = findInterventionSlot({
      timetableSlots,
      existingInterventions: existingInterventions.map((i) => ({
        scheduledAt: i.scheduledAt || i.scheduledFor,
        durationMin: i.durationMin,
      })),
    });

    if (!findResult.slot) {
      throw new Error(`NO_SLOT_AVAILABLE: ${findResult.reason}`);
    }

    slotStart = findResult.slot.slotStart;
    durationMin = findResult.slot.durationMin;
  }

  // Allow caller to override duration
  if (params.durationMin) {
    durationMin = params.durationMin;
  }

  // Current average mastery (preScoreAvg)
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId: params.studentId },
    select: { masteryScore: true },
  });
  const scores = enrollments.map((e) => e.masteryScore).filter((m): m is number => m !== null);
  const preScoreAvg = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : 50;

  const [student, mentor] = await Promise.all([
    prisma.user.findUnique({ where: { id: params.studentId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
  ]);

  // Create Intervention
  const intervention = await prisma.intervention.create({
    data: {
      studentId: params.studentId,
      mentorId: user.id,
      courseId: params.courseId ?? null,
      title: params.title?.trim() || "Academic Mentoring Session",
      description: params.notes || "One-on-one academic mentoring session.",
      status: InterventionStatus.SCHEDULED,
      scheduledFor: slotStart,
      scheduledAt: slotStart,
      durationMin,
      notes: params.notes,
      createdById: user.id,
      preScoreAvg,
    },
  });

  // Create IN_APP notifications for student and mentor
  await Promise.all([
    prisma.notification.create({
      data: {
        userId: params.studentId,
        channel: "IN_APP",
        type: "INTERVENTION_SCHEDULED",
        link: "/student/dashboard",
        status: "PENDING",
        payload: {
          interventionId: intervention.id,
          mentorName: mentor?.name ?? "Your Mentor",
          scheduledAt: slotStart.toISOString(),
          message: `Academic mentoring session scheduled with ${mentor?.name ?? "your mentor"} for ${slotStart.toLocaleDateString()} at ${slotStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
        },
      },
    }),
    prisma.notification.create({
      data: {
        userId: user.id,
        channel: "IN_APP",
        type: "INTERVENTION_SCHEDULED",
        link: `/mentor/interventions`,
        status: "PENDING",
        payload: {
          interventionId: intervention.id,
          studentName: student?.name ?? "Student",
          scheduledAt: slotStart.toISOString(),
          message: `Mentoring session with ${student?.name ?? "student"} scheduled for ${slotStart.toLocaleDateString()}.`,
        },
      },
    }),
    prisma.auditLog.create({
      data: {
        entity: "Intervention",
        entityId: intervention.id,
        modifiedById: user.id,
        justification: "InterventionScheduledEvent",
        newValue: {
          studentId: params.studentId,
          mentorId: user.id,
          scheduledAt: slotStart.toISOString(),
          preScoreAvg,
        },
      },
    }),
  ]);

  return {
    ...intervention,
    icsUrl: `/api/v1/interventions/${intervention.id}/ics`,
  };
}

export async function getInterventionsList(user: AuthUser, status?: string) {
  const where: Prisma.InterventionWhereInput = {};

  if (user.role === Role.MENTOR) {
    where.mentorId = user.id;
  } else if (user.role === Role.STUDENT) {
    where.studentId = user.id;
  }
  if (status && status !== "ALL") {
    where.status = status as InterventionStatus;
  }

  const list = await prisma.intervention.findMany({
    where,
    include: {
      student: { select: { id: true, name: true, email: true } },
      mentor: { select: { id: true, name: true } },
      course: { select: { code: true, name: true } },
    },
    orderBy: { scheduledFor: "desc" },
  });

  const now = new Date();

  return Promise.all(
    list.map(async (i) => {
      const scheduledDate = i.scheduledAt || i.scheduledFor;
      let postScoreAvg = i.postScoreAvg;

      // postScoreAvg computed on read: average mastery 30 days after scheduledAt once available
      if (postScoreAvg === null && scheduledDate) {
        const thirtyDaysAfter = new Date(scheduledDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (now >= thirtyDaysAfter) {
          const enrollments = await prisma.courseEnrollment.findMany({
            where: { studentId: i.studentId },
            select: { masteryScore: true },
          });
          const scores = enrollments.map((e) => e.masteryScore).filter((m): m is number => m !== null);
          if (scores.length > 0) {
            postScoreAvg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
          }
        }
      }

      return {
        id: i.id,
        title: i.title,
        status: i.status,
        scheduledAt: scheduledDate.toISOString(),
        durationMin: i.durationMin,
        notes: i.notes,
        actionItems: i.actionItems,
        preScoreAvg: i.preScoreAvg,
        postScoreAvg,
        student: i.student,
        mentor: i.mentor,
        course: i.course,
      };
    }),
  );
}

export async function updateIntervention(
  user: AuthUser,
  id: string,
  data: {
    status?: InterventionStatus;
    notes?: string;
    actionItems?: Prisma.InputJsonValue;
  },
) {
  const existing = await prisma.intervention.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");

  if (user.role === Role.MENTOR && existing.mentorId !== user.id) {
    throw new Error("FORBIDDEN");
  }

  const updated = await prisma.intervention.update({
    where: { id },
    data: {
      ...(data.status !== undefined && { status: data.status }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.actionItems !== undefined && { actionItems: data.actionItems }),
      ...(data.status === InterventionStatus.COMPLETED && { completedAt: new Date() }),
    },
  });

  return updated;
}

export async function generateInterventionIcs(id: string): Promise<string> {
  const intervention = await prisma.intervention.findUnique({
    where: { id },
    include: {
      student: { select: { name: true, email: true } },
      mentor: { select: { name: true, email: true } },
    },
  });

  if (!intervention) throw new Error("NOT_FOUND");

  const start = intervention.scheduledAt || intervention.scheduledFor;
  const end = new Date(start.getTime() + intervention.durationMin * 60 * 1000);

  const formatIcsDate = (date: Date) =>
    date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Student Academic AI//Mentoring Session//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${intervention.id}@demo.edu`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${intervention.title} with ${intervention.student.name}`,
    `DESCRIPTION:${intervention.description || "Academic mentoring check-in"}`,
    `ORGANIZER;CN=${intervention.mentor.name}:MAILTO:${intervention.mentor.email}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${intervention.student.name}:MAILTO:${intervention.student.email}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * 6. ESCALATION REQUESTS
 */
export async function createEscalationRequest(
  user: AuthUser,
  studentId: string,
  reason: string,
) {
  if (user.role === Role.MENTOR) {
    const assignment = await prisma.mentorAssignment.findFirst({
      where: { mentorId: user.id, studentId, active: true },
    });
    if (!assignment) throw new Error("FORBIDDEN_NOT_MENTEE");
  }

  // Idempotent: return existing active case if found
  const existingCase = await prisma.escalationCase.findFirst({
    where: { studentId, status: { in: ["OPEN", "ESCALATED"] } },
  });
  if (existingCase) {
    return existingCase;
  }

  const newCase = await prisma.escalationCase.create({
    data: {
      studentId,
      reason: reason.trim(),
      tier: 1,
      status: "OPEN",
      createdById: user.id,
    },
  });

  return newCase;
}

export async function getMentorEscalationRequests(user: AuthUser) {
  if (user.role === Role.ADMIN) {
    return prisma.escalationCase.findMany({
      include: {
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  const assigned = await prisma.mentorAssignment.findMany({
    where: { mentorId: user.id, active: true },
    select: { studentId: true },
  });
  const menteeIds = assigned.map((a) => a.studentId);

  return prisma.escalationCase.findMany({
    where: {
      OR: [
        { createdById: user.id },
        { studentId: { in: menteeIds } },
      ],
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
