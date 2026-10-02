import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AttendanceStatus } from "@student-academic-ai/database";
import {
  authenticate,
  requireRole,
  AuthUser,
} from "../lib/rbac.js";
import { recordAttendanceBatch } from "../services/faculty.service.js";
import { simulateAttendance } from "../services/student.service.js";

const AttendanceBatchSchema = z.object({
  courseId: z.string().min(1, "Course ID is required"),
  sessionDate: z.string().min(1, "Session date is required"),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1, "Student ID is required"),
        status: z.nativeEnum(AttendanceStatus),
        remarks: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .min(1, "At least one attendance entry is required"),
});

const AttendanceSimulatorSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
  studentId: z.string().optional(),
  hypotheticalMissedClasses: z.number().int().min(0).max(100),
  targetThreshold: z.number().min(50).max(100).default(75),
  currentAttended: z.number().int().min(0).optional(),
  currentTotal: z.number().int().min(0).optional(),
});

export const attendanceRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/attendance/batch
  app.post(
    "/batch",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const parseResult = AttendanceBatchSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message ?? "Invalid attendance batch payload",
        });
      }

      const { courseId, sessionDate, entries } = parseResult.data;

      try {
        const result = await recordAttendanceBatch(
          courseId,
          sessionDate,
          entries,
          user,
        );
        return reply.status(200).send(result);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 400 ? "Bad Request" : statusCode === 403 ? "Forbidden" : "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to record attendance batch",
        });
      }
    },
  );

  // POST /api/v1/attendance/simulator
  app.post(
    "/simulator",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const parseResult = AttendanceSimulatorSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message ?? "Invalid simulation parameters",
        });
      }

      const {
        courseId,
        hypotheticalMissedClasses,
        targetThreshold,
        currentAttended,
        currentTotal,
      } = parseResult.data;

      const studentId = user.role === "STUDENT" ? user.id : parseResult.data.studentId || user.id;

      try {
        const result = await simulateAttendance({
          studentId,
          courseId,
          hypotheticalMissedClasses,
          targetThreshold,
          currentAttended,
          currentTotal,
        });
        return reply.send(result);
      } catch (err: unknown) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Simulation failed",
        });
      }
    },
  );
};
