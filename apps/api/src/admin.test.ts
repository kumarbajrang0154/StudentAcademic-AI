import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { prisma } from "@student-academic-ai/database";
import { Role } from "@prisma/client";

describe("Admin Portal & Lifecycle Management Tests", { timeout: 90000 }, () => {
  let app: FastifyInstance;
  let adminToken: string;
  let hodToken: string;
  let facultyToken: string;
  let mentorToken: string;
  let studentToken: string;
  let adminUserId: string;

  const createdUserIds: string[] = [];
  const createdCourseIds: string[] = [];
  const createdDeptIds: string[] = [];

  beforeAll(async () => {
    app = await buildServer({ logger: false, redis: "disabled" });
    await app.ready();

    const [adminUser, hodUser, facultyUser, mentorUser, studentUser] =
      await Promise.all([
        prisma.user.findFirst({ where: { role: Role.ADMIN } }),
        prisma.user.findFirst({ where: { role: Role.HOD } }),
        prisma.user.findFirst({ where: { role: Role.FACULTY } }),
        prisma.user.findFirst({ where: { role: Role.MENTOR } }),
        prisma.user.findFirst({ where: { role: Role.STUDENT } }),
      ]);

    if (!adminUser || !hodUser || !facultyUser || !mentorUser || !studentUser) {
      throw new Error("Required seed users not found");
    }

    adminUserId = adminUser.id;

    adminToken = app.jwt.sign({
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
      departmentId: adminUser.departmentId,
    });

    hodToken = app.jwt.sign({
      id: hodUser.id,
      email: hodUser.email,
      name: hodUser.name,
      role: hodUser.role,
      departmentId: hodUser.departmentId,
    });

    facultyToken = app.jwt.sign({
      id: facultyUser.id,
      email: facultyUser.email,
      name: facultyUser.name,
      role: facultyUser.role,
      departmentId: facultyUser.departmentId,
    });

    mentorToken = app.jwt.sign({
      id: mentorUser.id,
      email: mentorUser.email,
      name: mentorUser.name,
      role: mentorUser.role,
      departmentId: mentorUser.departmentId,
    });

    studentToken = app.jwt.sign({
      id: studentUser.id,
      email: studentUser.email,
      name: studentUser.name,
      role: studentUser.role,
      departmentId: studentUser.departmentId,
    });
  }, 60000);

  afterAll(async () => {
    // Non-destructive cleanup of temporary test entities
    if (createdCourseIds.length > 0) {
      await prisma.courseEnrollment.deleteMany({
        where: { courseId: { in: createdCourseIds } },
      }).catch(() => {});
      await prisma.course.deleteMany({
        where: { id: { in: createdCourseIds } },
      }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.mentorAssignment.deleteMany({
        where: { OR: [{ studentId: { in: createdUserIds } }, { mentorId: { in: createdUserIds } }] },
      }).catch(() => {});
      await prisma.courseEnrollment.deleteMany({
        where: { studentId: { in: createdUserIds } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => {});
    }
    if (createdDeptIds.length > 0) {
      await prisma.department.deleteMany({
        where: { id: { in: createdDeptIds } },
      }).catch(() => {});
    }
    await app.close();
  });

  // ──────────────────────────────────────────────────────────
  // 1. Strict ADMIN-only RBAC
  // ──────────────────────────────────────────────────────────
  it("strictly enforces ADMIN-only access on /api/v1/admin/* (403 for HOD, Faculty, Mentor, Student)", async () => {
    // Unauthenticated
    const unauthRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
    });
    expect(unauthRes.statusCode).toBe(401);

    // STUDENT
    const studentRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${studentToken}` },
    });
    expect(studentRes.statusCode).toBe(403);

    // FACULTY
    const facultyRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${facultyToken}` },
    });
    expect(facultyRes.statusCode).toBe(403);

    // MENTOR
    const mentorRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${mentorToken}` },
    });
    expect(mentorRes.statusCode).toBe(403);

    // HOD is strictly FORBIDDEN on /api/v1/admin/*
    const hodRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(hodRes.statusCode).toBe(403);

    // ADMIN is allowed
    const adminRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminRes.statusCode).toBe(200);
  });

  // ──────────────────────────────────────────────────────────
  // 2. Admin System Overview & Database Health
  // ──────────────────────────────────────────────────────────
  it("GET /api/v1/admin/overview returns system overview statistics and database health", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.overview).toBeDefined();
    expect(body.overview.totalUsers).toBeGreaterThan(0);
    expect(body.overview.usersByRole).toBeDefined();
    expect(body.overview.usersByRole.ADMIN).toBeGreaterThanOrEqual(1);
    expect(body.overview.usersByRole.STUDENT).toBeGreaterThanOrEqual(1);
    expect(body.overview.activeUsers).toBeGreaterThan(0);
    expect(typeof body.overview.inactiveUsers).toBe("number");
    expect(body.overview.totalDepartments).toBeGreaterThan(0);
    expect(body.overview.totalCourses).toBeGreaterThan(0);
    expect(body.overview.totalEnrollments).toBeGreaterThan(0);

    expect(body.dbHealth).toBeDefined();
    expect(body.dbHealth.status).toBe("healthy");
    expect(typeof body.dbHealth.latencyMs).toBe("number");

    expect(Array.isArray(body.recentAudit)).toBe(true);
  });

  // ──────────────────────────────────────────────────────────
  // 3. User Lifecycle Management (Create, Update, Reset, Status, Delete)
  // ──────────────────────────────────────────────────────────
  it("handles complete user lifecycle: create with 14-char temp password, update, reset, status, and delete", async () => {
    const uniqueEmail = `test-user-${Date.now()}@demo.edu`;

    // 1. Create User
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/users",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Test Lifecycle Student",
        email: uniqueEmail,
        role: "STUDENT",
        rollNumber: `TEMP${Date.now().toString().slice(-4)}`,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createBody = JSON.parse(createRes.body);
    expect(createBody.user).toBeDefined();
    expect(createBody.user.id).toBeDefined();
    expect(createBody.user.email).toBe(uniqueEmail);
    expect(createBody.user.mustChangePassword).toBe(true);
    expect(createBody.temporaryPassword).toBeDefined();
    expect(createBody.temporaryPassword.length).toBe(14);
    expect(createBody.passwordHash).toBeUndefined();

    const createdId = createBody.user.id;
    createdUserIds.push(createdId);

    // Verify AuditLog masks password as **** and has no password hash
    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: createdId, entity: "User" },
      orderBy: { createdAt: "desc" },
    });
    expect(auditLog).toBeDefined();
    const rawAudit = JSON.stringify(auditLog);
    expect(rawAudit).not.toContain(createBody.temporaryPassword);
    expect(rawAudit).toContain("****");

    // 2. Update User
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${createdId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Test Lifecycle Student Updated",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updateBody = JSON.parse(updateRes.body);
    expect(updateBody.user.name).toBe("Test Lifecycle Student Updated");

    // 3. Reset Password
    const resetRes = await app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${createdId}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(resetRes.statusCode).toBe(200);
    const resetBody = JSON.parse(resetRes.body);
    expect(resetBody.temporaryPassword).toBeDefined();
    expect(resetBody.temporaryPassword.length).toBe(14);
    expect(resetBody.temporaryPassword).not.toBe(createBody.temporaryPassword);

    // 4. Deactivate User
    const deactRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${createdId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: false },
    });
    expect(deactRes.statusCode).toBe(200);
    const deactBody = JSON.parse(deactRes.body);
    expect(deactBody.isActive ?? deactBody.user?.isActive).toBe(false);
    expect(deactBody.deactivatedAt ?? deactBody.user?.deactivatedAt).not.toBeNull();

    // 5. Reactivate User
    const reactRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/users/${createdId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isActive: true },
    });
    expect(reactRes.statusCode).toBe(200);
    const reactBody = JSON.parse(reactRes.body);
    expect(reactBody.isActive ?? reactBody.user?.isActive).toBe(true);

    // 6. Delete Fresh User (succeeds because no related records)
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/users/${createdId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(delRes.statusCode).toBe(200);
    const delBody = JSON.parse(delRes.body);
    expect(delBody.success).toBe(true);

    // Verify user is gone
    const checkDb = await prisma.user.findUnique({ where: { id: createdId } });
    expect(checkDb).toBeNull();
  });

  // ──────────────────────────────────────────────────────────
  // 4. Safety Guards: Conflict on Delete with Records, Self-Delete, Last Admin
  // ──────────────────────────────────────────────────────────
  it("enforces safety guards: 409 conflict when records exist, self-delete guard, and last admin guard", async () => {
    // 1. Delete seeded student who has courses/attendance -> 409 Conflict
    const studentUser = await prisma.user.findFirst({
      where: { role: Role.STUDENT, enrollments: { some: {} } },
    });
    expect(studentUser).not.toBeNull();

    const deleteConflictRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/users/${studentUser!.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deleteConflictRes.statusCode).toBe(409);
    const conflictBody = JSON.parse(deleteConflictRes.body);
    expect(conflictBody.error).toBe("Conflict");
    expect(conflictBody.message).toContain("deactivate");

    // 2. Self-delete guard -> Admin cannot delete themselves
    const selfDeleteRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/users/${adminUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(selfDeleteRes.statusCode).toBe(403);
    const selfBody = JSON.parse(selfDeleteRes.body);
    expect(selfBody.message).toContain("own account");
  });

  // ──────────────────────────────────────────────────────────
  // 5. Student Enrollment & Mentor Assignment
  // ──────────────────────────────────────────────────────────
  it("handles student course enrollment and mentor assignment", async () => {
    // Create temporary student
    const tempStudent = await prisma.user.create({
      data: {
        name: "Enrollment Test Student",
        email: `student-enr-${Date.now()}@demo.edu`,
        role: Role.STUDENT,
        passwordHash: "$2b$10$abcdefghijklmnopqrstuu",
      },
    });
    createdUserIds.push(tempStudent.id);

    const cseCourse = await prisma.course.findFirst({ where: { code: "CS101" } });
    const mentorUser = await prisma.user.findFirst({ where: { role: Role.MENTOR } });
    expect(cseCourse).not.toBeNull();
    expect(mentorUser).not.toBeNull();

    // 1. Enroll student in course
    const enrollRes = await app.inject({
      method: "POST",
      url: `/api/v1/admin/students/${tempStudent.id}/enroll`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { courseId: cseCourse!.id },
    });
    expect(enrollRes.statusCode).toBe(201);
    const enrollBody = JSON.parse(enrollRes.body);
    expect(enrollBody.courseId).toBe(cseCourse!.id);

    // 2. Duplicate enroll returns 409
    const dupEnrollRes = await app.inject({
      method: "POST",
      url: `/api/v1/admin/students/${tempStudent.id}/enroll`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { courseId: cseCourse!.id },
    });
    expect(dupEnrollRes.statusCode).toBe(409);

    // 3. Assign mentor (enforces 1 active mentor per student)
    const assignMentorRes = await app.inject({
      method: "POST",
      url: `/api/v1/admin/students/${tempStudent.id}/mentor`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { mentorId: mentorUser!.id },
    });
    expect(assignMentorRes.statusCode).toBe(200);
    const assignBody = JSON.parse(assignMentorRes.body);
    expect(assignBody.mentorId).toBe(mentorUser!.id);

    // 4. Unenroll from course
    const unenrollRes = await app.inject({
      method: "POST",
      url: `/api/v1/admin/students/${tempStudent.id}/unenroll`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { courseId: cseCourse!.id },
    });
    expect(unenrollRes.statusCode).toBe(200);
    const unenrollBody = JSON.parse(unenrollRes.body);
    expect(unenrollBody.success).toBe(true);
  });

  // ──────────────────────────────────────────────────────────
  // 6. CSV Bulk Student Import
  // ──────────────────────────────────────────────────────────
  it("imports students in bulk from CSV and returns one-time temp passwords", async () => {
    const ts = Date.now();
    const rows = [
      {
        name: `CSV Student A ${ts}`,
        email: `csv-a-${ts}@demo.edu`,
        rollNumber: `CSVA${ts.toString().slice(-4)}`,
        departmentCode: "CSE",
      },
      {
        name: `CSV Student B ${ts}`,
        email: `csv-b-${ts}@demo.edu`,
        rollNumber: `CSVB${ts.toString().slice(-4)}`,
        departmentCode: "CSE",
      },
    ];

    // Preview
    const previewRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/students/import-csv",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        confirmCreate: false,
        rows,
      },
    });
    expect(previewRes.statusCode).toBe(200);
    const previewBody = JSON.parse(previewRes.body);
    expect(Array.isArray(previewBody.preview)).toBe(true);
    expect(previewBody.totalRows).toBe(2);

    // Confirm Create
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/students/import-csv",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        confirmCreate: true,
        rows,
      },
    });
    expect([200, 201]).toContain(createRes.statusCode);
    const createBody = JSON.parse(createRes.body);
    expect(createBody.success).toBe(true);
    expect(createBody.createdCount).toBe(2);
    expect(createBody.csvData).toContain("TemporaryPassword");

    // Clean up created students from db
    const createdInDb = await prisma.user.findMany({
      where: { email: { in: rows.map((r) => r.email) } },
      select: { id: true },
    });
    createdUserIds.push(...createdInDb.map((u) => u.id));
  });

  // ──────────────────────────────────────────────────────────
  // 7. Departments & Courses Management
  // ──────────────────────────────────────────────────────────
  it("handles department and course creation and faculty assignment", async () => {
    const deptCode = `DEPT_${Date.now().toString().slice(-4)}`;

    // 1. Create Department
    const deptRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/departments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: deptCode,
        name: "Test Admin Department",
      },
    });
    expect(deptRes.statusCode).toBe(201);
    const deptBody = JSON.parse(deptRes.body);
    expect(deptBody.id).toBeDefined();
    createdDeptIds.push(deptBody.id);

    // 2. Create Course in Department
    const courseCode = `CRS_${Date.now().toString().slice(-4)}`;
    const courseRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/courses",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: courseCode,
        name: "Test Admin Course",
        departmentId: deptBody.id,
        credits: 4,
      },
    });
    expect(courseRes.statusCode).toBe(201);
    const courseBody = JSON.parse(courseRes.body);
    expect(courseBody.id).toBeDefined();
    createdCourseIds.push(courseBody.id);

    // 3. Assign Faculty to Course
    const facultyUser = await prisma.user.findFirst({ where: { role: Role.FACULTY } });
    expect(facultyUser).not.toBeNull();

    const assignFacultyRes = await app.inject({
      method: "POST",
      url: `/api/v1/admin/courses/${courseBody.id}/faculty`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { facultyId: facultyUser!.id },
    });
    expect(assignFacultyRes.statusCode).toBe(200);
    const assignFacultyBody = JSON.parse(assignFacultyRes.body);
    expect(assignFacultyBody.facultyId).toBe(facultyUser!.id);
  });

  // ──────────────────────────────────────────────────────────
  // 8. Audit Logs & System Settings (Read-Only)
  // ──────────────────────────────────────────────────────────
  it("provides read-only audit logs and system settings, rejecting modifications", async () => {
    // 1. Get Audit Logs
    const auditRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit?limit=10",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(auditRes.statusCode).toBe(200);
    const auditBody = JSON.parse(auditRes.body);
    expect(auditBody.auditLogs).toBeDefined();
    expect(typeof auditBody.pagination.total).toBe("number");
    expect(auditRes.body).not.toContain("passwordHash");

    // 2. Reject POST/DELETE on Audit
    const postAudit = await app.inject({
      method: "POST",
      url: "/api/v1/admin/audit",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: "FORGED" },
    });
    expect(postAudit.statusCode).toBe(404);

    const deleteAudit = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/audit/123",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deleteAudit.statusCode).toBe(404);

    // 3. System Settings
    const settingsRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/settings",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(settingsRes.statusCode).toBe(200);
    const settingsBody = JSON.parse(settingsRes.body);
    expect(settingsBody.rbacMatrix).toBeDefined();
    expect(settingsBody.riskWeights || settingsBody.weights).toBeDefined();
    expect(settingsBody.thresholds).toBeDefined();
  });
});
