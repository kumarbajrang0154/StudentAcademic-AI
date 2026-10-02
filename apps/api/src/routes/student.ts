import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  authenticate,
  canViewStudent,
  AuthUser,
} from "../lib/rbac.js";
import { prisma } from "@student-academic-ai/database";
import {
  getStudentOverview,
  getStudentCourseDetail,
  simulateAttendance,
  getRiskExplanation,
  getStudentBenchmarks,
  getStudentPrescriptions,
  getStudentCalendar,
} from "../services/student.service.js";

const StudentIdQuerySchema = z.object({
  studentId: z.string().optional(),
});

const CourseParamSchema = z.object({
  courseId: z.string().min(1),
});

const CourseQuerySchema = z.object({
  courseId: z.string().min(1),
  studentId: z.string().optional(),
});

const StudentIdParamSchema = z.object({
  id: z.string().min(1),
});

const AttendanceSimulatorSchema = z.object({
  courseId: z.string().optional(),
  studentId: z.string().optional(),
  hypotheticalMissedClasses: z.number().int().min(0).default(0),
  targetThreshold: z.number().min(0).max(100).default(75),
  currentAttended: z.number().int().min(0).optional(),
  currentTotal: z.number().int().min(0).optional(),
});

/**
 * Resolves target student ID and enforces RBAC scope:
 * - A STUDENT can ONLY view their own records.
 * - Non-students (FACULTY, MENTOR, HOD, ADMIN) must have appropriate scope.
 */
async function resolveAndAuthorizeStudent(
  user: AuthUser,
  requestedStudentId?: string,
): Promise<{ authorized: boolean; studentId: string; errorStatus?: number; errorMessage?: string }> {
  const targetId = requestedStudentId || user.id;

  if (user.role === "STUDENT") {
    if (requestedStudentId && requestedStudentId !== user.id) {
      return {
        authorized: false,
        studentId: targetId,
        errorStatus: 403,
        errorMessage: "Students may only access their own records",
      };
    }
    return { authorized: true, studentId: user.id };
  }

  // For staff: verify student exists and check permission
  const student = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      departmentId: true,
      mentorAssignmentsAsStudent: { select: { mentorId: true, active: true } },
    },
  });

  if (!student) {
    return {
      authorized: false,
      studentId: targetId,
      errorStatus: 404,
      errorMessage: "Target student not found",
    };
  }

  const allowed = canViewStudent(user, {
    id: student.id,
    departmentId: student.departmentId,
    mentorAssignments: student.mentorAssignmentsAsStudent,
  });

  if (!allowed) {
    return {
      authorized: false,
      studentId: targetId,
      errorStatus: 403,
      errorMessage: "Insufficient privileges to view target student records",
    };
  }

  return { authorized: true, studentId: targetId };
}

export const studentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // 1. GET /api/v1/student/overview
  app.get(
    "/overview",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const parseResult = StudentIdQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message ?? "Invalid query parameters",
        });
      }

      const authCheck = await resolveAndAuthorizeStudent(user, parseResult.data.studentId);
      if (!authCheck.authorized) {
        return reply.status(authCheck.errorStatus ?? 403).send({
          statusCode: authCheck.errorStatus ?? 403,
          error: "Forbidden",
          message: authCheck.errorMessage,
        });
      }

      try {
        const overview = await getStudentOverview(authCheck.studentId);
        return reply.send(overview);
      } catch (err: unknown) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load student overview",
        });
      }
    },
  );

  // 2. GET /api/v1/student/courses/:courseId
  app.get(
    "/courses/:courseId",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const paramResult = CourseParamSchema.safeParse(request.params);
      const queryResult = StudentIdQuerySchema.safeParse(request.query);

      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid course ID parameter",
        });
      }

      const authCheck = await resolveAndAuthorizeStudent(
        user,
        queryResult.success ? queryResult.data.studentId : undefined,
      );
      if (!authCheck.authorized) {
        return reply.status(authCheck.errorStatus ?? 403).send({
          statusCode: authCheck.errorStatus ?? 403,
          error: "Forbidden",
          message: authCheck.errorMessage,
        });
      }

      try {
        const courseDetail = await getStudentCourseDetail(
          authCheck.studentId,
          paramResult.data.courseId,
        );
        return reply.send(courseDetail);
      } catch (err: unknown) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: err instanceof Error ? err.message : "Course detail not found",
        });
      }
    },
  );

  // 3. GET /api/v1/student/benchmarks?courseId=
  app.get(
    "/benchmarks",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const parseResult = CourseQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Missing or invalid courseId query parameter",
        });
      }

      const authCheck = await resolveAndAuthorizeStudent(user, parseResult.data.studentId);
      if (!authCheck.authorized) {
        return reply.status(authCheck.errorStatus ?? 403).send({
          statusCode: authCheck.errorStatus ?? 403,
          error: "Forbidden",
          message: authCheck.errorMessage,
        });
      }

      try {
        const benchmarks = await getStudentBenchmarks(
          authCheck.studentId,
          parseResult.data.courseId,
        );
        return reply.send(benchmarks);
      } catch (err: unknown) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: err instanceof Error ? err.message : "Course benchmarks not found",
        });
      }
    },
  );

  // 4. GET /api/v1/student/prescriptions
  app.get(
    "/prescriptions",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const queryResult = StudentIdQuerySchema.safeParse(request.query);
      const authCheck = await resolveAndAuthorizeStudent(
        user,
        queryResult.success ? queryResult.data.studentId : undefined,
      );
      if (!authCheck.authorized) {
        return reply.status(authCheck.errorStatus ?? 403).send({
          statusCode: authCheck.errorStatus ?? 403,
          error: "Forbidden",
          message: authCheck.errorMessage,
        });
      }

      try {
        const prescriptions = await getStudentPrescriptions(authCheck.studentId);
        return reply.send(prescriptions);
      } catch (err: unknown) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load prescriptions",
        });
      }
    },
  );

  // 5. GET /api/v1/student/calendar
  app.get(
    "/calendar",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const queryResult = StudentIdQuerySchema.safeParse(request.query);
      const authCheck = await resolveAndAuthorizeStudent(
        user,
        queryResult.success ? queryResult.data.studentId : undefined,
      );
      if (!authCheck.authorized) {
        return reply.status(authCheck.errorStatus ?? 403).send({
          statusCode: authCheck.errorStatus ?? 403,
          error: "Forbidden",
          message: authCheck.errorMessage,
        });
      }

      try {
        const calendar = await getStudentCalendar(authCheck.studentId);
        return reply.send(calendar);
      } catch (err: unknown) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load calendar",
        });
      }
    },
  );
};

/**
 * Top-level routes:
 * POST /api/v1/attendance/simulator
 * GET /api/v1/students/:id/risk-explanation?courseId=
 */
export const attendanceSimulatorRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
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

export const studentRiskRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/students/:id/risk-explanation?courseId=
  app.get(
    "/:id/risk-explanation",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const paramResult = StudentIdParamSchema.safeParse(request.params);
      const queryResult = CourseQuerySchema.safeParse(request.query);

      if (!paramResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid student ID parameter",
        });
      }

      if (!queryResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Missing courseId query parameter",
        });
      }

      const authCheck = await resolveAndAuthorizeStudent(user, paramResult.data.id);
      if (!authCheck.authorized) {
        return reply.status(authCheck.errorStatus ?? 403).send({
          statusCode: authCheck.errorStatus ?? 403,
          error: "Forbidden",
          message: authCheck.errorMessage,
        });
      }

      try {
        const explanation = await getRiskExplanation(
          paramResult.data.id,
          queryResult.data.courseId,
        );
        return reply.send(explanation);
      } catch (err: unknown) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: err instanceof Error ? err.message : "Risk explanation not found",
        });
      }
    },
  );
};
