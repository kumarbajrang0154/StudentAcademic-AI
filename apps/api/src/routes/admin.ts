import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireRole, AuthUser, canViewStudent, canAccessDepartment } from "../lib/rbac.js";
import {
  getAdminOverview,
  getAdminEscalations,
  getAdminEscalationById,
  resolveAdminEscalation,
  getAdminStudents,
  getAdminCourses,
  getAdminInterventionsEfficacy,
  getAdminAuditLogs,
  getAdminSettings,
  getAdminJobStatus,
} from "../services/admin.service.js";
import { triggerEscalationDispatch } from "../services/escalation.service.js";
import { getRiskExplanation } from "../services/student.service.js";
import { prisma } from "@student-academic-ai/database";

const EscalateSchema = z.object({
  studentId: z.string().min(1, "studentId is required"),
  reason: z.string().optional(),
  severity: z.enum(["STANDARD", "SEVERE"]).optional(),
  triggerChannels: z
    .array(z.enum(["IN_APP", "WHATSAPP", "SMS", "EMAIL"]))
    .optional(),
});

const ResolveEscalationSchema = z.object({
  status: z.enum(["RESOLVED", "CLOSED"]),
  resolutionNote: z
    .string()
    .min(5, "Resolution note is required (at least 5 characters)"),
});

export async function adminRoutes(app: FastifyInstance) {
  // All /admin routes require HOD or ADMIN role
  app.addHook("preHandler", requireRole("HOD", "ADMIN"));

  // 1. GET /api/v1/admin/overview
  app.get("/overview", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { departmentId?: string };

    try {
      const overview = await getAdminOverview(user, query.departmentId);
      return reply.send(overview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load admin overview";
      if (msg === "FORBIDDEN_NO_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "HOD must have an assigned department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 2. POST /api/v1/admin/escalate
  app.post("/escalate", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const parseResult = EscalateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: parseResult.error.errors[0]?.message || "Invalid payload",
      });
    }

    const { studentId, reason, severity, triggerChannels } = parseResult.data;

    // Verify student exists and scope check
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, departmentId: true },
    });

    if (!student) {
      return reply.status(404).send({ error: "Not Found", message: "Student not found" });
    }

    if (user.role === "HOD") {
      if (!student.departmentId || !canAccessDepartment(user, student.departmentId)) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Cannot escalate student outside your department scope",
        });
      }
    }

    try {
      const result = await triggerEscalationDispatch({
        studentId,
        reason,
        severity,
        triggerChannels,
        actorId: user.id,
      });

      return reply.status(202).send({
        jobId: result.jobId,
        status: result.status,
        estimatedDispatchMs: result.estimatedDispatchMs,
        deduplicated: result.deduplicated ?? false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to dispatch escalation";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 3. GET /api/v1/admin/jobs/:jobId
  app.get("/jobs/:jobId", async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { jobId: string };
    try {
      const res = await getAdminJobStatus(params.jobId);
      return reply.send(res);
    } catch {
      return reply.status(404).send({ error: "Not Found", message: "Job not found" });
    }
  });

  // 4. GET /api/v1/admin/escalations
  app.get("/escalations", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { status?: string; page?: string; limit?: string };
    const page = parseInt(query.page || "1", 10) || 1;
    const limit = parseInt(query.limit || "20", 10) || 20;

    try {
      const res = await getAdminEscalations(user, query.status, page, limit);
      return reply.send(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load escalations";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 5. GET /api/v1/admin/escalations/:id
  app.get("/escalations/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const params = request.params as { id: string };

    try {
      const res = await getAdminEscalationById(user, params.id);
      return reply.send(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Escalation case not found" });
      }
      if (msg === "FORBIDDEN") {
        return reply.status(403).send({ error: "Forbidden", message: "Access to this escalation case is restricted" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 6. PATCH /api/v1/admin/escalations/:id
  app.patch("/escalations/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const params = request.params as { id: string };

    const parseResult = ResolveEscalationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: parseResult.error.errors[0]?.message || "Invalid payload",
      });
    }

    try {
      const updated = await resolveAdminEscalation(
        user,
        params.id,
        parseResult.data.status,
        parseResult.data.resolutionNote,
      );
      return reply.send({ status: "ok", escalation: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Escalation case not found" });
      }
      if (msg === "FORBIDDEN") {
        return reply.status(403).send({ error: "Forbidden", message: "Access restricted" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 7. GET /api/v1/admin/students
  app.get("/students", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as {
      search?: string;
      risk?: string;
      courseId?: string;
      page?: string;
      limit?: string;
    };
    const page = parseInt(query.page || "1", 10) || 1;
    const limit = parseInt(query.limit || "20", 10) || 20;

    try {
      const res = await getAdminStudents(
        user,
        query.search,
        query.risk,
        query.courseId,
        page,
        limit,
      );
      return reply.send(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load students";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 8. GET /api/v1/admin/students/:id
  app.get("/students/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const params = request.params as { id: string };
    const query = request.query as { courseId?: string };

    const student = await prisma.user.findUnique({
      where: { id: params.id },
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
            submissionDeficit: true,
            course: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!student) {
      return reply.status(404).send({ error: "Not Found", message: "Student not found" });
    }

    if (!canViewStudent(user, student)) {
      return reply.status(403).send({ error: "Forbidden", message: "Access restricted" });
    }

    const targetCourseId = query.courseId || student.enrollments[0]?.courseId;
    let riskExplanation = null;
    if (targetCourseId) {
      try {
        riskExplanation = await getRiskExplanation(student.id, targetCourseId);
      } catch {
        riskExplanation = null;
      }
    }

    return reply.send({
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        department: student.department,
        enrollments: student.enrollments,
      },
      riskExplanation,
    });
  });

  // 9. GET /api/v1/admin/courses
  app.get("/courses", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    try {
      const courses = await getAdminCourses(user);
      return reply.send({ courses });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load courses";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 10. GET /api/v1/admin/interventions/efficacy
  app.get("/interventions/efficacy", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    try {
      const res = await getAdminInterventionsEfficacy(user);
      return reply.send(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to compute efficacy";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 11. GET /api/v1/admin/audit
  app.get("/audit", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as {
      entity?: string;
      actorId?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    };
    const page = parseInt(query.page || "1", 10) || 1;
    const limit = parseInt(query.limit || "20", 10) || 20;

    try {
      const res = await getAdminAuditLogs(
        user,
        query.entity,
        query.actorId,
        query.from,
        query.to,
        page,
        limit,
      );
      return reply.send(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load audit logs";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 12. GET /api/v1/admin/settings
  app.get("/settings", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = await getAdminSettings();
      return reply.send(settings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load settings";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });
}
