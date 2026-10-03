import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireRole, AuthUser } from "../lib/rbac.js";
import { Role } from "@prisma/client";
import {
  getAdminSystemOverview,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  resetAdminUserPassword,
  setAdminUserStatus,
  deleteAdminUser,
  enrollAdminStudent,
  unenrollAdminStudent,
  assignAdminMentor,
  importStudentsFromCsv,
  assignCourseFaculty,
  listAdminDepartments,
  createAdminDepartment,
  updateAdminDepartment,
  listAdminCourses,
  createAdminCourse,
  updateAdminCourse,
  deleteAdminCourse,
  getAdminAudit,
  getAdminSystemSettings,
} from "../services/admin-mgmt.service.js";
import { runContinuousAnalysis, getRecentAnalysisRuns } from "../services/analysis.service.js";

const CreateUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  role: z.enum(["STUDENT", "FACULTY", "MENTOR", "HOD", "ADMIN"]),
  departmentId: z.string().optional(),
  rollNumber: z.string().optional(),
  replaceExistingHead: z.boolean().optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["STUDENT", "FACULTY", "MENTOR", "HOD", "ADMIN"]).optional(),
  departmentId: z.string().nullable().optional(),
  rollNumber: z.string().nullable().optional(),
  replaceExistingHead: z.boolean().optional(),
});

const SetUserStatusSchema = z.object({
  isActive: z.boolean(),
});

const EnrollStudentSchema = z.object({
  courseId: z.string().min(1, "courseId is required"),
});

const AssignMentorSchema = z.object({
  mentorId: z.string().min(1, "mentorId is required"),
});

const ImportStudentsSchema = z.object({
  confirmCreate: z.boolean().default(false),
  rows: z.array(
    z.object({
      name: z.string(),
      email: z.string(),
      rollNumber: z.string().optional(),
      departmentCode: z.string().optional(),
    }),
  ),
});

const AssignFacultySchema = z.object({
  facultyId: z.string().nullable(),
});

const CreateDepartmentSchema = z.object({
  code: z.string().min(1, "Department code is required"),
  name: z.string().min(1, "Department name is required"),
  headId: z.string().optional(),
});

const UpdateDepartmentSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  headId: z.string().nullable().optional(),
  replaceExistingHead: z.boolean().optional(),
});

const CreateCourseSchema = z.object({
  code: z.string().min(1, "Course code is required"),
  name: z.string().min(1, "Course title is required"),
  credits: z.number().int().min(1).max(10).default(3),
  departmentId: z.string().min(1, "Department is required"),
  facultyId: z.string().optional(),
});

const UpdateCourseSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  credits: z.number().int().min(1).max(10).optional(),
  facultyId: z.string().nullable().optional(),
});

export async function adminRoutes(app: FastifyInstance) {
  // All /admin routes are strictly for ADMIN only!
  app.addHook("preHandler", requireRole("ADMIN"));

  // 1. System Overview & Health
  app.get("/overview", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await getAdminSystemOverview();
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  // 2. Continuous Analysis Trigger
  app.post("/analysis/run", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await runContinuousAnalysis();
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/analysis/runs", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const runs = await getRecentAnalysisRuns(10);
      return reply.send(runs);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  // 3. User Management
  app.get("/users", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      search?: string;
      role?: Role;
      departmentId?: string;
      status?: "ACTIVE" | "INACTIVE" | "ALL";
      page?: string;
      limit?: string;
    };

    try {
      const data = await getAdminUsers({
        search: query.search,
        role: query.role,
        departmentId: query.departmentId,
        status: query.status,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.post("/users", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const parsed = CreateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: parsed.error.errors[0]?.message || "Invalid payload",
      });
    }

    try {
      const result = await createAdminUser(actor, parsed.data);
      if ("requiresConfirmation" in result) {
        return reply.status(409).send(result);
      }
      return reply.status(201).send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "EMAIL_EXISTS") {
        return reply.status(409).send({ error: "Conflict", message: "Email already exists" });
      }
      if (msg === "HOD_REQUIRES_DEPARTMENT") {
        return reply.status(400).send({ error: "Bad Request", message: "HOD role requires a department" });
      }
      if (msg === "DEPARTMENT_NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "Department not found" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.patch("/users/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };

    const parsed = UpdateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: parsed.error.errors[0]?.message || "Invalid payload",
      });
    }

    try {
      const result = await updateAdminUser(actor, id, parsed.data);
      if ("requiresConfirmation" in result) {
        return reply.status(409).send(result);
      }
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "User not found" });
      }
      if (msg === "EMAIL_EXISTS") {
        return reply.status(409).send({ error: "Conflict", message: "Email already in use" });
      }
      if (msg === "CANNOT_MODIFY_SELF_ROLE") {
        return reply.status(403).send({ error: "Forbidden", message: "Cannot change your own administrator role" });
      }
      if (msg === "CANNOT_MODIFY_LAST_ADMIN") {
        return reply.status(403).send({ error: "Forbidden", message: "Cannot change role of the last active administrator" });
      }
      if (msg === "HOD_REQUIRES_DEPARTMENT") {
        return reply.status(400).send({ error: "Bad Request", message: "HOD role requires a department" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  const resetPasswordHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };

    try {
      const result = await resetAdminUserPassword(actor, id);
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "User not found" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  };

  app.patch("/users/:id/reset-password", resetPasswordHandler);
  app.post("/users/:id/reset-password", resetPasswordHandler);

  app.patch("/users/:id/status", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };

    const parsed = SetUserStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Bad Request",
        message: parsed.error.errors[0]?.message || "Invalid payload",
      });
    }

    try {
      const result = await setAdminUserStatus(actor, id, parsed.data.isActive);
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "CANNOT_MODIFY_SELF") {
        return reply.status(403).send({ error: "Forbidden", message: "Cannot deactivate your own account" });
      }
      if (msg === "CANNOT_DEACTIVATE_LAST_ADMIN") {
        return reply.status(403).send({ error: "Forbidden", message: "Cannot deactivate the last active administrator" });
      }
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "User not found" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.delete("/users/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };

    try {
      const result = await deleteAdminUser(actor, id);
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "CANNOT_MODIFY_SELF") {
        return reply.status(403).send({ error: "Forbidden", message: "Cannot delete your own account" });
      }
      if (msg === "CANNOT_DELETE_LAST_ADMIN") {
        return reply.status(403).send({ error: "Forbidden", message: "Cannot delete the last active administrator" });
      }
      if (msg === "HAS_RECORDS") {
        const details = (err as any).details || "User has dependent records; deactivate instead.";
        return reply.status(409).send({ error: "Conflict", message: details });
      }
      if (msg === "NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: "User not found" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 4. Student Management: Enrollments & Mentors
  app.post("/students/:id/enroll", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const parsed = EnrollStudentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }

    try {
      const enrollment = await enrollAdminStudent(actor, id, parsed.data.courseId);
      return reply.status(201).send(enrollment);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ALREADY_ENROLLED") {
        return reply.status(409).send({ error: "Conflict", message: "Student is already enrolled in this course" });
      }
      if (msg === "STUDENT_NOT_FOUND" || msg === "COURSE_NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: msg });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.post("/students/:id/unenroll", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const parsed = EnrollStudentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }

    try {
      const result = await unenrollAdminStudent(actor, id, parsed.data.courseId);
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NOT_ENROLLED") {
        return reply.status(404).send({ error: "Not Found", message: "Student is not enrolled in this course" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.post("/students/:id/mentor", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const parsed = AssignMentorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }

    try {
      const assignment = await assignAdminMentor(actor, id, parsed.data.mentorId);
      return reply.send(assignment);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "STUDENT_NOT_FOUND" || msg === "MENTOR_NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: msg });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.post("/students/import-csv", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const parsed = ImportStudentsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }

    try {
      const result = await importStudentsFromCsv(actor, parsed.data.rows, parsed.data.confirmCreate);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  // 5. Faculty Management
  app.post("/courses/:id/faculty", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const parsed = AssignFacultySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }

    try {
      const updated = await assignCourseFaculty(actor, id, parsed.data.facultyId);
      return reply.send(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "COURSE_NOT_FOUND" || msg === "FACULTY_NOT_FOUND") {
        return reply.status(404).send({ error: "Not Found", message: msg });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 6. Departments & Courses
  app.get("/departments", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await listAdminDepartments();
      return reply.send(list);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.post("/departments", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const parsed = CreateDepartmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }
    try {
      const dept = await createAdminDepartment(actor, parsed.data);
      return reply.status(201).send(dept);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "DEPT_CODE_EXISTS") {
        return reply.status(409).send({ error: "Conflict", message: "Department code already exists" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.patch("/departments/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const parsed = UpdateDepartmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }
    try {
      const updated = await updateAdminDepartment(actor, id, parsed.data);
      return reply.send(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NOT_FOUND") return reply.status(404).send({ error: "Not Found", message: "Department not found" });
      if (msg === "DEPT_CODE_EXISTS") return reply.status(409).send({ error: "Conflict", message: "Department code already exists" });
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.get("/courses", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await listAdminCourses();
      return reply.send(list);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.post("/courses", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const parsed = CreateCourseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }
    try {
      const course = await createAdminCourse(actor, parsed.data);
      return reply.status(201).send(course);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "COURSE_CODE_EXISTS") {
        return reply.status(409).send({ error: "Conflict", message: "Course code already exists" });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.patch("/courses/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };
    const parsed = UpdateCourseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Bad Request", message: parsed.error.errors[0]?.message });
    }
    try {
      const updated = await updateAdminCourse(actor, id, parsed.data);
      return reply.send(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NOT_FOUND") return reply.status(404).send({ error: "Not Found", message: "Course not found" });
      if (msg === "COURSE_CODE_EXISTS") return reply.status(409).send({ error: "Conflict", message: "Course code already exists" });
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  app.delete("/courses/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = request.user as AuthUser;
    const { id } = request.params as { id: string };
    try {
      const result = await deleteAdminCourse(actor, id);
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NOT_FOUND") return reply.status(404).send({ error: "Not Found", message: "Course not found" });
      if (msg === "HAS_RECORDS") {
        const details = (err as any).details || "Course has records; cannot be deleted.";
        return reply.status(409).send({ error: "Conflict", message: details });
      }
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });

  // 7. Audit Viewer & Settings
  app.get("/audit", async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      entity?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    };
    try {
      const data = await getAdminAudit({
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        entity: query.entity,
        action: query.action,
        startDate: query.startDate,
        endDate: query.endDate,
      });
      return reply.send(data);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });

  app.get("/settings", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const settings = getAdminSystemSettings();
      return reply.send(settings);
    } catch (err: unknown) {
      return reply.status(500).send({ error: "Internal Server Error", message: String(err) });
    }
  });
}
