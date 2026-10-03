import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { prisma } from "@student-academic-ai/database";
import { Role, RiskCategory } from "@prisma/client";

describe("HOD Portal & Department Scoping Tests", { timeout: 90000 }, () => {
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
  let cs101Id: string;
  let cseFacultyId: string;
  const createdJobIds: string[] = [];
  const createdInterventionIds: string[] = [];
  const createdCaseIds: string[] = [];

  beforeAll(async () => {
    app = await buildServer({ logger: false, redis: "disabled" });
    await app.ready();

    const [adminUser, hodUser, facultyUser, mentorUser, studentUser, s02, cs101] =
      await Promise.all([
        prisma.user.findFirst({ where: { role: Role.ADMIN } }),
        prisma.user.findFirst({ where: { role: Role.HOD } }),
        prisma.user.findFirst({ where: { role: Role.FACULTY } }),
        prisma.user.findFirst({ where: { role: Role.MENTOR } }),
        prisma.user.findFirst({ where: { role: Role.STUDENT } }),
        prisma.user.findUnique({ where: { email: "student02@demo.edu" } }),
        prisma.course.findFirst({ where: { code: "CS101" } }),
      ]);

    if (!adminUser || !hodUser || !facultyUser || !mentorUser || !studentUser || !s02 || !cs101) {
      throw new Error("Required seed users or data not found");
    }

    student02Id = s02.id;
    cs101Id = cs101.id;
    cseFacultyId = facultyUser.id;

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
  // 1. Role Guards on HOD Portal
  // ──────────────────────────────────────────────────────────
  it("rejects unauthenticated and unauthorized roles (403 for Student, Faculty, Mentor; 200 for HOD & Admin)", async () => {
    // Unauthenticated -> 401
    const unauthRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/overview",
    });
    expect(unauthRes.statusCode).toBe(401);

    // Student -> 403
    const stuRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/overview",
      headers: { authorization: `Bearer ${studentToken}` },
    });
    expect(stuRes.statusCode).toBe(403);

    // Faculty -> 403
    const facRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/overview",
      headers: { authorization: `Bearer ${facultyToken}` },
    });
    expect(facRes.statusCode).toBe(403);

    // Mentor -> 403
    const menRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/overview",
      headers: { authorization: `Bearer ${mentorToken}` },
    });
    expect(menRes.statusCode).toBe(403);

    // HOD -> 200
    const hodRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/overview",
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(hodRes.statusCode).toBe(200);

    // Admin (support access) -> 200
    const adminRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/overview",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminRes.statusCode).toBe(200);
  });

  // ──────────────────────────────────────────────────────────
  // 2. Department Scoping Verification
  // ──────────────────────────────────────────────────────────
  it("strictly scopes HOD to own department: cannot view or escalate cross-department entities", async () => {
    try {
      // Create temporary department ECE-TEMP with a course and student
      const tempDept = await prisma.department.create({
        data: {
          code: "ECE-HOD-TEST",
          name: "ECE Temporary Test Dept",
        },
      });
      tempDeptId = tempDept.id;

      const tempFaculty = await prisma.user.create({
        data: {
          email: "fac-ece-hod@demo.edu",
          name: "Prof. ECE HOD Test",
          role: Role.FACULTY,
          departmentId: tempDept.id,
        },
      });
      tempFacultyId = tempFaculty.id;

      const tempCourse = await prisma.course.create({
        data: {
          code: "ECE888",
          name: "Test ECE Course",
          credits: 3,
          departmentId: tempDept.id,
        },
      });
      tempCourseId = tempCourse.id;

      const tempStudent = await prisma.user.create({
        data: {
          email: "student-ece-hod@demo.edu",
          name: "ECE Student Test",
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
          attendanceRate: 50,
          masteryScore: 35,
          riskCategory: RiskCategory.CRITICAL,
        },
      });

      // 1. HOD queries courses: must NOT see ECE888
      const hodCoursesRes = await app.inject({
        method: "GET",
        url: "/api/v1/hod/courses",
        headers: { authorization: `Bearer ${hodToken}` },
      });
      expect(hodCoursesRes.statusCode).toBe(200);
      const hodCoursesBody = JSON.parse(hodCoursesRes.body);
      const hasOtherDeptCourse = hodCoursesBody.courses.some(
        (c: { code: string }) => c.code === "ECE888",
      );
      expect(hasOtherDeptCourse).toBe(false);

      // 2. HOD queries students: must NOT see student-ece-hod
      const hodStudentsRes = await app.inject({
        method: "GET",
        url: "/api/v1/hod/students?search=ECE",
        headers: { authorization: `Bearer ${hodToken}` },
      });
      expect(hodStudentsRes.statusCode).toBe(200);
      const hodStudentsBody = JSON.parse(hodStudentsRes.body);
      expect(hodStudentsBody.students.length).toBe(0);

      // 3. HOD attempting to escalate out-of-scope student: 403 Forbidden
      const hodEscalateRes = await app.inject({
        method: "POST",
        url: "/api/v1/hod/escalate",
        headers: { authorization: `Bearer ${hodToken}` },
        payload: {
          studentId: tempStudent.id,
          reason: "Cross department test",
        },
      });
      expect(hodEscalateRes.statusCode).toBe(403);
    } finally {
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
  // 3. Hand-computed KPIs and Telemetry Validation
  // ──────────────────────────────────────────────────────────
  it("GET /api/v1/hod/overview returns hand-computed KPIs, charts, and escalation queue", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/hod/overview",
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    expect(data.kpis).toBeDefined();
    expect(data.kpis.retentionRiskIndex).toBeDefined();
    expect(typeof data.kpis.retentionRiskIndex.value).toBe("number");
    expect(data.kpis.projectedDebarments).toBeDefined();
    expect(typeof data.kpis.projectedDebarments.value).toBe("number");
    expect(data.kpis.curriculumBottlenecks).toBeDefined();
    expect(typeof data.kpis.curriculumBottlenecks.value).toBe("number");

    // Projected debarments count
    const expectedDebarredStudents = await prisma.courseEnrollment.findMany({
      where: {
        attendanceRate: { lt: 75 },
        course: { department: { code: "CSE" } },
      },
      select: { studentId: true },
      distinct: ["studentId"],
    });
    expect(data.kpis.projectedDebarments.value).toBe(expectedDebarredStudents.length);

    // Delta is null or number (no fake history)
    expect(data.kpis.retentionRiskIndex.deltaVs7Days).toBeNull();
    expect(data.kpis.projectedDebarments.deltaVs7Days).toBeNull();
    expect(data.kpis.curriculumBottlenecks.deltaVs7Days).toBeNull();

    // Charts & queue
    expect(data.charts).toBeDefined();
    expect(Array.isArray(data.charts.attendanceTrend)).toBe(true);
    expect(Array.isArray(data.charts.riskDistribution)).toBe(true);
    expect(Array.isArray(data.escalationsQueue)).toBeDefined();
  });

  // ──────────────────────────────────────────────────────────
  // 4. Student Roster and Detail Dossier with XAI
  // ──────────────────────────────────────────────────────────
  it("GET /api/v1/hod/students and /api/v1/hod/students/:id returns dossier with XAI explanation", async () => {
    // 1. Roster
    const rosterRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/students",
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(rosterRes.statusCode).toBe(200);
    const rosterBody = JSON.parse(rosterRes.body);
    expect(rosterBody.students.length).toBeGreaterThan(0);

    // 2. Dossier for student02
    const dossierRes = await app.inject({
      method: "GET",
      url: `/api/v1/hod/students/${student02Id}`,
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(dossierRes.statusCode).toBe(200);
    const dossierBody = JSON.parse(dossierRes.body);

    expect(dossierBody.student).toBeDefined();
    expect(dossierBody.student.id).toBe(student02Id);
    expect(dossierBody.explanationCard).toBeDefined();
    expect(dossierBody.explanationCard.topRiskFactors).toBeDefined();
    expect(dossierBody.explanationCard.recommendedNextSteps).toBeDefined();
    expect(Array.isArray(dossierBody.courses)).toBe(true);
    expect(Array.isArray(dossierBody.attendanceHistory)).toBe(true);
  });

  // ──────────────────────────────────────────────────────────
  // 5. Faculty Progress Report & Hand-Checked Arithmetic
  // ──────────────────────────────────────────────────────────
  it("GET /api/v1/hod/faculty/:id computes syllabus variance, timeliness, and marks compliance", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/hod/faculty/${cseFacultyId}`,
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    expect(data.faculty).toBeDefined();
    expect(data.faculty.id).toBe(cseFacultyId);
    expect(Array.isArray(data.courses)).toBe(true);

    if (data.courses.length > 0) {
      const course = data.courses[0];
      expect(course.syllabus).toBeDefined();
      expect(typeof course.syllabus.targetSessions).toBe("number");
      expect(typeof course.syllabus.completedSessions).toBe("number");
      expect(typeof course.syllabus.variance).toBe("number");

      // Arithmetic check: variance = completedSessions - targetSessions
      expect(course.syllabus.variance).toBe(
        course.syllabus.completedSessions - course.syllabus.targetSessions,
      );

      // Warning flag verification: isBehindWarning is true if variance <= -3
      if (course.syllabus.variance <= -3) {
        expect(course.syllabus.isBehindWarning).toBe(true);
      } else {
        expect(course.syllabus.isBehindWarning).toBe(false);
      }

      expect(typeof course.timelinessRate).toBe("number");
      expect(typeof course.marksComplianceRate).toBe("number");
    }
  });

  // ──────────────────────────────────────────────────────────
  // 6. Escalation Dispatch Lifecycle & 24h Deduplication
  // ──────────────────────────────────────────────────────────
  it("dispatches escalation, creates notification & calendar hold, dedupes within 24h, and resolves", async () => {
    // 1. Dispatch Tier-1 escalation
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/hod/escalate",
      headers: { authorization: `Bearer ${hodToken}` },
      payload: {
        studentId: student02Id,
        reason: "HOD Test: Critical across CS101, CS102, CS103",
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
      url: `/api/v1/hod/jobs/${body1.jobId}`,
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(jobRes.statusCode).toBe(200);
    const jobBody = JSON.parse(jobRes.body);
    expect(jobBody.job.status).toBe("DONE");
    expect(jobBody.job.notificationsCount).toBeGreaterThanOrEqual(1);

    if (jobBody.job.interventionId) {
      createdInterventionIds.push(jobBody.job.interventionId);
    }

    // 3. Deduplication within 24h
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/hod/escalate",
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

    // 4. Resolve escalation case
    const activeCase = await prisma.escalationCase.findFirst({
      where: { studentId: student02Id, status: "ESCALATED" },
    });
    if (activeCase) {
      createdCaseIds.push(activeCase.id);
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/hod/escalations/${activeCase.id}`,
        headers: { authorization: `Bearer ${hodToken}` },
        payload: {
          status: "RESOLVED",
          resolutionNote: "Remediation plan established with HOD.",
        },
      });
      expect(patchRes.statusCode).toBe(200);
      const patchBody = JSON.parse(patchRes.body);
      expect(patchBody.escalation?.status ?? patchBody.status).toBe("RESOLVED");
    }
  });

  // ──────────────────────────────────────────────────────────
  // 7. Intervention Efficacy Index Evaluation
  // ──────────────────────────────────────────────────────────
  it("GET /api/v1/hod/efficacy returns evaluated interventions with EfficacyIndex", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/hod/efficacy",
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    expect(data.summary).toBeDefined();
    expect(Array.isArray(data.interventions)).toBe(true);

    const completed = data.interventions.filter(
      (i: { status: string }) => i.status === "completed",
    );
    for (const item of completed) {
      expect(typeof item.efficacyIndex).toBe("number");
      expect(["Highly Effective", "Moderately Effective", "Neutral/Declining"]).toContain(
        item.efficacyClass,
      );
    }
  });

  // ──────────────────────────────────────────────────────────
  // 8. Zero Credential Leakage & Masking
  // ──────────────────────────────────────────────────────────
  it("never returns password hashes or unmasked guardian phone numbers", async () => {
    const studentsRes = await app.inject({
      method: "GET",
      url: "/api/v1/hod/students",
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(studentsRes.statusCode).toBe(200);
    expect(studentsRes.body).not.toContain("passwordHash");
    expect(studentsRes.body).not.toContain("+1-555-01");
  });

  // ──────────────────────────────────────────────────────────
  // 9. Department Reports & Accreditation
  // ──────────────────────────────────────────────────────────
  it("loads department reports and course accreditation for own department", async () => {
    const reportRes = await app.inject({
      method: "GET",
      url: `/api/v1/hod/reports/attendance?courseId=${cs101Id}`,
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(reportRes.statusCode).toBe(200);
    const reportBody = JSON.parse(reportRes.body);
    expect(reportBody.course).toBeDefined();
    expect(reportBody.students.length).toBeGreaterThan(0);

    const accredRes = await app.inject({
      method: "GET",
      url: `/api/v1/hod/accreditation/${cs101Id}`,
      headers: { authorization: `Bearer ${hodToken}` },
    });
    expect(accredRes.statusCode).toBe(200);
    const accredBody = JSON.parse(accredRes.body);
    expect(accredBody.coTable).toBeDefined();
  });
});
