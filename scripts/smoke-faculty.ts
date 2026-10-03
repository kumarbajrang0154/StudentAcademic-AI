import { buildServer } from "../apps/api/src/server.js";
import { prisma } from "@student-academic-ai/database";
import { recomputeCourseEnrollments } from "../apps/api/src/services/enrollment.service.js";

const BASE_URL = process.env.API_URL;

if (!process.env.ALLOW_SMOKE_ON_THIS_DB) {
  console.error(
    "❌ Smoke scripts refused to run: set ALLOW_SMOKE_ON_THIS_DB=true in your local env first.\n" +
    "   Never run smoke tests against the shared/production database.\n" +
    "   Use a dedicated Neon branch (see DEPLOY.md)."
  );
  process.exit(1);
}

async function runFacultySmokeTests() {
  console.log("🚀 Starting Student Academic AI Faculty Portal Smoke Verification (Module 4)...\n");

  let app: any;
  let requestFn: (
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
    },
  ) => Promise<{ status: number; json: any; headers: any }>;

  if (BASE_URL) {
    console.log(`📡 Connecting to live API server at ${BASE_URL}`);
    requestFn = async (url, options = {}) => {
      const res = await fetch(`${BASE_URL}${url}`, {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, json: data, headers: res.headers };
    };
  } else {
    console.log("⚡ Initializing Fastify in-memory server for direct testing");
    app = await buildServer({ logger: false });
    await app.ready();

    requestFn = async (url, options = {}) => {
      const res = await app.inject({
        method: options.method || "GET",
        url,
        headers: {
          "content-type": "application/json",
          ...options.headers,
        },
        payload: options.body,
      });
      let json = null;
      try {
        json = JSON.parse(res.body);
      } catch {
        json = res.body;
      }
      return { status: res.statusCode, json, headers: res.headers };
    };
  }

  let facultyToken = "";
  let student01Id = "";
  let cs101Id = "";
  let createdSessionDate = "";
  let targetAssessmentId = "";
  let originalScore: number | undefined;
  let marksModified = false;

  try {
    // 1. LOGIN AS FACULTY 1 (credentials masked as ****)
    console.log("🔐 1. Authenticating as faculty1@demo.edu (Password: ****)...");
    const facultyLoginRes = await requestFn("/api/v1/auth/login", {
      method: "POST",
      body: {
        email: "faculty1@demo.edu",
        password: "Demo@1234",
      },
    });

    if (facultyLoginRes.status !== 200 || !facultyLoginRes.json?.accessToken) {
      throw new Error(`Faculty login failed: ${JSON.stringify(facultyLoginRes.json)}`);
    }

    facultyToken = facultyLoginRes.json.accessToken;
    console.log(`✓ Faculty authenticated: ${facultyLoginRes.json.user.name} (${facultyLoginRes.json.user.role})`);

    // Also login as student01 to check student API before and after
    console.log("🔐 Authenticating as student01@demo.edu (Password: ****)...");
    const studentLoginRes = await requestFn("/api/v1/auth/login", {
      method: "POST",
      body: {
        email: "student01@demo.edu",
        password: "Demo@1234",
      },
    });

    if (studentLoginRes.status !== 200 || !studentLoginRes.json?.accessToken) {
      throw new Error(`Student login failed: ${JSON.stringify(studentLoginRes.json)}`);
    }

    const studentToken = studentLoginRes.json.accessToken;
    student01Id = studentLoginRes.json.user.id;
    console.log(`✓ Student authenticated: ${studentLoginRes.json.user.name}`);

    // 2. GET FACULTY COURSES
    console.log("\n📚 2. Fetching faculty courses...");
    const coursesRes = await requestFn("/api/v1/faculty/courses", {
      headers: { authorization: `Bearer ${facultyToken}` },
    });
    if (coursesRes.status !== 200) {
      throw new Error(`Failed to load faculty courses: ${JSON.stringify(coursesRes.json)}`);
    }

    const courses = coursesRes.json.courses;
    console.log(`✓ Retrieved ${courses.length} courses:`);
    for (const c of courses) {
      console.log(
        `   • ${c.code}: ${c.name} | Health -> Critical: ${c.classHealth.critical}, Moderate: ${c.classHealth.moderate}, Safe: ${c.classHealth.safe}`,
      );
    }

    const cs101 = courses.find((c: any) => c.code === "CS101");
    if (!cs101) throw new Error("CS101 course not found for faculty1");
    cs101Id = cs101.id;

    // 3. CHECK STUDENT01'S CS101 ATTENDANCE AND RISK BEFORE VIA STUDENT API
    console.log("\n📊 3. Checking student01 CS101 telemetry BEFORE new attendance...");
    const studentBeforeRes = await requestFn("/api/v1/student/overview", {
      headers: { authorization: `Bearer ${studentToken}` },
    });
    if (studentBeforeRes.status !== 200) {
      throw new Error(`Failed to get student dashboard: ${JSON.stringify(studentBeforeRes.json)}`);
    }

    const cs101Before = studentBeforeRes.json.courses.find(
      (c: any) => c.courseCode === "CS101",
    );
    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│ TELEMETRY BEFORE ATTENDANCE ENTRY                      │");
    console.log(`│ Course:             CS101                              │`);
    console.log(`│ Attendance Rate:    ${String(cs101Before.attendanceRate).padEnd(34)} │`);
    console.log(`│ Mastery Score:      ${String(cs101Before.masteryScore).padEnd(34)} │`);
    console.log(`│ Risk Category:      ${String(cs101Before.riskCategory).padEnd(34)} │`);
    console.log("└────────────────────────────────────────────────────────┘");

    // 4. PARSE VOICE ATTENDANCE TRANSCRIPT
    console.log("\n🎙️ 4. Parsing voice transcript for attendance batch...");
    const voiceTranscript = "Roll number 1 to 40 present except 5 and 9.";
    console.log(`Spoken transcript: "${voiceTranscript}"`);

    const parseRes = await requestFn("/api/v1/faculty/voice/parse", {
      method: "POST",
      headers: { authorization: `Bearer ${facultyToken}` },
      body: {
        transcript: voiceTranscript,
        courseId: cs101.id,
        mode: "ATTENDANCE",
      },
    });

    if (parseRes.status !== 200) {
      throw new Error(`Voice parse failed: ${JSON.stringify(parseRes.json)}`);
    }

    const parsedData = parseRes.json;
    console.log(
      `✓ Parsed ${parsedData.entries.length} entries (${parsedData.summary.presentCount} Present, ${parsedData.summary.absentCount} Absent, ${parsedData.unresolvedTokens.length} Unresolved)`,
    );

    // 5. COMMIT ATTENDANCE BATCH FOR A PAST-UNUSED DATE
    createdSessionDate = "2026-07-15T09:00:00Z";
    console.log(`\n💾 5. Committing attendance batch for past date ${createdSessionDate}...`);

    const attendanceCommitRes = await requestFn("/api/v1/attendance/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${facultyToken}` },
      body: {
        courseId: cs101.id,
        sessionDate: createdSessionDate,
        entries: parsedData.entries.map((e: any) => ({
          studentId: e.studentId,
          status: e.status,
        })),
      },
    });

    if (attendanceCommitRes.status !== 200) {
      throw new Error(`Attendance commit failed: ${JSON.stringify(attendanceCommitRes.json)}`);
    }
    console.log("✓ Attendance batch successfully committed and enrollments recomputed!");
    console.log(`   Counts: ${JSON.stringify(attendanceCommitRes.json.counts)}`);

    // 6. CHECK STUDENT01'S CS101 ATTENDANCE AND RISK AFTER VIA STUDENT API
    console.log("\n📈 6. Checking student01 CS101 telemetry AFTER new attendance...");
    const studentAfterRes = await requestFn("/api/v1/student/overview", {
      headers: { authorization: `Bearer ${studentToken}` },
    });
    if (studentAfterRes.status !== 200) {
      throw new Error(`Failed to get student dashboard: ${JSON.stringify(studentAfterRes.json)}`);
    }

    const cs101After = studentAfterRes.json.courses.find(
      (c: any) => c.courseCode === "CS101",
    );
    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│ TELEMETRY AFTER ATTENDANCE ENTRY (BEFORE vs AFTER)     │");
    console.log(`│ Course:             CS101                              │`);
    console.log(
      `│ Attendance Rate:    ${cs101Before.attendanceRate}% -> ${cs101After.attendanceRate}%`.padEnd(57) +
        "│",
    );
    console.log(
      `│ Mastery Score:      ${cs101Before.masteryScore}% -> ${cs101After.masteryScore}%`.padEnd(57) +
        "│",
    );
    console.log(
      `│ Risk Category:      ${cs101Before.riskCategory} -> ${cs101After.riskCategory}`.padEnd(57) +
        "│",
    );
    console.log("└────────────────────────────────────────────────────────┘");

    // 7. COMMIT MARKS BATCH WITH EDIT + JUSTIFICATION & AUDIT LOG
    console.log("\n📝 7. Testing marks batch with modification justification & AuditLog...");
    const gradebookRes = await requestFn(`/api/v1/faculty/courses/${cs101.id}/gradebook`, {
      headers: { authorization: `Bearer ${facultyToken}` },
    });
    if (gradebookRes.status !== 200 || !gradebookRes.json?.assessments?.length) {
      throw new Error("Gradebook empty or not found");
    }

    const firstAssessment = gradebookRes.json.assessments[0];
    targetAssessmentId = firstAssessment.id;
    const student01Row = gradebookRes.json.students.find((s: any) => s.studentId === student01Id);
    originalScore = student01Row?.scores[firstAssessment.id]?.score ?? 45;
    const newScore = originalScore === 45 ? 48 : 45;
    const justificationText = "Re-checking calculation on Question 2 due to re-grading request";

    console.log(
      `Modifying ${firstAssessment.title} score for ${student01Row.name}: ${originalScore} -> ${newScore}`,
    );

    const marksCommitRes = await requestFn("/api/v1/marks/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${facultyToken}` },
      body: {
        assessmentId: firstAssessment.id,
        entries: [{ studentId: student01Id, score: newScore }],
        justification: justificationText,
      },
    });

    if (marksCommitRes.status !== 200) {
      throw new Error(`Marks batch failed: ${JSON.stringify(marksCommitRes.json)}`);
    }
    marksModified = true;
    console.log("✓ Marks batch successfully committed!");

    // 8. QUERY & PRINT AUDITLOG ROW
    console.log("\n📜 8. Querying AuditLog table to verify recorded audit row...");
    const auditRow = await prisma.auditLog.findFirst({
      where: {
        entity: "StudentScore",
        justification: justificationText,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!auditRow) {
      throw new Error("AuditLog row was not found in database!");
    }

    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│ AUDIT LOG ROW VERIFIED                                 │");
    console.log(`│ ID:             ${String(auditRow.id).padEnd(38)} │`);
    console.log(`│ Entity:         ${String(auditRow.entity).padEnd(38)} │`);
    console.log(`│ Previous Value: ${JSON.stringify(auditRow.previousValue).padEnd(38)} │`);
    console.log(`│ New Value:      ${JSON.stringify(auditRow.newValue).padEnd(38)} │`);
    console.log(`│ Modified By:    ${String(auditRow.modifiedById).padEnd(38)} │`);
    console.log(`│ Justification:  ${String(auditRow.justification).padEnd(38)} │`);
    console.log(`│ Timestamp:      ${auditRow.createdAt.toISOString().padEnd(38)} │`);
    console.log("└────────────────────────────────────────────────────────┘");

    console.log("\n🎉 ALL FACULTY PORTAL SMOKE VERIFICATIONS PASSED SUCCESSFULLY!");
  } finally {
    console.log("\n🧹 Running non-destructive cleanup...");
    try {
      if (cs101Id && createdSessionDate) {
        const session = await prisma.classSession.findFirst({
          where: { courseId: cs101Id, sessionDate: new Date(createdSessionDate) },
        });
        if (session) {
          await prisma.attendanceRecord.deleteMany({ where: { sessionId: session.id } });
          await prisma.classSession.delete({ where: { id: session.id } });
          console.log(`   ✓ Cleaned up smoke test ClassSession (${session.id}) and AttendanceRecords`);
        }
      }

      if (marksModified && targetAssessmentId && student01Id && originalScore !== undefined) {
        await requestFn("/api/v1/marks/batch", {
          method: "POST",
          headers: { authorization: `Bearer ${facultyToken}` },
          body: {
            assessmentId: targetAssessmentId,
            entries: [{ studentId: student01Id, score: originalScore }],
            justification: "Reverting smoke test score to restore scripted demo baseline",
          },
        });
        console.log(`   ✓ Reverted score on assessment ${targetAssessmentId} back to ${originalScore}`);
      }

      if (cs101Id) {
        await recomputeCourseEnrollments(cs101Id);
        console.log("   ✓ Recomputed CS101 enrollments back to demo baseline");
      }
      console.log("   ℹ Note: AuditLog rows remain by design (append-only table).");
    } catch (cleanupErr) {
      console.warn("   ⚠ Cleanup warning:", cleanupErr);
    }

    if (app) {
      await app.close();
    }
  }
}

runFacultySmokeTests().catch((err) => {
  console.error("\n❌ Smoke test failed:", err);
  process.exit(1);
});
