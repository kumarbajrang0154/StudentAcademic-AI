/**
 * Module 10: QR / Code Self Check-in routes
 *
 * Faculty routes (prefix: /api/v1/faculty/courses/:courseId/checkin):
 *   POST   /start           — open a check-in window
 *   POST   /close           — close the active window
 *   GET    /status          — poll: is window open? how many checked in?
 *   GET    /code            — get current rotating display code (faculty only, not proxied)
 *
 * Student route (prefix: /api/v1/student):
 *   POST   /checkin         — submit a code
 *
 * Rate limits:
 *   Student /checkin: 5 attempts per minute per IP (enforced by fastify-rate-limit per route)
 */

import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireRole, AuthUser, canAccessCourse } from "../lib/rbac.js";
import {
  startCheckinWindow,
  closeCheckinWindow,
  getCheckinStatus,
  getCheckinDisplayCode,
  studentSelfCheckin,
} from "../services/checkin.service.js";
import { prisma } from "@student-academic-ai/database";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const StartWindowSchema = z.object({
  sessionDate: z.string({
    required_error: "sessionDate is required (ISO date e.g. 2026-10-03)",
  }).min(1, "sessionDate is required (ISO date e.g. 2026-10-03)"),
  durationMin: z.number().int().min(1).max(120).optional(),
});

const StudentCheckinSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "code must be exactly 6 digits"),
});

// ─── Faculty Check-in Routes ──────────────────────────────────────────────────

export const checkinFacultyRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/faculty/courses/:courseId/checkin/start
   * Opens a new check-in window for the course.
   */
  app.post(
    "/:courseId/checkin/start",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as AuthUser;
      const { courseId } = request.params as { courseId: string };

      const parsed = StartWindowSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: parsed.error.errors[0]?.message ?? "Invalid input",
        });
      }

      // Verify faculty has access to this course
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: { sessions: { where: { facultyId: user.id }, take: 1 } },
      });

      const hasAccess =
        user.role === "ADMIN" ||
        user.role === "HOD" ||
        (course &&
          canAccessCourse(user, {
            id: courseId,
            departmentId: course.departmentId,
            facultyId: user.id,
            sessions: course.sessions,
          }));

      if (!hasAccess) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "You are not the assigned faculty for this course.",
        });
      }

      try {
        const result = await startCheckinWindow({
          courseId,
          sessionDate: parsed.data.sessionDate,
          durationMin: parsed.data.durationMin ?? 10,
          facultyId: user.id,
        });
        return reply.status(201).send({
          status: "ok",
          ...result,
          startsAt: result.startsAt.toISOString(),
          endsAt: result.endsAt.toISOString(),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to start check-in window";
        return reply.status(409).send({ error: "Conflict", message: msg });
      }
    }
  );

  /**
   * POST /api/v1/faculty/courses/:courseId/checkin/close
   * Body: { windowId }
   */
  app.post(
    "/:courseId/checkin/close",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as AuthUser;
      const body = request.body as { windowId?: string };

      if (!body.windowId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "windowId is required in request body",
        });
      }

      try {
        const result = await closeCheckinWindow(body.windowId, user.id);
        return reply.send({
          status: "ok",
          closedAt: result.closedAt.toISOString(),
          checkedInCount: result.checkedInCount,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to close window";
        return reply.status(400).send({ error: "Bad Request", message: msg });
      }
    }
  );

  /**
   * GET /api/v1/faculty/courses/:courseId/checkin/status
   * Poll for window status and checked-in count.
   */
  app.get(
    "/:courseId/checkin/status",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { courseId } = request.params as { courseId: string };
      try {
        const status = await getCheckinStatus(courseId);
        if (!status) {
          return reply.send({ status: "ok", window: null });
        }
        return reply.send({ status: "ok", window: status });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to get status";
        return reply.status(500).send({ error: "Internal Server Error", message: msg });
      }
    }
  );

  /**
   * GET /api/v1/faculty/courses/:courseId/checkin/code
   * Returns current rotating code. Only returned to the faculty who created the window.
   */
  app.get(
    "/:courseId/checkin/code",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as AuthUser;
      const { courseId: _courseId } = request.params as { courseId: string };
      const query = request.query as { windowId?: string };

      if (!query.windowId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "windowId query parameter is required",
        });
      }

      try {
        const result = await getCheckinDisplayCode(query.windowId, user.id);
        return reply.send({ status: "ok", ...result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to get code";
        const statusCode =
          err instanceof Error && msg.includes("Forbidden") ? 403 : 400;
        return reply.status(statusCode).send({ error: "Error", message: msg });
      }
    }
  );
};

// ─── Student Check-in Route ───────────────────────────────────────────────────

export const checkinStudentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/student/checkin
   * Rate-limited: 5 attempts per minute per IP.
   */
  app.post(
    "/checkin",
    {
      preHandler: [requireRole("STUDENT")],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) =>
            `checkin:${(req.headers["x-forwarded-for"] as string) || req.ip}`,
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: "Too Many Requests",
            message:
              "Too many check-in attempts. Please wait a minute before trying again.",
          }),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as AuthUser;

      const parsed = StudentCheckinSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: parsed.error.errors[0]?.message ?? "Invalid input",
        });
      }

      try {
        const result = await studentSelfCheckin({
          studentId: user.id,
          courseId: parsed.data.courseId,
          code: parsed.data.code,
        });
        return reply.send(result);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Check-in failed. Please try again.";
        const statusCode =
          err instanceof Error && "statusCode" in err
            ? (err as { statusCode: number }).statusCode
            : 400;
        return reply.status(statusCode).send({ error: "CheckinError", message: msg });
      }
    }
  );
};
