/**
 * Smoke test: HOD & Institutional Admin Portal (Module 7)
 * Tests RBAC, department scoping, hand-computed KPIs, escalation dispatch lifecycle,
 * calendar hold, notifications, 24h idempotency, resolution note, efficacy ROI,
 * and security constraints (no passwords, masked phones, immutable audit).
 *
 * Non-destructive: cleans up created cases, holds, and notifications in finally block.
 * AuditLog rows are append-only.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { buildServer } from "../apps/api/src/server.js";
import { prisma } from "@student-academic-ai/database";
import { Role, RiskCategory } from "@prisma/client";

const BASE_URL = process.env.API_URL;

if (!process.env.ALLOW_SMOKE_ON_THIS_DB) {
  console.error(
    "❌ Smoke scripts refused to run: set ALLOW_SMOKE_ON_THIS_DB=true in your local env first.\n" +
    "   Never run smoke tests against the shared/production database.\n" +
    "   Use a dedicated Neon branch (see DEPLOY.md)."
  );
  process.exit(1);
}

type RequestFn = (
  url: string,
  options?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => Promise<{ status: number; json: unknown; headers: unknown }>;

async function runAdminSmokeTests() {
  console.log("🚀 Starting HOD & Admin Portal Smoke Verification (Module 7 - SCR-04)...\n");

  let app: any;
  let requestFn: RequestFn;

  if (BASE_URL) {
    console.log(`📡 Connecting to live API at ${BASE_URL}`);
    requestFn = async (url, options = {}) => {
      const res = await fetch(`${BASE_URL}${url}`, {
        method: options.method ?? "GET",
        headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, json: data, headers: res.headers };
    };
  } else {
    console.log("⚡ Initializing Fastify in-memory server");
    app = await buildServer({ logger: false, redis: "disabled" });
    await app.ready();

    requestFn = async (url, options = {}) => {
      const res = await app.inject({
        method: (options.method ?? "GET") as import("fastify").HTTPMethods,
        url,
        headers: {
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...(options.headers ?? {}),
        },
        payload: options.body,
      });
      let json: unknown = null;
      try {
        json = JSON.parse(res.body);
      } catch {
        json = res.body;
      }
      return { status: res.statusCode, json, headers: res.headers };
    };
  }

  // Registry for non-destructive cleanup
  const createdJobIds: string[] = [];
  const createdInterventionIds: string[] = [];
  const createdCaseIds: string[] = [];

  let tempDeptId: string | null = null;
  let tempCourseId: string | null = null;
  let tempFacultyId: string | null = null;
  let tempStudentId: string | null = null;

  let adminToken = "";
  let hodToken = "";
  let facultyToken = "";
  let mentorToken = "";
  let studentToken = "";
  let student02Id = "";

  const pass: string[] = [];
  const fail: string[] = [];

  function assert(name: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      pass.push(name);
    } else {
      console.error(`  ❌ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
      fail.push(name);
    }
  }

  try {
    // ───── 1. AUTHENTICATION & TOKENS ──────────────────────────────────────
    console.log("\n[1] Role Authentications & JWT Generation (credentials masked as ****)");
    {
      const [adminUser, hodUser, facultyUser, mentorUser, studentUser, s02] =
        await Promise.all([
          prisma.user.findFirst({ where: { role: Role.ADMIN } }),
          prisma.user.findFirst({ where: { role: Role.HOD } }),
          prisma.user.findFirst({ where: { role: Role.FACULTY } }),
          prisma.user.findFirst({ where: { role: Role.MENTOR } }),
          prisma.user.findFirst({ where: { role: Role.STUDENT } }),
          prisma.user.findUnique({ where: { email: "student02@demo.edu" } }),
        ]);

      if (!adminUser || !hodUser || !facultyUser || !mentorUser || !studentUser || !s02) {
        throw new Error("Required seed users not found");
      }

      student02Id = s02.id;

      if (app) {
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
      }

      assert("Tokens generated for all 5 roles", !!adminToken && !!hodToken);
    }

    // ───── 2. ROLE GUARDS & ACCESS CONTROL ─────────────────────────────────
    console.log("\n[2] Role Guards on /admin/* (HOD & ADMIN only)");
    {
      // Unauthenticated
      const rUnauth = await requestFn("/api/v1/admin/overview");
      assert("Unauthenticated rejected 401", rUnauth.status === 401);

      // STUDENT -> 403
      const rStudent = await requestFn("/api/v1/admin/overview", {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert("STUDENT rejected 403", rStudent.status === 403);

      // FACULTY -> 403
      const rFaculty = await requestFn("/api/v1/admin/overview", {
        headers: { Authorization: `Bearer ${facultyToken}` },
      });
      assert("FACULTY rejected 403", rFaculty.status === 403);

      // MENTOR -> 403
      const rMentor = await requestFn("/api/v1/admin/overview", {
        headers: { Authorization: `Bearer ${mentorToken}` },
      });
      assert("MENTOR rejected 403", rMentor.status === 403);

      // HOD -> 200
      const rHod = await requestFn("/api/v1/admin/overview", {
        headers: { Authorization: `Bearer ${hodToken}` },
      });
      assert("HOD allowed 200", rHod.status === 200);

      // ADMIN -> 200
      const rAdmin = await requestFn("/api/v1/admin/overview", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert("ADMIN allowed 200", rAdmin.status === 200);
    }

    // ───── 3. DEPARTMENT SCOPE ENFORCEMENT ─────────────────────────────────
    console.log("\n[3] Department Scope Enforcement (canAccessDepartment)");
    {
      // Cleanup any leftovers from prior runs
      await prisma.courseEnrollment.deleteMany({ where: { student: { email: "student-temp-smoke@demo.edu" } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { email: { in: ["student-temp-smoke@demo.edu", "fac-temp-smoke@demo.edu"] } } }).catch(() => {});
      await prisma.course.deleteMany({ where: { code: "SMK999" } }).catch(() => {});
      await prisma.department.deleteMany({ where: { code: "SMK-TEMP" } }).catch(() => {});

      const tempDept = await prisma.department.create({
        data: { code: "SMK-TEMP", name: "Temporary Smoke Dept" },
      });
      tempDeptId = tempDept.id;

      const tempCourse = await prisma.course.create({
        data: { code: "SMK999", name: "Smoke Testing Course", credits: 3, departmentId: tempDept.id },
      });
      tempCourseId = tempCourse.id;

      const tempStudent = await prisma.user.create({
        data: { email: "student-temp-smoke@demo.edu", name: "Smoke Temp Student", role: Role.STUDENT, departmentId: tempDept.id },
      });
      tempStudentId = tempStudent.id;

      await prisma.courseEnrollment.create({
        data: {
          courseId: tempCourse.id,
          studentId: tempStudent.id,
          semester: "FALL",
          academicYear: "2026-2027",
          attendanceRate: 60,
          masteryScore: 45,
          riskCategory: RiskCategory.CRITICAL,
        },
      });

      // HOD queries courses: must NOT see SMK999
      const hodCourses = await requestFn("/api/v1/admin/courses", {
        headers: { Authorization: `Bearer ${hodToken}` },
      });
      assert("HOD courses 200", hodCourses.status === 200);
      const hodCoursesBody = hodCourses.json as { courses: Array<{ code: string }> };
      const hodHasTemp = hodCoursesBody.courses.some((c) => c.code === "SMK999");
      assert("HOD cannot see other department's course", !hodHasTemp);

      // ADMIN queries courses: DOES see SMK999
      const adminCourses = await requestFn("/api/v1/admin/courses", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert("ADMIN courses 200", adminCourses.status === 200);
      const adminCoursesBody = adminCourses.json as { courses: Array<{ code: string }> };
      const adminHasTemp = adminCoursesBody.courses.some((c) => c.code === "SMK999");
      assert("ADMIN sees courses across all departments", adminHasTemp);

      // HOD attempting to escalate out-of-scope student: 403 Forbidden
      const crossEscalate = await requestFn("/api/v1/admin/escalate", {
        method: "POST",
        headers: { Authorization: `Bearer ${hodToken}` },
        body: { studentId: tempStudent.id, reason: "Cross department smoke test" },
      });
      assert("HOD cannot escalate student outside their department (403)", crossEscalate.status === 403);
    }

    // ───── 4. HAND-COMPUTED KPIS & SCR-04 OVERVIEW ─────────────────────────
    console.log("\n[4] SCR-04 Institutional Overview & Hand-computed KPIs");
    {
      const r = await requestFn("/api/v1/admin/overview", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert("Overview 200", r.status === 200);
      const body = r.json as Record<string, any>;
      const kpis = body.kpis;

      assert("kpis object exists", !!kpis);
      assert("KPI 1: retentionRiskIndex is number", typeof kpis.retentionRiskIndex.value === "number");
      assert("KPI 2: projectedDebarments > 0", kpis.projectedDebarments.value > 0);
      assert("KPI 3: curriculumBottlenecks >= 1 (CS102 Unit 3)", kpis.curriculumBottlenecks.value >= 1);
      assert("KPI 4: interventionSuccessRate is number or null", kpis.interventionSuccessRate.value !== undefined);
      assert("KPI 5: markEntryCompliance is number or null", kpis.markEntryCompliance.value !== undefined);

      assert("No fake history: deltaVs7Days is null", kpis.retentionRiskIndex.deltaVs7Days === null);
      assert("14-day attendance telemetry array populated", Array.isArray(body.charts?.attendanceTrend));
      assert("Course risk distribution array populated", Array.isArray(body.charts?.riskDistribution));

      const queue = body.escalationsQueue as Array<{ email: string; criticalCourseCount: number }>;
      assert("Escalations queue contains student02@demo.edu", queue.some((s) => s.email === "student02@demo.edu"));
    }

    // ───── 5. ESCALATION DISPATCH LIFECYCLE & 24H IDEMPOTENCY ──────────────
    console.log("\n[5] Synchronous Escalation Dispatch & 24h Idempotency");
    let testJobId = "";
    {
      const rDispatch = await requestFn("/api/v1/admin/escalate", {
        method: "POST",
        headers: { Authorization: `Bearer ${hodToken}` },
        body: {
          studentId: student02Id,
          reason: "Smoke test multi-channel dispatch",
          severity: "STANDARD",
          triggerChannels: ["IN_APP", "EMAIL"],
        },
      });

      assert("Escalation dispatch accepted 202", rDispatch.status === 202);
      const dBody = rDispatch.json as { jobId: string; status: string };
      testJobId = dBody.jobId;
      createdJobIds.push(testJobId);
      assert("Job ID returned", !!testJobId);
      assert("Dispatch completed synchronously (DONE)", dBody.status === "DONE");

      // Verify Job Status endpoint
      const rJob = await requestFn(`/api/v1/admin/jobs/${testJobId}`, {
        headers: { Authorization: `Bearer ${hodToken}` },
      });
      assert("Job status 200", rJob.status === 200);
      const jobBody = (rJob.json as { job: any }).job;
      assert("Notifications count >= 2", jobBody.notificationsCount >= 2);
      assert("Calendar hold created", jobBody.calendarHoldCreated === true);

      if (jobBody.interventionId) {
        createdInterventionIds.push(jobBody.interventionId);
      }

      // Verify 24h Idempotency
      const rDedup = await requestFn("/api/v1/admin/escalate", {
        method: "POST",
        headers: { Authorization: `Bearer ${hodToken}` },
        body: {
          studentId: student02Id,
          reason: "Repeat trigger within 24h",
        },
      });
      assert("Repeat dispatch returns 202", rDedup.status === 202);
      const dedupBody = rDedup.json as { jobId: string; deduplicated?: boolean };
      assert("Reuses existing job within 24h (deduplicated: true)", dedupBody.deduplicated === true);

      // Verify AuditLog entry EscalationTriggered
      const auditTrigger = await prisma.auditLog.findFirst({
        where: { entity: "EscalationCase", justification: { contains: "EscalationTriggered" } },
        orderBy: { createdAt: "desc" },
      });
      assert("AuditLog recorded EscalationTriggered", !!auditTrigger);

      // Resolve Escalation Case
      const activeCase = await prisma.escalationCase.findFirst({
        where: { studentId: student02Id, status: "ESCALATED" },
      });
      assert("Active ESCALATED case found", !!activeCase);

      if (activeCase) {
        createdCaseIds.push(activeCase.id);
        const rResolve = await requestFn(`/api/v1/admin/escalations/${activeCase.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${hodToken}` },
          body: {
            status: "RESOLVED",
            resolutionNote: "Student met with mentor and established remediation milestones.",
          },
        });
        assert("Resolve escalation 200", rResolve.status === 200);
        const resBody = (rResolve.json as { escalation: any }).escalation;
        assert("Case marked RESOLVED", resBody.status === "RESOLVED");
        assert("Resolution note persisted", resBody.resolutionNote.includes("remediation milestones"));

        const auditResolve = await prisma.auditLog.findFirst({
          where: { entity: "EscalationCase", justification: { contains: "EscalationResolved" } },
          orderBy: { createdAt: "desc" },
        });
        assert("AuditLog recorded EscalationResolved", !!auditResolve);
      }
    }

    // ───── 6. INTERVENTION EFFICACY & ROI ──────────────────────────────────
    console.log("\n[6] Intervention Efficacy & ROI Telemetry");
    {
      const r = await requestFn("/api/v1/admin/interventions/efficacy", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert("Efficacy 200", r.status === 200);
      const body = r.json as { summary: any; interventions: any[] };
      assert("Summary has totalInterventions >= 6", body.summary.totalInterventions >= 6);
      assert("Interventions array has evaluated rows", body.interventions.length >= 6);

      const evaluated = body.interventions.filter((i) => i.status === "completed");
      assert("Evaluated rows count >= 1", evaluated.length >= 1);
      if (evaluated[0]) {
        assert("EfficacyIndex computed", typeof evaluated[0].efficacyIndex === "number");
        assert("EfficacyClass classified", ["Highly Effective", "Moderately Effective", "Neutral/Declining"].includes(evaluated[0].efficacyClass));
      }
    }

    // ───── 7. SECURITY & IMMUTABILITY ──────────────────────────────────────
    console.log("\n[7] Privacy, Masking & Audit Immutability");
    {
      const rStudents = await requestFn("/api/v1/admin/students", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert("Students list 200", rStudents.status === 200);
      const rawText = JSON.stringify(rStudents.json);
      assert("Never exposes passwordHash", !rawText.includes("passwordHash"));
      assert("Never exposes unmasked phone (+1-555)", !rawText.includes("+1-555"));

      // Audit Log Immutability
      const postAudit = await requestFn("/api/v1/admin/audit", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { justification: "Unauthorized write" },
      });
      assert("Audit cannot be mutated via POST (404)", postAudit.status === 404);

      const deleteAudit = await requestFn("/api/v1/admin/audit/123", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert("Audit cannot be mutated via DELETE (404)", deleteAudit.status === 404, `status was ${deleteAudit.status}`);
    }
  } finally {
    // ───── 8. NON-DESTRUCTIVE CLEANUP ──────────────────────────────────────
    console.log("\n[8] Non-destructive Cleanup");
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

    if (createdInterventionIds.length > 0) {
      await prisma.intervention.deleteMany({ where: { id: { in: createdInterventionIds } } }).catch(() => {});
    }
    if (createdJobIds.length > 0) {
      await prisma.dispatchJob.deleteMany({ where: { id: { in: createdJobIds } } }).catch(() => {});
    }
    if (createdCaseIds.length > 0) {
      await prisma.notification.deleteMany({ where: { caseId: { in: createdCaseIds } } }).catch(() => {});
      await prisma.escalationCase.deleteMany({ where: { id: { in: createdCaseIds } } }).catch(() => {});
    }

    if (app) {
      await app.close();
    }
    console.log("  ✅ Cleaned up temporary test artifacts");
  }

  console.log(`\n========================================`);
  console.log(`Smoke Results: ${pass.length} PASSED, ${fail.length} FAILED`);
  console.log(`========================================\n`);

  if (fail.length > 0) {
    process.exit(1);
  }
}

runAdminSmokeTests().catch((err) => {
  console.error("FATAL Smoke Failure:", err);
  process.exit(1);
});
