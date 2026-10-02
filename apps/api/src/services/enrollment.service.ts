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
 * Recompute all course enrollments across the entire database or for a specific course.
 */
export async function recomputeAllEnrollments(
  courseId?: string,
  now: Date = new Date(),
): Promise<number> {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: courseId ? { courseId } : {},
    select: { studentId: true, courseId: true },
  });

  for (const enr of enrollments) {
    await recomputeEnrollment(enr.studentId, enr.courseId, now);
  }

  return enrollments.length;
}
