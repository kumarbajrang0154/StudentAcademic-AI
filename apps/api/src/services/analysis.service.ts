import crypto from "node:crypto";
import { prisma } from "@student-academic-ai/database";
import { recomputeCourseEnrollments } from "./enrollment.service.js";

export interface AnalysisRunResult {
  runId: string;
  startedAt: Date;
  finishedAt: Date;
  enrollmentsProcessed: number;
  newWarnings: number;
  newCriticals: number;
  status: "COMPLETED" | "FAILED";
  error?: string;
  skippedCourses?: string[];
}

/**
 * Constant-time comparison for CRON_SECRET authentication.
 */
export function verifyCronSecret(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  const secret = process.env.CRON_SECRET || "cron_secret_student_academic_ai_production_key";

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);

  if (tokenBuf.length !== secretBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

/**
 * Runs bulk continuous analysis across all courses:
 * 1. Bulk recomputes all course enrollments (attendance, mastery, velocity, risk, derived fail-risk)
 * 2. Checks upcoming assessment deadlines (T-48h, T-24h, T-2h) and dispatches in-app notifications
 * 3. Records an AnalysisRun log entry with processed metrics
 */
export async function runContinuousAnalysis(now: Date = new Date()): Promise<AnalysisRunResult> {
  const startedAt = now;

  // Track initial notification counts to measure new alerts
  const [warnBefore, critBefore] = await Promise.all([
    prisma.notification.count({ where: { type: "ATTENDANCE_WARNING" } }),
    prisma.notification.count({ where: { type: "RISK_CRITICAL_ALERT" } }),
  ]);

  const runRecord = await prisma.analysisRun.create({
    data: {
      startedAt,
      status: "RUNNING",
    },
  });

  const skippedCourses: string[] = [];
  let enrollmentsProcessed = 0;

  try {
    // 1. Chunked bulk recompute for all courses (parallelized)
    const courses = await prisma.course.findMany({ select: { id: true, code: true } });

    const courseResults = await Promise.all(
      courses.map(async (c) => {
        try {
          const results = await recomputeCourseEnrollments(c.id, undefined, now);
          return { code: c.code, count: results.length, error: null };
        } catch (err: unknown) {
          console.error(`Skipping course chunk ${c.code} due to error:`, err);
          return { code: c.code, count: 0, error: err };
        }
      }),
    );

    for (const cr of courseResults) {
      if (cr.error) {
        skippedCourses.push(cr.code);
      } else {
        enrollmentsProcessed += cr.count;
      }
    }

    // 2. Upcoming assessment deadline notifications (T-48h, T-24h, T-2h)
    const upcomingAssessments = await prisma.assessment.findMany({
      where: {
        dueDate: {
          gte: now,
          lte: new Date(now.getTime() + 49 * 60 * 60 * 1000), // up to 48 hours
        },
      },
      include: {
        course: {
          include: {
            enrollments: { select: { studentId: true } },
          },
        },
      },
    });

    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const existingDeadlineNotifs = await prisma.notification.findMany({
      where: {
        channel: "IN_APP",
        type: "UPCOMING_DEADLINE",
        createdAt: { gte: oneDayAgo },
      },
      select: { userId: true, payload: true },
    });

    const notifsToCreate = [];

    for (const a of upcomingAssessments) {
      if (!a.dueDate) continue;
      const msUntil = a.dueDate.getTime() - now.getTime();
      let bucket: "T-2h" | "T-24h" | "T-48h" | null = null;

      if (msUntil <= 2.5 * 60 * 60 * 1000) {
        bucket = "T-2h";
      } else if (msUntil <= 25 * 60 * 60 * 1000) {
        bucket = "T-24h";
      } else if (msUntil <= 49 * 60 * 60 * 1000) {
        bucket = "T-48h";
      }

      if (!bucket) continue;

      for (const enr of a.course.enrollments) {
        const studentId = enr.studentId;

        const alreadyNotified = existingDeadlineNotifs.some((n) => {
          if (n.userId !== studentId) return false;
          const p = n.payload as { assessmentId?: string; bucket?: string } | null;
          return p?.assessmentId === a.id && p?.bucket === bucket;
        });

        if (!alreadyNotified) {
          const bucketHours = bucket === "T-2h" ? "2 hours" : bucket === "T-24h" ? "24 hours" : "48 hours";
          const message = `Reminder: ${a.course.code} assessment "${a.title}" is due in ${bucketHours}.`;

          notifsToCreate.push({
            userId: studentId,
            channel: "IN_APP" as const,
            type: "UPCOMING_DEADLINE",
            link: `/student/courses/${a.courseId}`,
            status: "PENDING" as const,
            payload: {
              assessmentId: a.id,
              courseCode: a.course.code,
              bucket,
              dueDate: a.dueDate.toISOString(),
              message,
            },
          });
        }
      }
    }

    if (notifsToCreate.length > 0) {
      await prisma.notification.createMany({ data: notifsToCreate });
    }

    // 3. Count newly created warnings & critical alerts
    const [warnAfter, critAfter] = await Promise.all([
      prisma.notification.count({ where: { type: "ATTENDANCE_WARNING" } }),
      prisma.notification.count({ where: { type: "RISK_CRITICAL_ALERT" } }),
    ]);

    const newWarnings = Math.max(0, warnAfter - warnBefore);
    const newCriticals = Math.max(0, critAfter - critBefore);
    const finishedAt = new Date();

    await prisma.analysisRun.update({
      where: { id: runRecord.id },
      data: {
        finishedAt,
        enrollmentsProcessed,
        newWarnings,
        newCriticals,
        status: "COMPLETED",
      },
    });

    return {
      runId: runRecord.id,
      startedAt,
      finishedAt,
      enrollmentsProcessed,
      newWarnings,
      newCriticals,
      status: "COMPLETED",
      skippedCourses: skippedCourses.length > 0 ? skippedCourses : undefined,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Continuous analysis failed";
    await prisma.analysisRun.update({
      where: { id: runRecord.id },
      data: {
        finishedAt: new Date(),
        status: "FAILED",
        error: errorMsg,
      },
    });

    return {
      runId: runRecord.id,
      startedAt,
      finishedAt: new Date(),
      enrollmentsProcessed,
      newWarnings: 0,
      newCriticals: 0,
      status: "FAILED",
      error: errorMsg,
      skippedCourses,
    };
  }
}

/**
 * Returns the last 10 continuous analysis runs.
 */
export async function getRecentAnalysisRuns(limit = 10) {
  return prisma.analysisRun.findMany({
    take: limit,
    orderBy: { startedAt: "desc" },
  });
}
