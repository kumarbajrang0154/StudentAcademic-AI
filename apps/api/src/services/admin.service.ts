import { prisma } from "@student-academic-ai/database";
import {
  Role,
  RiskCategory,
  InterventionStatus,
} from "@prisma/client";
import {
  courseMastery,
  CourseMasteryComponent,
  DEFAULT_RISK_WEIGHTS,
  velocityBand,
} from "@student-academic-ai/core";
import { AuthUser, PERMISSION_MATRIX, canAccessDepartment } from "../lib/rbac.js";

/**
 * 1. GET /admin/overview
 * Bulk queries only (groupBy/include), no N+1, no Redis, no background workers.
 */
export async function getAdminOverview(user: AuthUser, queryDeptId?: string) {
  const startTime = Date.now();

  // Scope enforcement
  let targetDeptId: string | undefined = undefined;
  if (user.role === "HOD") {
    if (!user.departmentId) {
      throw new Error("FORBIDDEN_NO_DEPARTMENT");
    }
    targetDeptId = user.departmentId;
  } else if (user.role === "ADMIN") {
    targetDeptId = queryDeptId || undefined;
  }

  // Fetch in-scope courses
  const courses = await prisma.course.findMany({
    where: targetDeptId ? { departmentId: targetDeptId } : {},
    select: {
      id: true,
      code: true,
      name: true,
      departmentId: true,
    },
  });

  const courseIds = courses.map((c) => c.id);

  // Bulk query 1: All enrollments in scope
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId: { in: courseIds } },
    select: {
      id: true,
      studentId: true,
      courseId: true,
      riskCategory: true,
      riskScore: true,
      attendanceRate: true,
      masteryScore: true,
      velocity: true,
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          departmentId: true,
          mentorAssignmentsAsStudent: {
            where: { active: true },
            select: { mentor: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  const totalEnrollments = enrollments.length;
  const criticalEnrollments = enrollments.filter(
    (e) => e.riskCategory === RiskCategory.CRITICAL,
  );
  const criticalCount = criticalEnrollments.length;
  const distinctCriticalStudentIds = new Set(
    criticalEnrollments.map((e) => e.studentId),
  );

  const retentionRiskPercent =
    totalEnrollments > 0
      ? Math.round((criticalCount / totalEnrollments) * 1000) / 10
      : 0;

  // KPI 1: retentionRiskIndex
  const retentionRiskIndex = {
    value: retentionRiskPercent,
    distinctCriticalStudents: distinctCriticalStudentIds.size,
    deltaVs7Days: null, // Zero fabricated history
    definition:
      "% of course enrollments currently in CRITICAL risk category, plus count of distinct students critical in >= 1 course.",
    sampleSize: totalEnrollments,
  };

  // KPI 2: projectedDebarments (attendance < 75% in >= 1 course)
  const debarredStudentIds = new Set(
    enrollments
      .filter((e) => e.attendanceRate !== null && e.attendanceRate < 75)
      .map((e) => e.studentId),
  );

  const allDistinctStudentIds = new Set(enrollments.map((e) => e.studentId));

  const projectedDebarments = {
    value: debarredStudentIds.size,
    deltaVs7Days: null,
    definition:
      "Distinct students with attendance strictly below the mandatory institutional 75% threshold in at least one enrolled course.",
    sampleSize: allDistinctStudentIds.size,
  };

  // KPI 3: curriculumBottlenecks (> 40% cohort scored < 50% on a unit)
  // Single grouped query structure over QuestionScore
  const unitQuestions = await prisma.assessmentQuestion.findMany({
    where: { unit: { courseId: { in: courseIds } } },
    select: {
      id: true,
      unitId: true,
      maxScore: true,
      unit: {
        select: {
          id: true,
          courseId: true,
          unitNumber: true,
          title: true,
        },
      },
    },
  });

  const questionIds = unitQuestions.map((q) => q.id);
  const questionScores = await prisma.questionScore.findMany({
    where: { questionId: { in: questionIds } },
    select: { questionId: true, score: true },
  });

  const questionMaxMap = new Map<string, { maxScore: number; unitId: string }>();
  unitQuestions.forEach((q) => {
    if (q.unitId) {
      questionMaxMap.set(q.id, { maxScore: q.maxScore, unitId: q.unitId });
    }
  });

  const unitScoresMap = new Map<string, { total: number; low: number }>();
  questionScores.forEach((qs) => {
    const meta = questionMaxMap.get(qs.questionId);
    if (!meta) return;
    const cur = unitScoresMap.get(meta.unitId) || { total: 0, low: 0 };
    cur.total++;
    if (qs.score < meta.maxScore * 0.5) {
      cur.low++;
    }
    unitScoresMap.set(meta.unitId, cur);
  });

  let bottleneckCount = 0;
  for (const [, counts] of unitScoresMap.entries()) {
    if (counts.total > 0 && counts.low / counts.total > 0.4) {
      bottleneckCount++;
    }
  }

  const curriculumBottlenecks = {
    value: bottleneckCount,
    deltaVs7Days: null,
    definition:
      "Number of (course, unit) pairs where > 40% of the cohort scored < 50% on assessments.",
    sampleSize: unitScoresMap.size,
  };

  // KPI 4: interventionSuccessRate
  const completedInterventions = await prisma.intervention.findMany({
    where: {
      status: InterventionStatus.COMPLETED,
      courseId: { in: courseIds },
      preScoreAvg: { not: null },
    },
    select: {
      id: true,
      studentId: true,
      courseId: true,
      preScoreAvg: true,
      postScoreAvg: true,
      scheduledAt: true,
    },
  });

  // Calculate post score from actual assessments if postScoreAvg is null
  let successEvaluatedCount = 0;
  let successCount = 0;

  // Pre-fetch scores for students in completed interventions in bulk
  const interventionStudentIds = Array.from(
    new Set(completedInterventions.map((i) => i.studentId)),
  );

  const studentScoresList = await prisma.studentScore.findMany({
    where: {
      studentId: { in: interventionStudentIds },
      assessment: { courseId: { in: courseIds } },
    },
    select: {
      studentId: true,
      score: true,
      assessment: {
        select: {
          id: true,
          courseId: true,
          maxScore: true,
          weight: true,
        },
      },
    },
  });

  const studentCourseScoresMap = new Map<string, CourseMasteryComponent[]>();
  studentScoresList.forEach((ss) => {
    const key = `${ss.studentId}:${ss.assessment.courseId}`;
    const cur = studentCourseScoresMap.get(key) || [];
    cur.push({
      score: ss.score,
      maxScore: ss.assessment.maxScore,
      weight: ss.assessment.weight,
    });
    studentCourseScoresMap.set(key, cur);
  });

  completedInterventions.forEach((item) => {
    const pre = item.preScoreAvg ?? 0;
    let post = item.postScoreAvg;
    if (post === null && item.courseId) {
      const key = `${item.studentId}:${item.courseId}`;
      const components = studentCourseScoresMap.get(key) || [];
      if (components.length > 0) {
        post = courseMastery(components);
      }
    }
    if (post !== null && post !== undefined) {
      successEvaluatedCount++;
      if (post > pre) {
        successCount++;
      }
    }
  });

  const interventionSuccessRate = {
    value:
      successEvaluatedCount >= 3
        ? Math.round((successCount / successEvaluatedCount) * 1000) / 10
        : null,
    deltaVs7Days: null,
    definition:
      "% of COMPLETED interventions with a computable post score where postScoreAvg > preScoreAvg (null if fewer than 3).",
    sampleSize: successEvaluatedCount,
    note: successEvaluatedCount < 3 ? "not enough data" : undefined,
  };

  // KPI 5: markEntryCompliance
  const pastDueAssessments = await prisma.assessment.findMany({
    where: {
      courseId: { in: courseIds },
      dueDate: { lt: new Date() },
    },
    select: {
      id: true,
      dueDate: true,
      scores: {
        select: { gradedAt: true },
      },
    },
  });

  let compliantAssessmentsCount = 0;
  pastDueAssessments.forEach((ass) => {
    if (!ass.dueDate) return;
    const dueTime = ass.dueDate.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const allWithinSevenDays =
      ass.scores.length > 0 &&
      ass.scores.every((s) => s.gradedAt.getTime() - dueTime <= sevenDaysMs);
    if (allWithinSevenDays) {
      compliantAssessmentsCount++;
    }
  });

  const markEntryCompliance = {
    value:
      pastDueAssessments.length > 0
        ? Math.round(
            (compliantAssessmentsCount / pastDueAssessments.length) * 1000,
          ) / 10
        : null,
    deltaVs7Days: null,
    definition:
      "% of past-due assessments that have scores recorded within 7 days of dueDate.",
    sampleSize: pastDueAssessments.length,
    note:
      pastDueAssessments.length === 0 ? "no past due assessments" : undefined,
  };

  // Chart Data A: Attendance Trend per course (last 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const attendanceSessions = await prisma.classSession.findMany({
    where: {
      courseId: { in: courseIds },
      sessionDate: { gte: fourteenDaysAgo },
    },
    select: {
      id: true,
      sessionDate: true,
      course: { select: { code: true } },
      attendanceRecords: {
        select: { status: true },
      },
    },
    orderBy: { sessionDate: "asc" },
  });

  const dateMap = new Map<string, Record<string, { present: number; total: number }>>();

  attendanceSessions.forEach((sess) => {
    const dStr = sess.sessionDate.toISOString().slice(0, 10);
    const dayData = dateMap.get(dStr) || {};
    const cCode = sess.course.code;
    const cur = dayData[cCode] || { present: 0, total: 0 };

    sess.attendanceRecords.forEach((rec) => {
      cur.total++;
      if (rec.status === "PRESENT" || rec.status === "ON_DUTY") {
        cur.present++;
      }
    });

    dayData[cCode] = cur;
    dateMap.set(dStr, dayData);
  });

  const attendanceTrend = Array.from(dateMap.entries()).map(([date, courseStats]) => {
    const row: Record<string, string | number> = { date };
    for (const [code, stat] of Object.entries(courseStats)) {
      row[code] = stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 100;
    }
    return row;
  });

  // Chart Data B: Risk Distribution per Course
  const courseRiskMap = new Map<
    string,
    { course: string; name: string; safe: number; moderate: number; critical: number }
  >();

  courses.forEach((c) => {
    courseRiskMap.set(c.id, {
      course: c.code,
      name: c.name,
      safe: 0,
      moderate: 0,
      critical: 0,
    });
  });

  enrollments.forEach((enr) => {
    const cur = courseRiskMap.get(enr.courseId);
    if (!cur) return;
    if (enr.riskCategory === RiskCategory.SAFE) cur.safe++;
    else if (enr.riskCategory === RiskCategory.MODERATE) cur.moderate++;
    else if (enr.riskCategory === RiskCategory.CRITICAL) cur.critical++;
  });

  const riskDistribution = Array.from(courseRiskMap.values());

  // Escalation Table: Students Critical in >= 3 courses
  const studentCriticalEnrollmentsMap = new Map<
    string,
    typeof enrollments
  >();

  enrollments.forEach((enr) => {
    if (enr.riskCategory === RiskCategory.CRITICAL) {
      const list = studentCriticalEnrollmentsMap.get(enr.studentId) || [];
      list.push(enr);
      studentCriticalEnrollmentsMap.set(enr.studentId, list);
    }
  });

  const criticalStudentIds = Array.from(studentCriticalEnrollmentsMap.entries())
    .filter(([, enrs]) => enrs.length >= 3)
    .map(([sId]) => sId);

  // Fetch escalation cases for these students in bulk
  const escalationCases = await prisma.escalationCase.findMany({
    where: { studentId: { in: criticalStudentIds } },
    select: {
      id: true,
      studentId: true,
      status: true,
      severity: true,
      createdAt: true,
      dispatchedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const escalationCaseMap = new Map<string, (typeof escalationCases)[0]>();
  escalationCases.forEach((ec) => {
    if (!escalationCaseMap.has(ec.studentId)) {
      escalationCaseMap.set(ec.studentId, ec);
    }
  });

  const escalationTableRows = [];
  for (const sId of criticalStudentIds) {
    const enrs = studentCriticalEnrollmentsMap.get(sId)!;
    const firstEnr = enrs[0]!;
    const student = firstEnr.student;
    const ec = escalationCaseMap.get(sId);

    // Derive risk driver chips in-memory (bulk, zero N+1)
    const riskDriverTags: string[] = [];
    if (firstEnr.attendanceRate !== null && firstEnr.attendanceRate < 75) {
      riskDriverTags.push("Attendance < 75%");
    }
    if (firstEnr.masteryScore !== null && firstEnr.masteryScore < 50) {
      riskDriverTags.push("Low Mastery");
    }
    if ((firstEnr.velocity ?? 0) < -0.1) {
      riskDriverTags.push("Declining Velocity");
    }
    if (riskDriverTags.length === 0) {
      riskDriverTags.push("Critical across courses");
    }
    const vBand = velocityBand(firstEnr.velocity ?? 0);

    const mentorName =
      student.mentorAssignmentsAsStudent[0]?.mentor?.name || "Unassigned";

    escalationTableRows.push({
      studentId: sId,
      name: student.name,
      email: student.email,
      criticalCourseCount: enrs.length,
      riskDriverTags,
      velocityBand: vBand,
      mentorName,
      caseId: ec?.id || null,
      caseStatus: ec?.status || "NONE",
      severity: ec?.severity || "STANDARD",
      dispatchedAt: ec?.dispatchedAt || null,
    });
  }

  const durationMs = Date.now() - startTime;

  return {
    kpis: {
      retentionRiskIndex,
      projectedDebarments,
      curriculumBottlenecks,
      interventionSuccessRate,
      markEntryCompliance,
    },
    charts: {
      attendanceTrend,
      riskDistribution,
    },
    escalationsQueue: escalationTableRows,
    meta: {
      executionMs: durationMs,
      departmentId: targetDeptId || "ALL",
    },
  };
}

/**
 * 2. GET /admin/escalations
 */
export async function getAdminEscalations(
  user: AuthUser,
  status?: string,
  page = 1,
  limit = 20,
) {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const skip = (page - 1) * safeLimit;

  const whereClause: Record<string, unknown> = {};

  if (user.role === "HOD" && user.departmentId) {
    whereClause.student = { departmentId: user.departmentId };
  }

  if (status && status !== "ALL") {
    whereClause.status = status;
  }

  const [total, cases] = await Promise.all([
    prisma.escalationCase.count({ where: whereClause }),
    prisma.escalationCase.findMany({
      where: whereClause,
      include: {
        student: { select: { id: true, name: true, email: true, departmentId: true } },
        createdBy: { select: { id: true, name: true, role: true } },
        dispatchedBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        dispatchJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
    }),
  ]);

  return {
    escalations: cases,
    pagination: {
      page,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * 3. GET /admin/escalations/:id
 */
export async function getAdminEscalationById(user: AuthUser, id: string) {
  const escalation = await prisma.escalationCase.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true, email: true, departmentId: true } },
      createdBy: { select: { id: true, name: true, role: true } },
      dispatchedBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      notifications: {
        select: {
          id: true,
          channel: true,
          type: true,
          status: true,
          sentAt: true,
          createdAt: true,
          user: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      dispatchJobs: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!escalation) {
    throw new Error("NOT_FOUND");
  }

  if (
    user.role === "HOD" &&
    escalation.student.departmentId &&
    !canAccessDepartment(user, escalation.student.departmentId)
  ) {
    throw new Error("FORBIDDEN");
  }

  // Fetch timeline from AuditLog rows for this case
  const auditRows = await prisma.auditLog.findMany({
    where: { entity: "EscalationCase", entityId: id },
    include: { modifiedBy: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  return {
    escalation,
    timeline: auditRows,
  };
}

/**
 * 4. PATCH /admin/escalations/:id
 */
export async function resolveAdminEscalation(
  user: AuthUser,
  id: string,
  newStatus: "RESOLVED" | "CLOSED",
  resolutionNote: string,
) {
  const existingCase = await prisma.escalationCase.findUnique({
    where: { id },
    include: { student: { select: { departmentId: true } } },
  });

  if (!existingCase) {
    throw new Error("NOT_FOUND");
  }

  if (
    user.role === "HOD" &&
    existingCase.student.departmentId &&
    !canAccessDepartment(user, existingCase.student.departmentId)
  ) {
    throw new Error("FORBIDDEN");
  }

  const prevStatus = existingCase.status;

  const updatedCase = await prisma.escalationCase.update({
    where: { id },
    data: {
      status: newStatus,
      resolutionNote: resolutionNote.trim(),
      resolvedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      entity: "EscalationCase",
      entityId: id,
      previousValue: { status: prevStatus },
      newValue: { status: newStatus, resolutionNote: resolutionNote.trim() },
      modifiedById: user.id,
      justification: `EscalationResolved: status changed to ${newStatus}: ${resolutionNote.trim()}`,
    },
  });

  return updatedCase;
}

/**
 * 5. GET /admin/students
 */
export async function getAdminStudents(
  user: AuthUser,
  search?: string,
  risk?: string,
  courseId?: string,
  page = 1,
  limit = 20,
) {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const skip = (page - 1) * safeLimit;

  const whereClause: Record<string, unknown> = {
    role: Role.STUDENT,
  };

  if (user.role === "HOD" && user.departmentId) {
    whereClause.departmentId = user.departmentId;
  }

  if (search && search.trim()) {
    whereClause.OR = [
      { name: { contains: search.trim(), mode: "insensitive" } },
      { email: { contains: search.trim(), mode: "insensitive" } },
    ];
  }

  if (courseId) {
    whereClause.enrollments = {
      some: { courseId },
    };
  }

  if (risk && risk !== "ALL") {
    whereClause.enrollments = {
      ...(whereClause.enrollments as Record<string, unknown> || {}),
      some: {
        ...(whereClause.enrollments ? (whereClause.enrollments as { some?: Record<string, unknown> }).some : {}),
        riskCategory: risk as RiskCategory,
      },
    };
  }

  const [total, students] = await Promise.all([
    prisma.user.count({ where: whereClause }),
    prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        departmentId: true,
        department: { select: { id: true, name: true, code: true } },
        enrollments: {
          select: {
            id: true,
            courseId: true,
            riskCategory: true,
            attendanceRate: true,
            masteryScore: true,
            velocity: true,
            course: { select: { code: true, name: true } },
          },
        },
        guardianContacts: {
          select: {
            id: true,
            consentGiven: true,
            consentAt: true,
            // SECURITY: Never include guardian phone numbers!
          },
        },
        mentorAssignmentsAsStudent: {
          where: { active: true },
          select: { mentor: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { email: "asc" },
      skip,
      take: safeLimit,
    }),
  ]);

  return {
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      department: s.department,
      enrollments: s.enrollments,
      guardianConsent: s.guardianContacts[0]?.consentGiven ?? false,
      mentor: s.mentorAssignmentsAsStudent[0]?.mentor || null,
    })),
    pagination: {
      page,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * 6. GET /admin/courses
 */
export async function getAdminCourses(user: AuthUser) {
  const whereClause =
    user.role === "HOD" && user.departmentId
      ? { departmentId: user.departmentId }
      : {};

  const courses = await prisma.course.findMany({
    where: whereClause,
    include: {
      department: { select: { id: true, name: true, code: true } },
      sessions: {
        take: 1,
        include: { faculty: { select: { id: true, name: true, email: true } } },
      },
      enrollments: {
        select: {
          riskCategory: true,
          attendanceRate: true,
        },
      },
      units: {
        include: {
          questions: {
            select: { id: true, maxScore: true },
          },
        },
      },
      assessments: {
        where: { dueDate: { lt: new Date() } },
        select: {
          id: true,
          dueDate: true,
          scores: { select: { gradedAt: true } },
        },
      },
    },
  });

  // Calculate unit bottlenecks in bulk
  const allQuestionIds: string[] = [];
  courses.forEach((c) =>
    c.units.forEach((u) => u.questions.forEach((q) => allQuestionIds.push(q.id))),
  );

  const scores = await prisma.questionScore.findMany({
    where: { questionId: { in: allQuestionIds } },
    select: { questionId: true, score: true },
  });

  const scoreMap = new Map<string, number[]>();
  scores.forEach((s) => {
    const list = scoreMap.get(s.questionId) || [];
    list.push(s.score);
    scoreMap.set(s.questionId, list);
  });

  return courses.map((course) => {
    const enrs = course.enrollments;
    const totalEnrolled = enrs.length;
    let safeCount = 0;
    let modCount = 0;
    let critCount = 0;
    let totalAttendance = 0;
    let attendanceCount = 0;

    enrs.forEach((e) => {
      if (e.riskCategory === RiskCategory.SAFE) safeCount++;
      else if (e.riskCategory === RiskCategory.MODERATE) modCount++;
      else if (e.riskCategory === RiskCategory.CRITICAL) critCount++;

      if (e.attendanceRate !== null) {
        totalAttendance += e.attendanceRate;
        attendanceCount++;
      }
    });

    const avgAttendance =
      attendanceCount > 0
        ? Math.round((totalAttendance / attendanceCount) * 10) / 10
        : 0;

    // Bottleneck count
    let bottleneckCount = 0;
    course.units.forEach((unit) => {
      let unitTotalScores = 0;
      let unitLowScores = 0;
      unit.questions.forEach((q) => {
        const qScores = scoreMap.get(q.id) || [];
        qScores.forEach((score) => {
          unitTotalScores++;
          if (score < q.maxScore * 0.5) unitLowScores++;
        });
      });
      if (unitTotalScores > 0 && unitLowScores / unitTotalScores > 0.4) {
        bottleneckCount++;
      }
    });

    // Mark entry compliance for this course
    let compliantCount = 0;
    course.assessments.forEach((ass) => {
      if (!ass.dueDate) return;
      const dueTime = ass.dueDate.getTime();
      const compliant =
        ass.scores.length > 0 &&
        ass.scores.every((s) => s.gradedAt.getTime() - dueTime <= 7 * 86400000);
      if (compliant) compliantCount++;
    });

    const markEntryCompliance =
      course.assessments.length > 0
        ? Math.round((compliantCount / course.assessments.length) * 100)
        : null;

    const faculty = course.sessions[0]?.faculty || null;

    return {
      id: course.id,
      code: course.code,
      name: course.name,
      credits: course.credits,
      department: course.department,
      faculty,
      enrolledCount: totalEnrolled,
      riskDistribution: {
        safe: safeCount,
        moderate: modCount,
        critical: critCount,
      },
      avgAttendance,
      bottleneckUnitsCount: bottleneckCount,
      markEntryCompliance,
    };
  });
}

/**
 * 7. GET /admin/interventions/efficacy
 */
export async function getAdminInterventionsEfficacy(user: AuthUser) {
  const whereClause: Record<string, unknown> = {
    status: InterventionStatus.COMPLETED,
  };

  if (user.role === "HOD" && user.departmentId) {
    whereClause.student = { departmentId: user.departmentId };
  }

  const interventions = await prisma.intervention.findMany({
    where: whereClause,
    include: {
      student: { select: { id: true, name: true, email: true, departmentId: true } },
      mentor: { select: { id: true, name: true, email: true } },
      course: { select: { id: true, code: true, name: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  // Fetch actual student scores to compute postScoreAvg via courseMastery
  const studentIds = Array.from(new Set(interventions.map((i) => i.studentId)));
  const scores = await prisma.studentScore.findMany({
    where: { studentId: { in: studentIds } },
    include: {
      assessment: {
        select: { courseId: true, maxScore: true, weight: true },
      },
    },
  });

  const studentCourseScoresMap = new Map<string, CourseMasteryComponent[]>();
  scores.forEach((s) => {
    const key = `${s.studentId}:${s.assessment.courseId}`;
    const list = studentCourseScoresMap.get(key) || [];
    list.push({
      score: s.score,
      maxScore: s.assessment.maxScore,
      weight: s.assessment.weight,
    });
    studentCourseScoresMap.set(key, list);
  });

  const nowMs = Date.now();
  let totalImprovement = 0;
  let evaluatedCount = 0;
  let highlyEffectiveCount = 0;
  let moderatelyEffectiveCount = 0;
  let neutralDecliningCount = 0;
  let pendingCount = 0;

  const rows = interventions.map((item) => {
    const preScore = item.preScoreAvg ?? 0;
    let postScore = item.postScoreAvg;

    if (postScore === null && item.courseId) {
      const components = studentCourseScoresMap.get(`${item.studentId}:${item.courseId}`) || [];
      if (components.length > 0) {
        postScore = courseMastery(components);
      }
    }

    const scheduledTime = item.scheduledAt ? item.scheduledAt.getTime() : item.createdAt.getTime();
    const daysElapsed = (nowMs - scheduledTime) / (24 * 60 * 60 * 1000);

    if (daysElapsed < 30 || postScore === null || postScore === undefined) {
      pendingCount++;
      return {
        id: item.id,
        studentName: item.student.name,
        studentEmail: item.student.email,
        mentorName: item.mentor.name,
        courseCode: item.course?.code || "N/A",
        scheduledAt: item.scheduledAt,
        preScoreAvg: preScore,
        postScoreAvg: postScore,
        efficacyIndex: null,
        efficacyClass: "Pending",
        status: "pending",
        effortHours: 1,
      };
    }

    evaluatedCount++;
    const efficacyIndex = Math.round(((postScore - preScore) / 1) * 100) / 100;
    totalImprovement += postScore - preScore;

    let efficacyClass = "Neutral/Declining";
    if (efficacyIndex > 5) {
      efficacyClass = "Highly Effective";
      highlyEffectiveCount++;
    } else if (efficacyIndex >= 1) {
      efficacyClass = "Moderately Effective";
      moderatelyEffectiveCount++;
    } else {
      neutralDecliningCount++;
    }

    return {
      id: item.id,
      studentName: item.student.name,
      studentEmail: item.student.email,
      mentorName: item.mentor.name,
      courseCode: item.course?.code || "N/A",
      scheduledAt: item.scheduledAt,
      preScoreAvg: preScore,
      postScoreAvg: postScore,
      efficacyIndex,
      efficacyClass,
      status: "completed",
      effortHours: 1,
    };
  });

  const avgImprovement =
    evaluatedCount > 0 ? Math.round((totalImprovement / evaluatedCount) * 10) / 10 : 0;

  return {
    summary: {
      totalInterventions: interventions.length,
      evaluatedCount,
      pendingCount,
      averageImprovement: avgImprovement,
      highlyEffectiveCount,
      moderatelyEffectiveCount,
      neutralDecliningCount,
    },
    interventions: rows,
  };
}

/**
 * 8. GET /admin/audit
 * Paged, read-only audit log viewer. No UPDATE/DELETE routes exist.
 */
export async function getAdminAuditLogs(
  user: AuthUser,
  entity?: string,
  actorId?: string,
  from?: string,
  to?: string,
  page = 1,
  limit = 20,
) {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const skip = (page - 1) * safeLimit;

  const whereClause: Record<string, unknown> = {};

  if (user.role === "HOD" && user.departmentId) {
    whereClause.modifiedBy = {
      departmentId: user.departmentId,
    };
  }

  if (entity) {
    whereClause.entity = entity;
  }

  if (actorId) {
    whereClause.modifiedById = actorId;
  }

  if (from || to) {
    whereClause.createdAt = {};
    if (from) {
      (whereClause.createdAt as Record<string, unknown>).gte = new Date(from);
    }
    if (to) {
      (whereClause.createdAt as Record<string, unknown>).lte = new Date(to);
    }
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where: whereClause }),
    prisma.auditLog.findMany({
      where: whereClause,
      include: {
        modifiedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            departmentId: true,
            // SECURITY: Never include passwordHash!
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
    }),
  ]);

  // Sanitize previousValue and newValue to remove any sensitive attributes if present
  const sanitizedRows = rows.map((r) => {
    let prev = r.previousValue as Record<string, unknown> | null;
    let next = r.newValue as Record<string, unknown> | null;
    if (prev && typeof prev === "object") {
      const copy = { ...prev };
      delete copy.passwordHash;
      delete copy.phone;
      prev = copy;
    }
    if (next && typeof next === "object") {
      const copy = { ...next };
      delete copy.passwordHash;
      delete copy.phone;
      next = copy;
    }
    return {
      ...r,
      previousValue: prev,
      newValue: next,
    };
  });

  return {
    auditLogs: sanitizedRows,
    pagination: {
      page,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

/**
 * 9. GET /admin/settings
 * Read-only RBAC matrix, risk weights, thresholds, and operational rules.
 */
export async function getAdminSettings() {
  return {
    rbacMatrix: PERMISSION_MATRIX,
    riskWeights: DEFAULT_RISK_WEIGHTS,
    thresholds: {
      mandatoryAttendance: 75,
      riskBands: {
        SAFE: "0 - 39",
        MODERATE: "40 - 64",
        CRITICAL: "65 - 100",
      },
      velocityBands: {
        STEEP_DECLINE: "< -1.5 %/day",
        MODERATE_DECLINE: "-1.5 to 0.0 %/day",
        STABLE: "0.0 to 0.5 %/day",
        IMPROVING: ">= 0.5 %/day",
      },
      curriculumBottleneckThreshold: "40% cohort scoring < 50%",
    },
    operationalRules: {
      escalationAutoTriggerCondition: "CRITICAL risk in >= 3 courses",
      escalationDedupIntervalHours: 24,
      officeHours: "09:00 - 17:00 Monday - Friday",
      interventionSlotMinutes: 30,
      defaultDurationMinutes: 15,
    },
  };
}

/**
 * 10. GET /admin/jobs/:jobId
 */
export async function getAdminJobStatus(jobId: string) {
  const job = await prisma.dispatchJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      caseId: true,
      status: true,
      estimatedMs: true,
      notificationsCount: true,
      calendarHoldCreated: true,
      interventionId: true,
      error: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  if (!job) {
    throw new Error("NOT_FOUND");
  }

  return { job };
}
