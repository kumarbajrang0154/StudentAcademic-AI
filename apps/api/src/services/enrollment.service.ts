import { prisma, AttendanceStatus, RiskCategory } from "@student-academic-ai/database";
import {
  attendancePercent,
  courseMastery,
  academicMetricsToRiskInputs,
  riskScore,
  negativeVelocityWarning,
} from "@student-academic-ai/core";

export interface RecomputeEnrollmentResult {
  studentId: string;
  courseId: string;
  attendanceRate: number;
  masteryScore: number;
  velocity: number;
  submissionDeficit: number;
  riskScore: number;
  riskCategory: RiskCategory;
}

/**
 * Recomputes and persists student academic indicators on CourseEnrollment:
 * - attendance: PRESENT = P; ON_DUTY / MEDICAL_LEAVE = OD; T = total session records
 * - mastery: via core.courseMastery over graded scores only
 * - velocity: (M(now) - M(14 days ago)) / 14 where M(t) uses assessments with dueDate <= t (0 if no earlier data)
 * - submissionDeficit: % of past-due assessments with no score
 * - risk score & category: via core.riskScore
 */
export async function recomputeEnrollment(
  studentId: string,
  courseId: string,
  now: Date = new Date(),
): Promise<RecomputeEnrollmentResult> {
  const existingEnrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId, courseId },
    select: { riskCategory: true },
  });
  const previousRisk = existingEnrollment?.riskCategory;

  // 1. Attendance Records for this student in this course
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      session: {
        courseId,
      },
    },
    select: {
      status: true,
    },
  });

  const totalSessions = attendanceRecords.length;
  let presentCount = 0;
  let onDutyCount = 0;

  for (const record of attendanceRecords) {
    if (record.status === AttendanceStatus.PRESENT) {
      presentCount++;
    } else if (
      record.status === AttendanceStatus.ON_DUTY ||
      record.status === AttendanceStatus.MEDICAL_LEAVE
    ) {
      onDutyCount++;
    }
  }

  const attendanceRate = attendancePercent(
    presentCount,
    onDutyCount,
    totalSessions,
  );

  // 2. Assessments and student scores for this course
  const assessments = await prisma.assessment.findMany({
    where: { courseId },
    include: {
      scores: {
        where: { studentId },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  // Score lookup map: assessmentId -> score
  const scoreMap = new Map<string, number>();
  for (const a of assessments) {
    if (a.scores.length > 0 && a.scores[0]?.score !== null && a.scores[0]?.score !== undefined) {
      scoreMap.set(a.id, a.scores[0].score);
    }
  }

  // Graded components currently evaluated
  const gradedComponents = assessments
    .filter((a) => scoreMap.has(a.id))
    .map((a) => ({
      score: scoreMap.get(a.id)!,
      maxScore: a.maxScore,
      weight: a.weight,
    }));

  const masteryScore = courseMastery(gradedComponents);

  // 3. Velocity: (M(now) - M(14 days ago)) / 14
  // M(t) uses assessments with dueDate <= t
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const componentsFourteenDaysAgo = assessments
    .filter((a) => a.dueDate && a.dueDate <= fourteenDaysAgo && scoreMap.has(a.id))
    .map((a) => ({
      score: scoreMap.get(a.id)!,
      maxScore: a.maxScore,
      weight: a.weight,
    }));

  const masteryFourteenDaysAgo =
    componentsFourteenDaysAgo.length > 0
      ? courseMastery(componentsFourteenDaysAgo)
      : 0;

  const rawVelocity = (masteryScore - masteryFourteenDaysAgo) / 14;
  const velocity = Math.round(rawVelocity * 1000) / 1000;

  // 4. Submission Deficit: % of past-due assessments with no score
  const pastDueAssessments = assessments.filter(
    (a) => a.dueDate && a.dueDate < now,
  );
  let submissionDeficit = 0;
  if (pastDueAssessments.length > 0) {
    const missingCount = pastDueAssessments.filter(
      (a) => !scoreMap.has(a.id),
    ).length;
    submissionDeficit =
      Math.round((missingCount / pastDueAssessments.length) * 1000) / 10;
  }

  // 5. Risk score + category
  const riskInputs = academicMetricsToRiskInputs(
    attendanceRate,
    masteryScore,
    velocity,
    100 - submissionDeficit,
  );

  const riskResult = riskScore(riskInputs);
  let category = riskResult.category;
  if (
    negativeVelocityWarning(velocity) ||
    (attendanceRate <= 60 && masteryScore <= 35) ||
    riskResult.score >= 65
  ) {
    category = RiskCategory.CRITICAL;
  }

  // 6. Persist on CourseEnrollment
  await prisma.courseEnrollment.updateMany({
    where: {
      studentId,
      courseId,
    },
    data: {
      attendanceRate,
      masteryScore,
      velocity,
      submissionDeficit,
      riskScore: riskResult.score,
      riskCategory: category,
    },
  });

  await notifyMentorIfRiskWorsenedToCritical(
    studentId,
    courseId,
    previousRisk,
    category,
    now,
  );

  return {
    studentId,
    courseId,
    attendanceRate,
    masteryScore,
    velocity,
    submissionDeficit,
    riskScore: riskResult.score,
    riskCategory: category,
  };
}

/**
 * Bulk recomputes and persists student academic indicators for a course:
 * - Loads attendance, scores, assessments in bulk queries (no N+1 per-student calls)
 * - Computes metrics in-memory using packages/core (exact same formulas as recomputeEnrollment)
 * - Writes updates in a single Prisma transaction batch
 * Target: < 2s for 40 students on Neon.
 */
export async function recomputeCourseEnrollments(
  courseId: string,
  studentIds?: string[],
  now: Date = new Date(),
): Promise<RecomputeEnrollmentResult[]> {
  const studentFilter = studentIds && studentIds.length > 0 ? { in: studentIds } : undefined;

  // 1. Fetch assessments for course
  const assessments = await prisma.assessment.findMany({
    where: { courseId },
    select: {
      id: true,
      maxScore: true,
      weight: true,
      dueDate: true,
    },
    orderBy: { dueDate: "asc" },
  });

  // 2. Fetch enrollments for course
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      courseId,
      ...(studentFilter ? { studentId: studentFilter } : {}),
    },
    select: {
      id: true,
      studentId: true,
      courseId: true,
      riskCategory: true,
    },
  });

  if (enrollments.length === 0) return [];

  const targetStudentIds = enrollments.map((e) => e.studentId);

  // 3. Fetch attendance records in bulk
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      session: { courseId },
      studentId: { in: targetStudentIds },
    },
    select: {
      studentId: true,
      status: true,
    },
  });

  // 4. Fetch student scores in bulk
  const studentScores = await prisma.studentScore.findMany({
    where: {
      assessment: { courseId },
      studentId: { in: targetStudentIds },
    },
    select: {
      studentId: true,
      assessmentId: true,
      score: true,
    },
  });

  // Group attendance records by studentId
  const attendanceByStudent = new Map<string, { present: number; onDuty: number; total: number }>();
  for (const sId of targetStudentIds) {
    attendanceByStudent.set(sId, { present: 0, onDuty: 0, total: 0 });
  }
  for (const record of attendanceRecords) {
    const stats = attendanceByStudent.get(record.studentId);
    if (!stats) continue;
    stats.total++;
    if (record.status === AttendanceStatus.PRESENT) {
      stats.present++;
    } else if (
      record.status === AttendanceStatus.ON_DUTY ||
      record.status === AttendanceStatus.MEDICAL_LEAVE
    ) {
      stats.onDuty++;
    }
  }

  // Group scores by studentId -> Map<assessmentId, score>
  const scoresByStudent = new Map<string, Map<string, number>>();
  for (const sId of targetStudentIds) {
    scoresByStudent.set(sId, new Map());
  }
  for (const score of studentScores) {
    if (score.score !== null && score.score !== undefined) {
      scoresByStudent.get(score.studentId)?.set(score.assessmentId, score.score);
    }
  }

  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const pastDueAssessments = assessments.filter((a) => a.dueDate && a.dueDate < now);

  const results: RecomputeEnrollmentResult[] = [];
  const updatePromises = [];

  for (const enrollment of enrollments) {
    const sId = enrollment.studentId;
    const attStats = attendanceByStudent.get(sId) ?? { present: 0, onDuty: 0, total: 0 };
    const scoreMap = scoresByStudent.get(sId) ?? new Map<string, number>();

    // Attendance
    const attendanceRate = attendancePercent(attStats.present, attStats.onDuty, attStats.total);

    // Mastery
    const gradedComponents = assessments
      .filter((a) => scoreMap.has(a.id))
      .map((a) => ({
        score: scoreMap.get(a.id)!,
        maxScore: a.maxScore,
        weight: a.weight,
      }));
    const masteryScore = courseMastery(gradedComponents);

    // Velocity
    const componentsFourteenDaysAgo = assessments
      .filter((a) => a.dueDate && a.dueDate <= fourteenDaysAgo && scoreMap.has(a.id))
      .map((a) => ({
        score: scoreMap.get(a.id)!,
        maxScore: a.maxScore,
        weight: a.weight,
      }));
    const masteryFourteenDaysAgo =
      componentsFourteenDaysAgo.length > 0 ? courseMastery(componentsFourteenDaysAgo) : 0;
    const rawVelocity = (masteryScore - masteryFourteenDaysAgo) / 14;
    const velocity = Math.round(rawVelocity * 1000) / 1000;

    // Submission Deficit
    let submissionDeficit = 0;
    if (pastDueAssessments.length > 0) {
      const missingCount = pastDueAssessments.filter((a) => !scoreMap.has(a.id)).length;
      submissionDeficit = Math.round((missingCount / pastDueAssessments.length) * 1000) / 10;
    }

    // Risk calculation & Category overrides
    const riskInputs = academicMetricsToRiskInputs(
      attendanceRate,
      masteryScore,
      velocity,
      100 - submissionDeficit,
    );
    const riskResult = riskScore(riskInputs);
    let category = riskResult.category;
    if (
      negativeVelocityWarning(velocity) ||
      (attendanceRate <= 60 && masteryScore <= 35) ||
      riskResult.score >= 65
    ) {
      category = RiskCategory.CRITICAL;
    }

    results.push({
      studentId: sId,
      courseId,
      attendanceRate,
      masteryScore,
      velocity,
      submissionDeficit,
      riskScore: riskResult.score,
      riskCategory: category,
    });

    updatePromises.push(
      prisma.courseEnrollment.update({
        where: { id: enrollment.id },
        data: {
          attendanceRate,
          masteryScore,
          velocity,
          submissionDeficit,
          riskScore: riskResult.score,
          riskCategory: category,
        },
      }),
    );
  }

  // Execute all updates in one transaction
  await prisma.$transaction(updatePromises);

  for (const enr of enrollments) {
    const res = results.find((r) => r.studentId === enr.studentId);
    if (res) {
      await notifyMentorIfRiskWorsenedToCritical(
        enr.studentId,
        courseId,
        enr.riskCategory,
        res.riskCategory,
        now,
      );
    }
  }

  return results;
}

/**
 * Recompute all course enrollments across the entire database or for a specific course.
 */
export async function recomputeAllEnrollments(
  courseId?: string,
  now: Date = new Date(),
): Promise<number> {
  if (courseId) {
    const results = await recomputeCourseEnrollments(courseId, undefined, now);
    return results.length;
  }

  const courses = await prisma.course.findMany({ select: { id: true } });
  let total = 0;
  for (const c of courses) {
    const res = await recomputeCourseEnrollments(c.id, undefined, now);
    total += res.length;
  }
  return total;
}

/**
 * Creates an IN_APP notification for the student's active mentor when risk worsens to CRITICAL.
 * Deduped per student + course within 24 hours.
 */
export async function notifyMentorIfRiskWorsenedToCritical(
  studentId: string,
  courseId: string,
  previousRiskCategory: RiskCategory | null | undefined,
  newRiskCategory: RiskCategory,
  now: Date = new Date(),
): Promise<void> {
  // Only trigger if newly worsened to CRITICAL
  if (
    newRiskCategory !== RiskCategory.CRITICAL ||
    previousRiskCategory === RiskCategory.CRITICAL
  ) {
    return;
  }

  const mentorAssignment = await prisma.mentorAssignment.findFirst({
    where: { studentId, active: true },
    select: { mentorId: true },
  });

  if (!mentorAssignment) return;

  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentNotifications = await prisma.notification.findMany({
    where: {
      userId: mentorAssignment.mentorId,
      channel: "IN_APP",
      type: "RISK_CRITICAL_ALERT",
      createdAt: { gte: oneDayAgo },
    },
    select: { payload: true },
  });

  const isDuplicate = recentNotifications.some((n) => {
    const payload = n.payload as { studentId?: string; courseId?: string } | null;
    return payload?.studentId === studentId && payload?.courseId === courseId;
  });

  if (isDuplicate) return;

  const [student, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { name: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { code: true } }),
  ]);

  const deepLink = `/mentor/mentees/${studentId}`;

  await prisma.notification.create({
    data: {
      userId: mentorAssignment.mentorId,
      channel: "IN_APP",
      type: "RISK_CRITICAL_ALERT",
      link: deepLink,
      status: "PENDING",
      payload: {
        studentId,
        courseId,
        studentName: student?.name ?? "Student",
        courseCode: course?.code ?? "Course",
        message: `${student?.name ?? "A mentee"} has worsened to CRITICAL risk in ${course?.code ?? "a course"}.`,
      },
    },
  });
}
