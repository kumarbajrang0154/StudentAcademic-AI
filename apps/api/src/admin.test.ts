import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { prisma } from "@student-academic-ai/database";
import { Role, RiskCategory } from "@prisma/client";
import { ensureEscalationCase } from "./services/escalation.service.js";

describe("Module 7: HOD / Admin Portal & Escalation Management", { timeout: 45000 }, () => {
  let app: FastifyInstance;
  let adminToken: string;
  let hodToken: string;
  let facultyToken: string;
  let mentorToken: string;
  let studentToken: string;

  let tempDeptId: string | null = null;
  let tempCourseId: string | null = null;
  let tempFacultyId: string | null = null;
  let tempStudentId: string | null = null;

  let student02Id: string;
  const createdJobIds: string[] = [];
  const createdInterventionIds: string[] = [];
  const createdCaseIds: string[] = [];

  beforeAll(async () => {
    app = await buildServer({ logger: false, redis: "disabled" });
    await app.ready();

    const [adminUser, hodUser, facultyUser, mentorUser, studentUser, cseDept, s02] =
      await Promise.all([
        prisma.user.findFirst({ where: { role: Role.ADMIN } }),
        prisma.user.findFirst({ where: { role: Role.HOD } }),
        prisma.user.findFirst({ where: { role: Role.FACULTY } }),
        prisma.user.findFirst({ where: { role: Role.MENTOR } }),
        prisma.user.findFirst({ where: { role: Role.STUDENT } }),
        prisma.department.findUnique({ where: { code: "CSE" } }),
        prisma.user.findUnique({ where: { email: "student02@demo.edu" } }),
      ]);

    if (!adminUser || !hodUser || !facultyUser || !mentorUser || !studentUser || !cseDept || !s02) {
      throw new Error("Required seed users or department not found");
    }

    student02Id = s02.id;

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
    // Non-destructive cleanup of temporary items created during tests
    if (createdInterventionIds.length > 0) {
      await prisma.intervention.deleteMany({
        where: { id: { in: createdInterventionIds } },
      }).catch(() => {});
    }
    if (createdJobIds.length > 0) {
      await prisma.dispatchJob.deleteMany({
        where: { id: { in: createdJobIds } },
      }).catch(() => {});
    }
    if (createdCaseIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { caseId: { in: createdCaseIds } },
      }).catch(() => {});
      await prisma.escalationCase.deleteMany({
        where: { id: { in: createdCaseIds } },
      }).catch(() => {});
    }
    await app.close();
  });

  // ──────────────────────────────────────────────────────────
  // 1. Role Guards & Authentication Redirection Verification
  // ──────────────────────────────────────────────────────────
  it("rejects non-admin/HOD roles with 403 on /admin/* and 401 when unauthenticated", async () => {
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

    // HOD & ADMIN allowed
    const hodRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(hodRes.statusCode).toBe(200);

    const adminRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminRes.statusCode).toBe(200);
  });

  // ──────────────────────────────────────────────────────────
  // 2. Department Scoping with Temporary Second Department
  // ──────────────────────────────────────────────────────────
  it("strictly enforces canAccessDepartment: HOD cannot see second department; ADMIN can", async () => {
    try {
      // Ensure any leftovers from previous failed runs are cleaned up
      const prevStudent = await prisma.user.findUnique({ where: { email: "student-temp@demo.edu" } });
      if (prevStudent) {
        await prisma.courseEnrollment.deleteMany({ where: { studentId: prevStudent.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: prevStudent.id } }).catch(() => {});
      }
      const prevCourse = await prisma.course.findUnique({ where: { code: "ECE999" } });
      if (prevCourse) {
        await prisma.courseEnrollment.deleteMany({ where: { courseId: prevCourse.id } }).catch(() => {});
        await prisma.course.delete({ where: { id: prevCourse.id } }).catch(() => {});
      }
      const prevFaculty = await prisma.user.findUnique({ where: { email: "fac-temp@demo.edu" } });
      if (prevFaculty) {
        await prisma.user.delete({ where: { id: prevFaculty.id } }).catch(() => {});
      }
      const prevDept = await prisma.department.findUnique({ where: { code: "ECE-TEMP" } });
      if (prevDept) {
        await prisma.department.delete({ where: { id: prevDept.id } }).catch(() => {});
      }

      // Create temporary department ECE-TEMP
      const tempDept = await prisma.department.create({
        data: {
          code: "ECE-TEMP",
          name: "Temporary Electronics & Communication",
        },
      });
      tempDeptId = tempDept.id;

      const tempFaculty = await prisma.user.create({
        data: {
          email: "fac-temp@demo.edu",
          name: "Prof. Temp ECE",
          role: Role.FACULTY,
          departmentId: tempDept.id,
        },
      });
      tempFacultyId = tempFaculty.id;

      const tempCourse = await prisma.course.create({
        data: {
          code: "ECE999",
          name: "Signal Systems Temp",
          credits: 3,
          departmentId: tempDept.id,
        },
      });
      tempCourseId = tempCourse.id;

      const tempStudent = await prisma.user.create({
        data: {
          email: "student-temp@demo.edu",
          name: "Temp ECE Student",
          role: Role.STUDENT,
          departmentId: tempDept.id,
        },
      });
      tempStudentId = tempStudent.id;

      await prisma.courseEnrollment.create({
        data: {
          courseId: tempCourse.id,
          studentId: tempStudent.id,
          semester: "FALL",
          academicYear: "2026-2027",
          attendanceRate: 60,
          masteryScore: 40,
          riskCategory: RiskCategory.CRITICAL,
        },
      });

      // 1. HOD queries courses: must NOT see ECE999
      const hodCoursesRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/courses",
        headers: { authorization: `Bearer ${hodToken}` },
      });
      expect(hodCoursesRes.statusCode).toBe(200);
      const hodCoursesBody = JSON.parse(hodCoursesRes.body);
      const hodHasTemp = hodCoursesBody.courses.some((c: { code: string }) => c.code === "ECE999");
      expect(hodHasTemp).toBe(false);

      // 2. ADMIN queries courses: DOES see ECE999
      const adminCoursesRes = await app.inject({
        method: "GET",
        url: "/api/v1/admin/courses",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(adminCoursesRes.statusCode).toBe(200);
      const adminCoursesBody = JSON.parse(adminCoursesRes.body);
      const adminHasTemp = adminCoursesBody.courses.some((c: { code: string }) => c.code === "ECE999");
      expect(adminHasTemp).toBe(true);

      // 3. HOD queries students with search: must NOT see tempStudent
      const hodStudentsRes = await app.inject({
        method: "GET",
        url: `/api/v1/admin/students?search=Temp`,
        headers: { authorization: `Bearer ${hodToken}` },
      });
      expect(hodStudentsRes.statusCode).toBe(200);
      const hodStudentsBody = JSON.parse(hodStudentsRes.body);
      expect(hodStudentsBody.students.length).toBe(0);

      // 4. ADMIN queries students with search: DOES see tempStudent
      const adminStudentsRes = await app.inject({
        method: "GET",
        url: `/api/v1/admin/students?search=Temp`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(adminStudentsRes.statusCode).toBe(200);
      const adminStudentsBody = JSON.parse(adminStudentsRes.body);
      expect(adminStudentsBody.students.length).toBe(1);
      expect(adminStudentsBody.students[0].email).toBe("student-temp@demo.edu");

      // 5. HOD attempting to escalate out-of-scope student: 403 Forbidden
      const hodEscalateRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/escalate",
        headers: { authorization: `Bearer ${hodToken}` },
        payload: {
          studentId: tempStudent.id,
          reason: "Cross department test",
        },
      });
      expect(hodEscalateRes.statusCode).toBe(403);
    } finally {
      // Non-destructive cleanup: Delete temporary second department and rows so db:verify stays untouched!
      if (tempStudentId) {
        await prisma.courseEnrollment.deleteMany({ where: { studentId: tempStudentId } }).catch(() => {});
        await prisma.user.delete({ where: { id: tempStudentId } }).catch(() => {});
      }
      if (tempCourseId) {
        await prisma.course.delete({ where: { id: tempCourseId } }).catch(() => {});
      }
      if (tempFacultyId) {
        await prisma.user.delete({ where: { id: tempFacultyId } }).catch(() => {});
      }
      if (tempDeptId) {
        await prisma.department.delete({ where: { id: tempDeptId } }).catch(() => {});
      }
    }
  });

  // ──────────────────────────────────────────────────────────
  // 3. Escalation Helper Idempotency
  // ──────────────────────────────────────────────────────────
  it("ensureEscalationCase is idempotent and triggers when >= 3 critical courses", async () => {
    // student01 has only 1 critical course -> ensureEscalationCase creates no case
    const student01 = await prisma.user.findUnique({ where: { email: "student01@demo.edu" } });
    if (student01) {
      await ensureEscalationCase(student01.id);
      const s01Cases = await prisma.escalationCase.findMany({
        where: { studentId: student01.id, status: { in: ["OPEN", "ESCALATED"] } },
      });
      expect(s01Cases.length).toBe(0);
    }

    // student02 has 3 critical courses -> ensureEscalationCase creates exactly 1 case
    await ensureEscalationCase(student02Id);
    const s02CasesFirst = await prisma.escalationCase.findMany({
      where: { studentId: student02Id, status: { in: ["OPEN", "ESCALATED"] } },
    });
    expect(s02CasesFirst.length).toBe(1);
    createdCaseIds.push(s02CasesFirst[0]!.id);

    // Call again -> must remain exactly 1 case
    await ensureEscalationCase(student02Id);
    const s02CasesSecond = await prisma.escalationCase.findMany({
      where: { studentId: student02Id, status: { in: ["OPEN", "ESCALATED"] } },
    });
    expect(s02CasesSecond.length).toBe(1);
    expect(s02CasesSecond[0]!.id).toBe(s02CasesFirst[0]!.id);
  });

  // ──────────────────────────────────────────────────────────
  // 4. Escalation Dispatch Job Lifecycle & 24h Idempotency
  // ──────────────────────────────────────────────────────────
  it("escalation dispatch lifecycle works, sets notifications, hold, and dedupes within 24h", async () => {
    // 1. Dispatch Tier-1 escalation
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/admin/escalate",
      headers: { authorization: `Bearer ${hodToken}` },
      payload: {
        studentId: student02Id,
        reason: "Critical across CS101, CS102, CS103",
        severity: "STANDARD",
        triggerChannels: ["IN_APP"],
      },
    });

    expect(res1.statusCode).toBe(202);
    const body1 = JSON.parse(res1.body);
    expect(body1.jobId).toBeDefined();
    expect(body1.status).toBe("DONE");
    createdJobIds.push(body1.jobId);

    // 2. Poll job status
    const jobRes = await app.inject({
      method: "GET",
      url: `/api/v1/admin/jobs/${body1.jobId}`,
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(jobRes.statusCode).toBe(200);
    const jobBody = JSON.parse(jobRes.body);
    expect(jobBody.job.status).toBe("DONE");
    expect(jobBody.job.notificationsCount).toBeGreaterThanOrEqual(2);
    expect(jobBody.job.calendarHoldCreated).toBe(true);

    if (jobBody.job.interventionId) {
      createdInterventionIds.push(jobBody.job.interventionId);
    }

    // 3. Verify notifications were sent to mentor1
    const mentorUser = await prisma.user.findUnique({ where: { email: "mentor1@demo.edu" } });
    if (mentorUser) {
      const notif = await prisma.notification.findFirst({
        where: {
          userId: mentorUser.id,
          type: "ESCALATION_ALERT",
        },
      });
      expect(notif).toBeDefined();
      expect(notif?.status).toBe("SENT");
    }

    // 4. 24h Idempotency: Triggering again within 24h returns the existing job
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/admin/escalate",
      headers: { authorization: `Bearer ${hodToken}` },
      payload: {
        studentId: student02Id,
        reason: "Duplicate trigger within 24h",
      },
    });
    expect(res2.statusCode).toBe(202);
    const body2 = JSON.parse(res2.body);
    expect(body2.jobId).toBe(body1.jobId);
    expect(body2.deduplicated).toBe(true);

    // 5. Verify AuditLog entry EscalationTriggered
    const auditRow = await prisma.auditLog.findFirst({
      where: {
        entity: "EscalationCase",
        justification: { contains: "EscalationTriggered" },
      },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRow).toBeDefined();

    // 6. Resolve escalation case with PATCH
    const activeCase = await prisma.escalationCase.findFirst({
      where: { studentId: student02Id, status: "ESCALATED" },
    });
    expect(activeCase).toBeDefined();

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/escalations/${activeCase!.id}`,
      headers: { authorization: `Bearer ${hodToken}` },
      payload: {
        status: "RESOLVED",
        resolutionNote: "Student committed to mentor tutoring schedule and remediation plan.",
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = JSON.parse(patchRes.body);
    expect(patchBody.escalation.status).toBe("RESOLVED");
    expect(patchBody.escalation.resolutionNote).toBe(
      "Student committed to mentor tutoring schedule and remediation plan.",
    );
  });

  // ──────────────────────────────────────────────────────────
  // 5. Hand-computed KPI Validation
  // ──────────────────────────────────────────────────────────
  it("KPI tiles match documented definitions and seeded baseline values", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/overview",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    // projectedDebarments: distinct students with attendance < 75%
    const expectedDebarredStudents = await prisma.courseEnrollment.findMany({
      where: { attendanceRate: { lt: 75 } },
      select: { studentId: true },
      distinct: ["studentId"],
    });
    expect(data.kpis.projectedDebarments.value).toBe(expectedDebarredStudents.length);

    // curriculumBottlenecks: CS102 Unit 3 was seeded with 55% failure (> 40%)
    expect(data.kpis.curriculumBottlenecks.value).toBeGreaterThanOrEqual(1);

    // escalation queue must contain student02
    const s02InQueue = data.escalationsQueue.find(
      (s: { email: string }) => s.email === "student02@demo.edu",
    );
    expect(s02InQueue).toBeDefined();
    expect(s02InQueue.criticalCourseCount).toBe(3);

    // Check deltaVs7Days is null (no fake history)
    expect(data.kpis.retentionRiskIndex.deltaVs7Days).toBeNull();
    expect(data.kpis.projectedDebarments.deltaVs7Days).toBeNull();
    expect(data.kpis.curriculumBottlenecks.deltaVs7Days).toBeNull();
  });

  // ──────────────────────────────────────────────────────────
  // 6. Efficacy Page Calculation & Categories
  // ──────────────────────────────────────────────────────────
  it("GET /admin/interventions/efficacy returns evaluated rows with valid EfficacyIndex", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/interventions/efficacy",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    expect(data.summary.totalInterventions).toBeGreaterThanOrEqual(6);
    expect(data.interventions.length).toBeGreaterThanOrEqual(6);

    const evaluated = data.interventions.filter((i: { status: string }) => i.status === "completed");
    expect(evaluated.length).toBeGreaterThanOrEqual(1);

    for (const item of evaluated) {
      expect(item.effortHours).toBe(1);
      expect(typeof item.efficacyIndex).toBe("number");
      expect(["Highly Effective", "Moderately Effective", "Neutral/Declining"]).toContain(
        item.efficacyClass,
      );
    }
  });

  // ──────────────────────────────────────────────────────────
  // 7. Security: No Sensitive Fields and No Audit Mutations
  // ──────────────────────────────────────────────────────────
  it("never returns guardian phones or password hashes, and rejects audit mutations", async () => {
    // 1. Students endpoint
    const studentsRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/students",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(studentsRes.statusCode).toBe(200);
    const rawStudentsBody = studentsRes.body;
    expect(rawStudentsBody).not.toContain("passwordHash");
    expect(rawStudentsBody).not.toContain("+1-555-01"); // Seeded phone numbers masked

    // 2. Audit log endpoint
    const auditRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(auditRes.statusCode).toBe(200);
    const rawAuditBody = auditRes.body;
    expect(rawAuditBody).not.toContain("passwordHash");

    // 3. Verify no mutation routes exist for audit (append-only)
    const postAudit = await app.inject({
      method: "POST",
      url: "/api/v1/admin/audit",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { justification: "Unauthorized creation" },
    });
    expect(postAudit.statusCode).toBe(404);

    const deleteAudit = await app.inject({
      method: "DELETE",
      url: "/api/v1/admin/audit/123",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deleteAudit.statusCode).toBe(404);
  });
});
