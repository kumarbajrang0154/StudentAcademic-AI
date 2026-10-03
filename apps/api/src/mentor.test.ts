import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "./server.js";
import { prisma, Role, RiskCategory, InterventionStatus } from "@student-academic-ai/database";
import { notifyMentorIfRiskWorsenedToCritical } from "./services/enrollment.service.js";

describe("Mentor Portal RBAC, Scope, and API Tests", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let mentor1Token: string;
  let mentor2Token: string;
  let faculty1Token: string;
  let student1Token: string;
  let student1Id: string;
  let student2Id: string;
  let nonMenteeStudentId: string;
  let cs101Id: string;
  let createdInterventionId: string;
  let createdNoteId: string;
  let createdEscalationId: string;

  beforeAll(async () => {
    process.env.DEMO_MODE = "true";
    app = await buildServer({ redis: "disabled" });

    // Fetch test users & courses
    const [m1, m2, f1, s1, s2, allStudents, cs101] = await Promise.all([
      prisma.user.findFirst({ where: { email: "mentor1@demo.edu" } }),
      prisma.user.findFirst({ where: { email: "mentor2@demo.edu" } }),
      prisma.user.findFirst({ where: { email: "faculty1@demo.edu" } }),
      prisma.user.findFirst({ where: { email: "student01@demo.edu" } }),
      prisma.user.findFirst({ where: { email: "student02@demo.edu" } }),
      prisma.user.findMany({ where: { role: Role.STUDENT } }),
      prisma.course.findUnique({ where: { code: "CS101" } }),
    ]);

    mentor1Token = app.jwt.sign({
      id: m1!.id,
      email: m1!.email,
      name: m1!.name,
      role: m1!.role,
      departmentId: m1!.departmentId,
    });

    if (m2) {
      mentor2Token = app.jwt.sign({
        id: m2.id,
        email: m2.email,
        name: m2.name,
        role: m2.role,
        departmentId: m2.departmentId,
      });
    }

    faculty1Token = app.jwt.sign({
      id: f1!.id,
      email: f1!.email,
      name: f1!.name,
      role: f1!.role,
      departmentId: f1!.departmentId,
    });

    student1Token = app.jwt.sign({
      id: s1!.id,
      email: s1!.email,
      name: s1!.name,
      role: s1!.role,
      departmentId: s1!.departmentId,
    });

    student1Id = s1!.id;
    student2Id = s2!.id;
    cs101Id = cs101!.id;

    // Find a student who is not a mentee of mentor1
    const m1Assignments = await prisma.mentorAssignment.findMany({
      where: { mentorId: m1!.id, active: true },
      select: { studentId: true },
    });
    const m1MenteesSet = new Set(m1Assignments.map((a) => a.studentId));
    const nonMentee = allStudents.find((s) => !m1MenteesSet.has(s.id));
    nonMenteeStudentId = nonMentee ? nonMentee.id : "cuid-non-existent-student";
  }, 30000);

  afterAll(async () => {
    // Non-destructive cleanup of test records created during test
    if (createdInterventionId) {
      await prisma.intervention.deleteMany({ where: { id: createdInterventionId } }).catch(() => {});
    }
    if (createdNoteId) {
      await prisma.mentorNote.deleteMany({ where: { id: createdNoteId } }).catch(() => {});
    }
    if (createdEscalationId) {
      await prisma.escalationCase.deleteMany({ where: { id: createdEscalationId } }).catch(() => {});
    }
    await app.close();
  });

  // 1. Role guards: Student & Faculty cannot access /mentor/*
  it("student and faculty get 403 on /mentor/overview and /mentor/mentees", async () => {
    const studentRes = await app.inject({
      method: "GET",
      url: "/api/v1/mentor/overview",
      headers: { authorization: `Bearer ${student1Token}` },
    });
    expect(studentRes.statusCode).toBe(403);

    const facultyRes = await app.inject({
      method: "GET",
      url: "/api/v1/mentor/mentees",
      headers: { authorization: `Bearer ${faculty1Token}` },
    });
    expect(facultyRes.statusCode).toBe(403);
  }, 30000);

  // 2. Mentor Overview
  it("mentor1 can load /mentor/overview with expected counters and queue", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/mentor/overview",
      headers: { authorization: `Bearer ${mentor1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.overview).toBeDefined();
    expect(body.overview.countsByRisk).toBeDefined();
    expect(Array.isArray(body.overview.needsAttention)).toBe(true);
    expect(typeof body.overview.avgAttendance).toBe("number");
    expect(typeof body.overview.avgMastery).toBe("number");
  }, 30000);

  // 3. Mentee Scope & Detail
  it("mentor1 can view assigned mentee student01, but gets 403 on non-mentee", async () => {
    // Mentee access: student01 is in mentor1's mentees
    const menteeRes = await app.inject({
      method: "GET",
      url: `/api/v1/mentor/mentees/${student1Id}`,
      headers: { authorization: `Bearer ${mentor1Token}` },
    });
    expect(menteeRes.statusCode).toBe(200);
    const body = JSON.parse(menteeRes.body);
    expect(body.mentee.student.id).toBe(student1Id);
    expect(body.mentee.student.guardianConsent).toBeDefined();
    // Verify privacy: no guardian phone number or password hash in mentee response
    expect((body.mentee.student as Record<string, unknown>).guardianPhone).toBeUndefined();
    expect((body.mentee.student as Record<string, unknown>).passwordHash).toBeUndefined();
    expect(Array.isArray(body.mentee.courses)).toBe(true);
    expect(Array.isArray(body.mentee.topRiskDrivers)).toBe(true);

    // Non-mentee access -> 403
    const nonMenteeRes = await app.inject({
      method: "GET",
      url: `/api/v1/mentor/mentees/${nonMenteeStudentId}`,
      headers: { authorization: `Bearer ${mentor1Token}` },
    });
    expect(nonMenteeRes.statusCode).toBe(403);
  }, 30000);

  // 4. canViewStudent on student endpoints
  it("enforces canViewStudent on student risk explanation and overview with ?studentId=", async () => {
    // Mentor can access mentee's risk explanation
    const mentorRiskRes = await app.inject({
      method: "GET",
      url: `/api/v1/students/${student1Id}/risk-explanation?courseId=${cs101Id}`,
      headers: { authorization: `Bearer ${mentor1Token}` },
    });
    expect(mentorRiskRes.statusCode).toBe(200);

    // Mentor gets 403 for non-mentee
    const mentorNonMenteeRiskRes = await app.inject({
      method: "GET",
      url: `/api/v1/students/${nonMenteeStudentId}/risk-explanation?courseId=${cs101Id}`,
      headers: { authorization: `Bearer ${mentor1Token}` },
    });
    expect(mentorNonMenteeRiskRes.statusCode).toBe(403);

    // Student1 gets 403 attempting to inspect Student2's risk explanation
    const studentCrossRes = await app.inject({
      method: "GET",
      url: `/api/v1/students/${student2Id}/risk-explanation?courseId=${cs101Id}`,
      headers: { authorization: `Bearer ${student1Token}` },
    });
    expect(studentCrossRes.statusCode).toBe(403);
  }, 30000);

  // 5. Notes CRUD and validation
  it("mentor can create and list notes for mentee, rejecting invalid bodies and non-mentees", async () => {
    // Rejects body > 2000 chars with 400
    const overlongBody = "A".repeat(2005);
    const resOverlong = await app.inject({
      method: "POST",
      url: `/api/v1/mentor/mentees/${student1Id}/notes`,
      headers: { authorization: `Bearer ${mentor1Token}` },
      payload: { body: overlongBody },
    });
    expect(resOverlong.statusCode).toBe(400);

    // Rejects empty body
    const resEmpty = await app.inject({
      method: "POST",
      url: `/api/v1/mentor/mentees/${student1Id}/notes`,
      headers: { authorization: `Bearer ${mentor1Token}` },
      payload: { body: "   " },
    });
    expect(resEmpty.statusCode).toBe(400);

    // Rejects non-mentee with 403
    const resNonMentee = await app.inject({
      method: "POST",
      url: `/api/v1/mentor/mentees/${nonMenteeStudentId}/notes`,
      headers: { authorization: `Bearer ${mentor1Token}` },
      payload: { body: "Note for non-mentee" },
    });
    expect(resNonMentee.statusCode).toBe(403);

    // Creates valid note
    const validBody = "Discussed unit 3 assessment prep and revision plan.";
    const resCreate = await app.inject({
      method: "POST",
      url: `/api/v1/mentor/mentees/${student1Id}/notes`,
      headers: { authorization: `Bearer ${mentor1Token}` },
      payload: { body: validBody },
    });
    expect(resCreate.statusCode).toBe(201);
    const createBody = JSON.parse(resCreate.body);
    expect(createBody.note.body).toBe(validBody);
    createdNoteId = createBody.note.id;

    // Lists notes
    const resList = await app.inject({
      method: "GET",
      url: `/api/v1/mentor/mentees/${student1Id}/notes`,
      headers: { authorization: `Bearer ${mentor1Token}` },
    });
    expect(resList.statusCode).toBe(200);
    const listBody = JSON.parse(resList.body);
    expect(listBody.notes.some((n: { id: string }) => n.id === createdNoteId)).toBe(true);
  }, 30000);

  // 6. Interventions scheduling, listing, patch, and ICS
  it("mentor can schedule intervention with auto slot find, download .ics, and update it", async () => {
    // Schedule intervention
    const resSchedule = await app.inject({
      method: "POST",
      url: "/api/v1/interventions",
      headers: { authorization: `Bearer ${mentor1Token}` },
      payload: {
        studentId: student1Id,
        courseId: cs101Id,
        notes: "Targeted 1-on-1 recovery check-in for CS101",
      },
    });
    expect(resSchedule.statusCode).toBe(201);
    const scheduleBody = JSON.parse(resSchedule.body);
    expect(scheduleBody.intervention.id).toBeDefined();
    expect(scheduleBody.intervention.scheduledAt).toBeDefined();
    expect(typeof scheduleBody.intervention.preScoreAvg).toBe("number");
    expect(scheduleBody.intervention.durationMin).toBe(15);
    expect(scheduleBody.intervention.icsUrl).toContain(`/api/v1/interventions/${scheduleBody.intervention.id}/ics`);
    createdInterventionId = scheduleBody.intervention.id;

    // Verify .ics endpoint returns text/calendar format
    const resIcs = await app.inject({
      method: "GET",
      url: `/api/v1/interventions/${createdInterventionId}/ics`,
      headers: { authorization: `Bearer ${mentor1Token}` },
    });
    expect(resIcs.statusCode).toBe(200);
    expect(resIcs.headers["content-type"]).toContain("text/calendar");
    expect(resIcs.body).toContain("BEGIN:VCALENDAR");
    expect(resIcs.body).toContain("BEGIN:VEVENT");
    expect(resIcs.body).toContain("END:VCALENDAR");

    // Patch intervention (mark completed with action items)
    const resPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/interventions/${createdInterventionId}`,
      headers: { authorization: `Bearer ${mentor1Token}` },
      payload: {
        status: InterventionStatus.COMPLETED,
        notes: "Completed session successfully; student agreed to complete Quiz 2 practice.",
        actionItems: ["Review Unit 3 slides", "Submit Quiz 2 before Friday"],
      },
    });
    expect(resPatch.statusCode).toBe(200);
    const patchBody = JSON.parse(resPatch.body);
    expect(patchBody.intervention.status).toBe(InterventionStatus.COMPLETED);

    // If mentor2 exists, mentor2 gets 403 modifying mentor1's intervention
    if (mentor2Token) {
      const resForbiddenPatch = await app.inject({
        method: "PATCH",
        url: `/api/v1/interventions/${createdInterventionId}`,
        headers: { authorization: `Bearer ${mentor2Token}` },
        payload: { status: InterventionStatus.CANCELLED },
      });
      expect(resForbiddenPatch.statusCode).toBe(403);
    }
  }, 30000);

  // 7. Escalation request idempotency
  it("escalation requests are created and are idempotent per student", async () => {
    const reason = "Severe performance drop and consecutive missed classes";
    const resFirst = await app.inject({
      method: "POST",
      url: "/api/v1/mentor/escalation-requests",
      headers: { authorization: `Bearer ${mentor1Token}` },
      payload: {
        studentId: student2Id,
        reason,
      },
    });
    expect(resFirst.statusCode).toBe(201);
    const firstBody = JSON.parse(resFirst.body);
    expect(firstBody.escalation.studentId).toBe(student2Id);
    createdEscalationId = firstBody.escalation.id;

    // Second request returns existing open case (idempotent)
    const resSecond = await app.inject({
      method: "POST",
      url: "/api/v1/mentor/escalation-requests",
      headers: { authorization: `Bearer ${mentor1Token}` },
      payload: {
        studentId: student2Id,
        reason: "Different reason text",
      },
    });
    expect(resSecond.statusCode).toBe(201);
    const secondBody = JSON.parse(resSecond.body);
    expect(secondBody.escalation.id).toBe(firstBody.escalation.id);

    // List escalation requests
    const resList = await app.inject({
      method: "GET",
      url: "/api/v1/mentor/escalation-requests",
      headers: { authorization: `Bearer ${mentor1Token}` },
    });
    expect(resList.statusCode).toBe(200);
    const listBody = JSON.parse(resList.body);
    expect(listBody.escalations.some((e: { id: string }) => e.id === createdEscalationId)).toBe(true);
  }, 30000);

  // 8. Notification 24h deduplication when risk worsens to CRITICAL
  it("creates IN_APP notification for mentor when risk worsens to CRITICAL and dedupes within 24h", async () => {
    const fixedNow = new Date("2026-10-02T10:00:00Z");

    const m1User = await prisma.user.findFirst({ where: { email: "mentor1@demo.edu" } });

    // Clean any pre-existing alerts for student01 in CS101
    await prisma.notification.deleteMany({
      where: {
        userId: m1User!.id,
        type: "RISK_CRITICAL_ALERT",
      },
    });

    // 1st call: SAFE -> CRITICAL should create 1 notification
    await notifyMentorIfRiskWorsenedToCritical(
      student1Id,
      cs101Id,
      RiskCategory.SAFE,
      RiskCategory.CRITICAL,
      fixedNow,
    );

    const countAfterFirst = await prisma.notification.count({
      where: {
        userId: m1User!.id,
        type: "RISK_CRITICAL_ALERT",
      },
    });
    expect(countAfterFirst).toBe(1);

    // 2nd call 1 hour later: should be deduped (no new notification)
    const oneHourLater = new Date(fixedNow.getTime() + 60 * 60 * 1000);
    await notifyMentorIfRiskWorsenedToCritical(
      student1Id,
      cs101Id,
      RiskCategory.MODERATE,
      RiskCategory.CRITICAL,
      oneHourLater,
    );

    const countAfterSecond = await prisma.notification.count({
      where: {
        userId: m1User!.id,
        type: "RISK_CRITICAL_ALERT",
      },
    });
    expect(countAfterSecond).toBe(1);

    // Cleanup
    await prisma.notification.deleteMany({
      where: {
        userId: m1User!.id,
        type: "RISK_CRITICAL_ALERT",
      },
    });
  }, 30000);
});
