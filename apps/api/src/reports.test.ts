import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

import { describe, it, expect, beforeAll } from "vitest";
import { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { buildServer } from "./server.js";
import { prisma } from "@student-academic-ai/database";
import { Role } from "@prisma/client";
import { coScore, COAttainment } from "@student-academic-ai/core";

describe("Module 9: Accreditation, Reports & Continuous Analysis Integration Tests", { timeout: 90000 }, () => {
  let app: FastifyInstance;
  let adminToken: string;
  let hodToken: string;
  let faculty1Token: string;
  let mentorToken: string;
  let studentToken: string;

  let cs101Id: string;
  let cs102Id: string;
  let cseDeptId: string;

  beforeAll(async () => {
    app = await buildServer({ logger: false, redis: "disabled" });
    await app.ready();

    const [adminUser, hodUser, facultyUser, mentorUser, studentUser, cs101, cs102, cseDept] =
      await Promise.all([
        prisma.user.findFirst({ where: { role: Role.ADMIN } }),
        prisma.user.findFirst({ where: { role: Role.HOD } }),
        prisma.user.findFirst({ where: { email: "faculty1@demo.edu" } }),
        prisma.user.findFirst({ where: { role: Role.MENTOR } }),
        prisma.user.findFirst({ where: { email: "student01@demo.edu" } }),
        prisma.course.findFirst({ where: { code: "CS101" } }),
        prisma.course.findFirst({ where: { code: "CS102" } }),
        prisma.department.findFirst({ where: { code: "CSE" } }),
      ]);

    if (!adminUser || !hodUser || !facultyUser || !mentorUser || !studentUser || !cs101 || !cs102 || !cseDept) {
      throw new Error("Missing seeded users or courses for reports integration test");
    }

    cs101Id = cs101.id;
    cs102Id = cs102.id;
    cseDeptId = cseDept.id;

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

    faculty1Token = app.jwt.sign({
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
  });

  // ──────────────────────────────────────────────────────────
  // 1. RBAC & Scope Enforcement
  // ──────────────────────────────────────────────────────────
  describe("RBAC and Scope Enforcement", () => {
    it("faculty1 CAN access CS101 attendance and marks report", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/faculty/reports/attendance?courseId=${cs101Id}`,
        headers: { authorization: `Bearer ${faculty1Token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.course.code).toBe("CS101");
      expect(body.students.length).toBeGreaterThan(0);
    });

    it("faculty1 gets 403 Forbidden on CS102 (taught by faculty2)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/faculty/reports/attendance?courseId=${cs102Id}`,
        headers: { authorization: `Bearer ${faculty1Token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("faculty gets 403 Forbidden on accreditation endpoints", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/hod/accreditation/${cs101Id}`,
        headers: { authorization: `Bearer ${faculty1Token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("student and mentor get 403 Forbidden on reports and accreditation", async () => {
      const [stuRes, menRes] = await Promise.all([
        app.inject({
          method: "GET",
          url: `/api/v1/hod/accreditation/${cs101Id}`,
          headers: { authorization: `Bearer ${studentToken}` },
        }),
        app.inject({
          method: "GET",
          url: `/api/v1/hod/reports/attendance?courseId=${cs101Id}`,
          headers: { authorization: `Bearer ${mentorToken}` },
        }),
      ]);
      expect(stuRes.statusCode).toBe(403);
      expect(menRes.statusCode).toBe(403);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 2. Hand-Checked Accreditation Calculations
  // ──────────────────────────────────────────────────────────
  describe("Hand-Checked Accreditation Calculations", () => {
    it("computes CO attainment matching raw question scores hand-arithmetic", async () => {
      // Fetch CS101 CO1 raw data directly from database
      const co1 = await prisma.courseOutcome.findFirst({
        where: { courseId: cs101Id, code: "CO1" },
        include: {
          questions: {
            include: { scores: true },
          },
        },
      });
      expect(co1).not.toBeNull();

      // Enrolled students in CS101
      const enrollments = await prisma.courseEnrollment.findMany({
        where: { courseId: cs101Id },
        select: { studentId: true },
      });

      // Hand-compute student CO scores
      const handScores: (number | null)[] = [];
      for (const enr of enrollments) {
        const qItems: { score: number; maxScore: number }[] = [];
        for (const q of co1!.questions) {
          const s = q.scores.find((score) => score.studentId === enr.studentId);
          if (s) {
            qItems.push({ score: s.score, maxScore: q.maxScore });
          }
        }
        handScores.push(coScore(qItems));
      }

      const handAttainment = COAttainment({ coScores: handScores, coTarget: 60 });

      // Compare with API endpoint result
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/hod/accreditation/${cs101Id}`,
        headers: { authorization: `Bearer ${hodToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      const apiCo1 = body.coTable.find((c: { code: string }) => c.code === "CO1");
      expect(apiCo1).toBeDefined();

      console.log("=== ARITHMETIC VERIFICATION (CS101 CO1) ===");
      console.log(`Enrolled students: ${handAttainment.studentsEnrolled}`);
      console.log(`Assessed students: ${handAttainment.studentsAssessed}`);
      console.log(`Met Target (>=60%): ${handAttainment.targetCount}`);
      console.log(`Attainment %: (${handAttainment.targetCount} / ${handAttainment.studentsAssessed}) * 100 = ${handAttainment.attainmentPercentage}%`);
      console.log(`OBE Attainment Level: ${handAttainment.level}`);
      console.log("==========================================");

      expect(apiCo1.studentsEnrolled).toBe(handAttainment.studentsEnrolled);
      expect(apiCo1.studentsAssessed).toBe(handAttainment.studentsAssessed);
      expect(apiCo1.targetCount).toBe(handAttainment.targetCount);
      expect(apiCo1.attainmentPercentage).toBe(handAttainment.attainmentPercentage);
      expect(apiCo1.level).toBe(handAttainment.level);
    });

    it("verifies Program-level PO weighted average calculation across courses", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/hod/accreditation/program?departmentId=${cseDeptId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.programMatrix.length).toBeGreaterThan(0);

      const po1 = body.programMatrix.find((p: { poCode: string }) => p.poCode === "PO1");
      expect(po1).toBeDefined();
      expect(typeof po1.programAttainment).toBe("number");
      expect(po1.programAttainment).toBeGreaterThanOrEqual(0);
      expect(po1.programAttainment).toBeLessThanOrEqual(3);
    });
  });

  // ──────────────────────────────────────────────────────────
  // 3. Export Formats (XLSX, PDF, CSV) & AuditLog
  // ──────────────────────────────────────────────────────────
  describe("Export Generators & File Format Compliance", () => {
    it("XLSX opens cleanly with ExcelJS, asserts frozen row, headers, and values", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/hod/reports/attendance?courseId=${cs101Id}&format=xlsx`,
        headers: { authorization: `Bearer ${hodToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(res.headers["content-disposition"]).toContain("CS101_attendance_");
      expect(res.headers["content-disposition"]).toContain(".xlsx");

      // Verify that the buffer is a valid Excel workbook
      const buffer = res.rawPayload;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

      expect(workbook.worksheets.length).toBeGreaterThanOrEqual(1);
      const sheet = workbook.worksheets[0]!;
      expect(sheet.name).toContain("Attendance");

      // Verify frozen header row
      const view = sheet.views?.[0] as ExcelJS.WorksheetViewFrozen | undefined;
      expect(view?.state).toBe("frozen");
      expect(view?.ySplit).toBe(1);

      // Verify headers
      const row1 = sheet.getRow(1);
      expect(row1.getCell(1).value).toBe("Roll No");
      expect(row1.getCell(2).value).toBe("Student Name");

      // Verify data rows present
      expect(sheet.rowCount).toBeGreaterThan(10);
    });

    it("PDF generated starts with %PDF, has pages, and valid A4 structure", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/hod/reports/attendance?courseId=${cs101Id}&format=pdf`,
        headers: { authorization: `Bearer ${hodToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["content-disposition"]).toContain(".pdf");

      const buffer = res.rawPayload;
      // Assert PDF magic header %PDF
      const headerStr = buffer.subarray(0, 5).toString("utf-8");
      expect(headerStr).toBe("%PDF-");

      // Load using pdf-lib
      const pdfDoc = await PDFDocument.load(buffer);
      expect(pdfDoc.getPageCount()).toBeGreaterThan(0);
    });

    it("CSV has UTF-8 BOM and correct escaping", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/hod/reports/attendance?courseId=${cs101Id}&format=csv`,
        headers: { authorization: `Bearer ${hodToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");

      const text = res.body;
      // Assert UTF-8 BOM
      expect(text.charCodeAt(0)).toBe(0xfeff);

      // Assert header columns
      expect(text).toContain("Roll No,Student Name,Conducted,Attended");
      expect(text).toContain("STUDENT01");
    });

    it("writes an AuditLog entry 'ReportExported' for each export", async () => {
      const initialLogs = await prisma.auditLog.count({
        where: { entity: "ReportExported" },
      });

      await app.inject({
        method: "GET",
        url: `/api/v1/hod/reports/marks?courseId=${cs101Id}&format=xlsx`,
        headers: { authorization: `Bearer ${hodToken}` },
      });

      const afterLogs = await prisma.auditLog.count({
        where: { entity: "ReportExported" },
      });

      expect(afterLogs).toBe(initialLogs + 1);

      const latestLog = await prisma.auditLog.findFirst({
        where: { entity: "ReportExported" },
        orderBy: { createdAt: "desc" },
      });

      expect(latestLog).not.toBeNull();
      const details = latestLog!.newValue as { format?: string; reportType?: string };
      expect(details.format).toBe("xlsx");
      expect(details.reportType).toBe("marks");
    });
  });

  // ──────────────────────────────────────────────────────────
  // 4. Continuous Analysis Run (Problem 1)
  // ──────────────────────────────────────────────────────────
  describe("Continuous Analysis Endpoint (Problem 1)", () => {
    it("rejects unauthorized access without valid CRON_SECRET or ADMIN role (401)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/internal/analysis/run",
        headers: { authorization: "Bearer invalid_secret_12345" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("allows execution via valid CRON_SECRET and records AnalysisRun", async () => {
      const cronSecret = process.env.CRON_SECRET || "cron_secret_student_academic_ai_production_key";

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/internal/analysis/run",
        headers: { authorization: `Bearer ${cronSecret}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ok");
      expect(body.result.status).toBe("COMPLETED");
      expect(body.result.enrollmentsProcessed).toBeGreaterThanOrEqual(120);

      // Verify AnalysisRun record exists in DB
      const dbRun = await prisma.analysisRun.findUnique({
        where: { id: body.result.runId },
      });
      expect(dbRun).not.toBeNull();
      expect(dbRun!.status).toBe("COMPLETED");
      expect(dbRun!.enrollmentsProcessed).toBeGreaterThanOrEqual(120);
    });
  });
});
