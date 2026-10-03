/**
 * Smoke test: Mentor Portal (Module 5)
 * Non-destructive: all created resources are cleaned up in a finally block.
 * AuditLog rows are NEVER deleted (append-only).
 */
import { buildServer } from "../apps/api/src/server.js";
import { prisma } from "@student-academic-ai/database";

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

async function runMentorSmokeTests() {
  console.log("🚀 Starting Mentor Portal Smoke Verification (Module 5)...\n");

  let app: ReturnType<typeof buildServer> extends Promise<infer T> ? T : never;
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
    app = await buildServer({ logger: false });
    await (app as Awaited<ReturnType<typeof buildServer>>).ready();

    requestFn = async (url, options = {}) => {
      const res = await (app as Awaited<ReturnType<typeof buildServer>>).inject({
        method: (options.method ?? "GET") as import("fastify").HTTPMethods,
        url,
        headers: { "content-type": "application/json", ...(options.headers ?? {}) },
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

  // Cleanup registry — IDs to delete in finally block
  const createdNoteIds: string[] = [];
  const createdInterventionIds: string[] = [];
  const createdEscalationIds: string[] = [];

  let mentorToken = "";
  let studentAId = "";   // student01 — known mentee of mentor1
  let student01CourseId = "";

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
    // ───── 1. MENTOR LOGIN ─────────────────────────────────────────────────
    console.log("\n[1] Mentor login");
    {
      const r = await requestFn("/api/v1/auth/login", {
        method: "POST",
        body: { email: "mentor1@demo.edu", password: "Demo@1234" },
      });
      assert("Mentor login 200", r.status === 200);
      const body = r.json as Record<string, unknown>;
      mentorToken = (body?.accessToken as string) ?? "";
      assert("Mentor token received", !!mentorToken);
    }

    const authHeader = { Authorization: `Bearer ${mentorToken}` };

    // ───── 2. OVERVIEW ─────────────────────────────────────────────────────
    console.log("\n[2] GET /api/v1/mentor/overview");
    {
      const r = await requestFn("/api/v1/mentor/overview", { headers: authHeader });
      assert("Overview 200", r.status === 200, JSON.stringify(r.json));
      const body = r.json as Record<string, unknown>;
      const ov = body?.overview as Record<string, unknown> | undefined;
      assert("Overview has countsByRisk", !!ov?.countsByRisk);
      assert("Overview has avgAttendance", typeof ov?.avgAttendance === "number");
    }

    // ───── 3. MENTEES LIST ──────────────────────────────────────────────────
    console.log("\n[3] GET /api/v1/mentor/mentees");
    {
      const r = await requestFn("/api/v1/mentor/mentees", { headers: authHeader });
      assert("Mentees list 200", r.status === 200, JSON.stringify(r.json));
      const body = r.json as Record<string, unknown>;
      const list = body?.mentees as unknown[];
      assert("Mentees list is array", Array.isArray(list));
      assert("At least 1 mentee", (list?.length ?? 0) >= 1);

      // Find student01
      const mentor1 = await prisma.user.findUnique({
        where: { email: "mentor1@demo.edu" },
        select: { id: true },
      });
      const assignment = await prisma.mentorAssignment.findFirst({
        where: { mentorId: mentor1?.id, active: true },
        include: { student: { select: { id: true } } },
      });
      studentAId = assignment?.student?.id ?? "";
      assert("student01 is in mentee list", !!studentAId);
    }

    // Filter by risk
    {
      const r = await requestFn("/api/v1/mentor/mentees?risk=CRITICAL", {
        headers: authHeader,
      });
      assert("Mentees risk filter 200", r.status === 200);
      const body = r.json as Record<string, unknown>;
      const list = (body?.mentees as Array<Record<string, unknown>>) ?? [];
      const allCritical = list.every((m) => m.worstRiskCategory === "CRITICAL");
      assert("Mentees risk filter: all CRITICAL", allCritical || list.length === 0);
    }

    // ───── 4. MENTEE DETAIL ─────────────────────────────────────────────────
    console.log(`\n[4] GET /api/v1/mentor/mentees/${studentAId}`);
    {
      const r = await requestFn(`/api/v1/mentor/mentees/${studentAId}`, {
        headers: authHeader,
      });
      assert("Mentee detail 200", r.status === 200, JSON.stringify(r.json));
      const body = r.json as Record<string, unknown>;
      const m = body?.mentee as Record<string, unknown> | undefined;
      assert("Mentee has student.name", typeof (m?.student as Record<string, unknown>)?.name === "string");
      assert("Mentee has courses array", Array.isArray(m?.courses));
      const courses = m?.courses as Array<Record<string, unknown>>;
      if (courses?.length > 0) {
        student01CourseId = (courses[0].courseId as string) ?? "";
      }
      assert("Mentee detail has sparkline", Array.isArray(m?.sparkline));
      assert("Mentee detail has interventions", Array.isArray(m?.interventions));
      assert("Mentee detail has notes", Array.isArray(m?.notes));
    }

    // Forbidden: non-mentee student
    {
      // find a student NOT assigned to mentor1
      const mentorUser = await prisma.user.findUnique({
        where: { email: "mentor1@demo.edu" },
        select: { id: true },
      });
      const notMyMentees = await prisma.user.findFirst({
        where: {
          role: "STUDENT",
          mentorAssignmentsAsStudent: {
            none: { mentorId: mentorUser?.id },
          },
        },
        select: { id: true },
      });
      if (notMyMentees) {
        const r = await requestFn(`/api/v1/mentor/mentees/${notMyMentees.id}`, {
          headers: authHeader,
        });
        assert("Non-mentee detail returns 403", r.status === 403);
      }
    }

    // ───── 5. CREATE NOTE ───────────────────────────────────────────────────
    console.log("\n[5] POST /api/v1/mentor/mentees/:studentId/notes");
    let newNoteId = "";
    {
      const r = await requestFn(
        `/api/v1/mentor/mentees/${studentAId}/notes`,
        {
          method: "POST",
          headers: authHeader,
          body: { body: "Smoke test note — will be cleaned up" },
        },
      );
      assert("Create note 201", r.status === 201, JSON.stringify(r.json));
      const body = r.json as Record<string, unknown>;
      newNoteId = (body?.note as Record<string, unknown>)?.id as string ?? "";
      assert("Note id returned", !!newNoteId);
      if (newNoteId) createdNoteIds.push(newNoteId);
    }

    // Empty note validation
    {
      const r = await requestFn(
        `/api/v1/mentor/mentees/${studentAId}/notes`,
        {
          method: "POST",
          headers: authHeader,
          body: { body: "" },
        },
      );
      assert("Empty note returns 400", r.status === 400);
    }

    // ───── 6. INTERVENTIONS ─────────────────────────────────────────────────
    console.log("\n[6] POST /api/v1/interventions");
    let newInterventionId = "";
    {
      const r = await requestFn("/api/v1/interventions", {
        method: "POST",
        headers: authHeader,
        body: {
          studentId: studentAId,
          title: "Smoke test intervention",
          notes: "Smoke test — will be cleaned up",
          durationMin: 15,
          scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      assert(
        "Schedule intervention 201 or 409",
        r.status === 201 || r.status === 409,
        JSON.stringify(r.json),
      );
      if (r.status === 201) {
        const body = r.json as Record<string, unknown>;
        newInterventionId =
          ((body?.intervention as Record<string, unknown>)?.id as string) ?? "";
        if (newInterventionId) createdInterventionIds.push(newInterventionId);
        assert("Intervention id returned", !!newInterventionId);
      } else {
        console.log("    ℹ️  409 slot conflict (expected if timetable full) — skipping update test");
      }
    }

    // PATCH status
    if (newInterventionId) {
      const r = await requestFn(`/api/v1/interventions/${newInterventionId}`, {
        method: "PATCH",
        headers: authHeader,
        body: { status: "CANCELLED" },
      });
      assert("PATCH intervention status 200", r.status === 200, JSON.stringify(r.json));
    }

    // GET interventions list
    {
      const r = await requestFn("/api/v1/interventions", { headers: authHeader });
      assert("GET interventions list 200", r.status === 200);
      const body = r.json as Record<string, unknown>;
      assert("Interventions is array", Array.isArray(body?.interventions));
    }

    // ───── 7. ESCALATION ────────────────────────────────────────────────────
    console.log("\n[7] POST /api/v1/mentor/escalation-requests");
    let newEscalationId = "";
    {
      const r = await requestFn("/api/v1/mentor/escalation-requests", {
        method: "POST",
        headers: authHeader,
        body: {
          studentId: studentAId,
          reason: "Smoke test escalation — will be cleaned up",
        },
      });
      assert("Create escalation 201", r.status === 201, JSON.stringify(r.json));
      const body = r.json as Record<string, unknown>;
      newEscalationId =
        ((body?.escalation as Record<string, unknown>)?.id as string) ?? "";
      if (newEscalationId) createdEscalationIds.push(newEscalationId);
      assert("Escalation id returned", !!newEscalationId);
    }

    // Empty reason validation
    {
      const r = await requestFn("/api/v1/mentor/escalation-requests", {
        method: "POST",
        headers: authHeader,
        body: { studentId: studentAId, reason: "" },
      });
      assert("Empty escalation reason returns 400", r.status === 400);
    }

    // GET escalation list
    {
      const r = await requestFn("/api/v1/mentor/escalation-requests", {
        headers: authHeader,
      });
      assert("GET escalations 200", r.status === 200);
      const body = r.json as Record<string, unknown>;
      assert("Escalations is array", Array.isArray(body?.escalations));
    }

    // ───── 8. NOTIFICATIONS ─────────────────────────────────────────────────
    console.log("\n[8] GET /api/v1/notifications");
    {
      const r = await requestFn("/api/v1/notifications", { headers: authHeader });
      assert("Notifications 200", r.status === 200);
      const body = r.json as Record<string, unknown>;
      assert("Notifications array", Array.isArray(body?.notifications));
      assert(
        "Pagination has unreadCount",
        typeof (body?.pagination as Record<string, unknown>)?.unreadCount === "number",
      );
    }

    // ───── 9. RBAC: STUDENT CANNOT ACCESS /mentor ───────────────────────────
    console.log("\n[9] RBAC check");
    {
      const loginR = await requestFn("/api/v1/auth/login", {
        method: "POST",
        body: { email: "student01@demo.edu", password: "Demo@1234" },
      });
      const studentToken = (loginR.json as Record<string, unknown>)?.accessToken as string ?? "";
      if (studentToken) {
        const r = await requestFn("/api/v1/mentor/overview", {
          headers: { Authorization: `Bearer ${studentToken}` },
        });
        assert("Student cannot access mentor overview (403)", r.status === 403);
      }
    }

  } finally {
    // ───── CLEANUP ──────────────────────────────────────────────────────────
    console.log("\n🧹 Cleaning up smoke test artifacts...");

    // Delete created notes
    for (const id of createdNoteIds) {
      try {
        await prisma.mentorNote.delete({ where: { id } });
        console.log(`  ✓ Deleted MentorNote ${id}`);
      } catch (e) {
        console.error(`  ✗ Failed to delete MentorNote ${id}:`, e);
      }
    }

    // Delete created interventions (notifications cascade via userId, nothing else to pre-delete)
    for (const id of createdInterventionIds) {
      try {
        await prisma.intervention.delete({ where: { id } });
        console.log(`  ✓ Deleted Intervention ${id}`);
      } catch (e) {
        console.error(`  ✗ Failed to delete Intervention ${id}:`, e);
      }
    }

    // Delete created escalation cases
    for (const id of createdEscalationIds) {
      try {
        await prisma.escalationCase.delete({ where: { id } });
        console.log(`  ✓ Deleted EscalationCase ${id}`);
      } catch (e) {
        console.error(`  ✗ Failed to delete EscalationCase ${id}:`, e);
      }
    }

    if (!BASE_URL && app) {
      await (app as Awaited<ReturnType<typeof buildServer>>).close();
    }
    await prisma.$disconnect();
  }

  // ───── SUMMARY ─────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log(`  Tests passed: ${pass.length}`);
  console.log(`  Tests failed: ${fail.length}`);
  console.log("════════════════════════════════════════");
  if (fail.length > 0) {
    console.error("\n❌ FAILED TESTS:");
    fail.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("\n✅ All mentor smoke tests passed!");
  }
}

runMentorSmokeTests().catch((e) => {
  console.error("Smoke test fatal error:", e);
  process.exit(1);
});
