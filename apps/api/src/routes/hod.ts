import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireRole, AuthUser, canAccessDepartment } from "../lib/rbac.js";
import {
  getHodOverview,
  getHodStudents,
  getHodStudentDetail,
  exportHodStudentReport,
  getHodFacultyList,
  getHodFacultyDetail,
  exportHodFacultyReport,
} from "../services/hod.service.js";
import {
  getAdminEscalations,
  getAdminEscalationById,
  resolveAdminEscalation,
  getAdminCourses,
  getAdminInterventionsEfficacy,
  getAdminJobStatus,
} from "../services/admin.service.js";
import { triggerEscalationDispatch } from "../services/escalation.service.js";
import { getRiskExplanation } from "../services/student.service.js";
import { prisma } from "@student-academic-ai/database";
import {
  getCourseAccreditation,
  getProgramAccreditation,
} from "../services/accreditation.service.js";
import {
  getAttendanceReportData,
  exportAttendanceReport,
  getMarksReportData,
  exportMarksReport,
  getDepartmentAnalyticsData,
  exportDepartmentAnalyticsReport,
  exportAccreditationReport,
} from "../services/reports.service.js";
import { ExportFormat } from "../services/export.service.js";

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

export async function hodRoutes(app: FastifyInstance) {
  // All /hod routes require HOD or ADMIN role
  app.addHook("preHandler", requireRole("HOD", "ADMIN"));

  // 1. GET /api/v1/hod/overview
  app.get("/overview", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { departmentId?: string };

    try {
      const overview = await getHodOverview(user, query.departmentId);
      return reply.send(overview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load HOD overview";
      if (msg === "FORBIDDEN_NO_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "HOD must have an assigned department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 2. POST /api/v1/hod/escalate
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
          message: "Cannot trigger escalation for a student outside your department",
        });
      }
    }

    try {
      const result = await triggerEscalationDispatch({
        studentId,
        actorId: user.id,
        reason,
        severity,
        triggerChannels,
      });
      return reply.status(202).send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Escalation dispatch failed";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 3. GET /api/v1/hod/escalations
  app.get("/escalations", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as {
      departmentId?: string;
      status?: string;
      severity?: string;
      page?: string;
      limit?: string;
    };

    try {
      const data = await getAdminEscalations(
        user,
        query.status,
        query.page ? parseInt(query.page, 10) : 1,
        query.limit ? parseInt(query.limit, 10) : 20,
      );
      return reply.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load escalations";
      if (msg === "FORBIDDEN_NO_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "HOD must have an assigned department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 4. GET /api/v1/hod/escalations/:id
  app.get("/escalations/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as { id: string };

    try {
      const escalationCase = await getAdminEscalationById(user, id);
      return reply.send(escalationCase);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load escalation case";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Escalation case not found" });
      }
      if (msg === "FORBIDDEN_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "Access denied to this escalation case" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 5. PATCH /api/v1/hod/escalations/:id/resolve
  app.patch("/escalations/:id/resolve", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as { id: string };

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
        id,
        parseResult.data.status,
        parseResult.data.resolutionNote,
      );
      return reply.send(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resolve escalation";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Escalation case not found" });
      }
      if (msg === "FORBIDDEN_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "Access denied to this escalation case" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.patch("/escalations/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as { id: string };

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
        id,
        parseResult.data.status,
        parseResult.data.resolutionNote,
      );
      return reply.send(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resolve escalation";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Escalation case not found" });
      }
      if (msg === "FORBIDDEN_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "Access denied to this escalation case" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.get("/jobs/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const jobData = await getAdminJobStatus(id);
      return reply.send(jobData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Job not found" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 6. GET /api/v1/hod/students
  app.get("/students", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as {
      search?: string;
      risk?: string;
      page?: string;
      limit?: string;
      departmentId?: string;
    };

    try {
      const data = await getHodStudents(user, {
        search: query.search,
        risk: query.risk,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        departmentId: query.departmentId,
      });
      return reply.send(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load students";
      if (msg === "FORBIDDEN_NO_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "HOD must have an assigned department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 7. GET /api/v1/hod/students/:id
  app.get("/students/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as { id: string };

    try {
      const detail = await getHodStudentDetail(user, id);
      return reply.send(detail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load student details";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Student not found" });
      }
      if (msg === "FORBIDDEN_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "Access denied to student outside your department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 8. GET /api/v1/hod/students/:id/why
  app.get("/students/:id/why", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { courseId?: string };

    if (!query.courseId) {
      return reply.status(400).send({ error: "Bad Request", message: "courseId is required" });
    }

    try {
      const explanation = await getRiskExplanation(id, query.courseId);
      return reply.send(explanation);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load risk explanation";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 9. GET /api/v1/hod/students/:id/export
  app.get("/students/:id/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const query = request.query as { format?: string };

    const format = (query.format === "xlsx" ? "xlsx" : "pdf") as "pdf" | "xlsx";

    try {
      const result = await exportHodStudentReport(user, id, format);
      return reply
        .header("Content-Type", result.contentType)
        .header("Content-Disposition", `attachment; filename="${result.filename}"`)
        .send(result.buffer);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export student report";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Student not found" });
      }
      if (msg === "FORBIDDEN_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "Access denied to student outside your department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 10. GET /api/v1/hod/faculty
  app.get("/faculty", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { departmentId?: string };

    try {
      const list = await getHodFacultyList(user, query.departmentId);
      return reply.send(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load faculty list";
      if (msg === "FORBIDDEN_NO_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "HOD must have an assigned department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 11. GET /api/v1/hod/faculty/:id
  app.get("/faculty/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as { id: string };

    try {
      const detail = await getHodFacultyDetail(user, id);
      return reply.send(detail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load faculty report";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Faculty not found" });
      }
      if (msg === "FORBIDDEN_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "Access denied to faculty outside your department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 12. GET /api/v1/hod/faculty/:id/export
  app.get("/faculty/:id/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const query = request.query as { format?: string };

    const format = (query.format === "xlsx" ? "xlsx" : "pdf") as "pdf" | "xlsx";

    try {
      const result = await exportHodFacultyReport(user, id, format);
      return reply
        .header("Content-Type", result.contentType)
        .header("Content-Disposition", `attachment; filename="${result.filename}"`)
        .send(result.buffer);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export faculty report";
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Faculty not found" });
      }
      if (msg === "FORBIDDEN_DEPARTMENT") {
        return reply.status(403).send({ error: "Forbidden", message: "Access denied to faculty outside your department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 13. GET /api/v1/hod/courses
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

  // 14. GET /api/v1/hod/efficacy
  app.get("/efficacy", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    try {
      const efficacy = await getAdminInterventionsEfficacy(user);
      return reply.send(efficacy);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load intervention efficacy";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 15. Reports endpoints
  app.get("/reports/attendance", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { courseId?: string; format?: ExportFormat };
    if (!query.courseId) return reply.status(400).send({ error: "Bad Request", message: "courseId is required" });
    if (query.format) {
      try {
        const result = await exportAttendanceReport(query.courseId, query.format, user);
        return reply.header("Content-Type", result.contentType).header("Content-Disposition", `attachment; filename="${result.filename}"`).send(result.buffer);
      } catch (err: unknown) {
        return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
      }
    }
    try {
      const data = await getAttendanceReportData(query.courseId, user);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/reports/attendance/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { courseId?: string; format?: ExportFormat };
    if (!query.courseId) return reply.status(400).send({ error: "Bad Request", message: "courseId is required" });
    const format = query.format || "csv";
    try {
      const result = await exportAttendanceReport(query.courseId, format, user);
      return reply.header("Content-Type", result.contentType).header("Content-Disposition", `attachment; filename="${result.filename}"`).send(result.buffer);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/reports/marks", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { courseId?: string; format?: ExportFormat };
    if (!query.courseId) return reply.status(400).send({ error: "Bad Request", message: "courseId is required" });
    if (query.format) {
      try {
        const result = await exportMarksReport(query.courseId, query.format, user);
        return reply.header("Content-Type", result.contentType).header("Content-Disposition", `attachment; filename="${result.filename}"`).send(result.buffer);
      } catch (err: unknown) {
        return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
      }
    }
    try {
      const data = await getMarksReportData(query.courseId, user);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/reports/marks/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { courseId?: string; format?: ExportFormat };
    if (!query.courseId) return reply.status(400).send({ error: "Bad Request", message: "courseId is required" });
    const format = query.format || "csv";
    try {
      const result = await exportMarksReport(query.courseId, format, user);
      return reply.header("Content-Type", result.contentType).header("Content-Disposition", `attachment; filename="${result.filename}"`).send(result.buffer);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/reports/department-analytics", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { departmentId?: string; format?: ExportFormat };
    const deptId = user.departmentId || query.departmentId;
    if (!deptId) return reply.status(400).send({ error: "Bad Request", message: "departmentId is required" });
    if (query.format) {
      try {
        const result = await exportDepartmentAnalyticsReport(deptId, query.format, user);
        return reply.header("Content-Type", result.contentType).header("Content-Disposition", `attachment; filename="${result.filename}"`).send(result.buffer);
      } catch (err: unknown) {
        return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
      }
    }
    try {
      const data = await getDepartmentAnalyticsData(deptId, user);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/reports/department-analytics/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { departmentId?: string; format?: ExportFormat };
    const deptId = user.departmentId || query.departmentId;
    if (!deptId) return reply.status(400).send({ error: "Bad Request", message: "departmentId is required" });
    const format = query.format || "csv";
    try {
      const result = await exportDepartmentAnalyticsReport(deptId, format, user);
      return reply.header("Content-Type", result.contentType).header("Content-Disposition", `attachment; filename="${result.filename}"`).send(result.buffer);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  // 16. Accreditation endpoints
  app.get("/accreditation/program", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const deptId = user.departmentId || (request.query as { departmentId?: string }).departmentId;
    if (!deptId) return reply.status(400).send({ error: "Bad Request", message: "departmentId is required" });
    try {
      const data = await getProgramAccreditation(deptId, user);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/accreditation/course/:courseId", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { courseId } = request.params as { courseId: string };
    try {
      const data = await getCourseAccreditation(courseId, user);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/accreditation/:courseId", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { courseId } = request.params as { courseId: string };
    if (courseId === "program") {
      const deptId = user.departmentId || (request.query as { departmentId?: string }).departmentId;
      if (!deptId) return reply.status(400).send({ error: "Bad Request", message: "departmentId is required" });
      const data = await getProgramAccreditation(deptId, user);
      return reply.send(data);
    }
    try {
      const data = await getCourseAccreditation(courseId, user);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/accreditation/program/:departmentId", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const { departmentId } = request.params as { departmentId: string };
    if (user.role === "HOD" && user.departmentId !== departmentId) {
      return reply.status(403).send({ error: "Forbidden", message: "Access denied to other department accreditation" });
    }
    try {
      const data = await getProgramAccreditation(departmentId, user);
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/accreditation/export", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as AuthUser;
    const query = request.query as { courseId?: string; format?: ExportFormat };
    if (!query.courseId) return reply.status(400).send({ error: "Bad Request", message: "courseId is required" });
    const format = query.format || "csv";
    try {
      const result = await exportAccreditationReport(query.courseId, format, user);
      return reply.header("Content-Type", result.contentType).header("Content-Disposition", `attachment; filename="${result.filename}"`).send(result.buffer);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });
}
