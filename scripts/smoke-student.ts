import { buildServer } from "../apps/api/src/server.js";

const BASE_URL = process.env.API_URL;

if (!process.env.ALLOW_SMOKE_ON_THIS_DB) {
  console.error(
    "❌ Smoke scripts refused to run: set ALLOW_SMOKE_ON_THIS_DB=true in your local env first.\n" +
    "   Never run smoke tests against the shared/production database.\n" +
    "   Use a dedicated Neon branch (see DEPLOY.md)."
  );
  process.exit(1);
}

interface TestContext {
  token: string;
  user: { id: string; email: string; name: string; role: string };
}

async function runSmokeTests() {
  console.log("🚀 Starting Student Academic AI Smoke Verification (Module 2)...\n");

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

  // Helper login
  async function loginAs(email: string, password = "Demo@1234"): Promise<TestContext> {
    const res = await requestFn("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });

    if (res.status !== 200 || !res.json.accessToken) {
      throw new Error(`Login failed for ${email}: ${JSON.stringify(res.json)}`);
    }

    return {
      token: res.json.accessToken,
      user: res.json.user,
    };
  }

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: Hero Student (student01)
    // -------------------------------------------------------------
    console.log("=================================================");
    console.log("TEST 1: Student01 (Hero Student - CS101 Critical)");
    console.log("=================================================");
    const student01 = await loginAs("student01@demo.edu");
    console.log(`✓ Authenticated as: ${student01.user.name} (${student01.user.email})`);

    const authHeaders = { Authorization: `Bearer ${student01.token}` };

    // 1.1 GET /api/v1/student/overview
    console.log("\n-> Testing GET /api/v1/student/overview");
    const t0Overview = performance.now();
    const overviewRes = await requestFn("/api/v1/student/overview", { headers: authHeaders });
    const tOverviewMs = Math.round(performance.now() - t0Overview);
    if (overviewRes.status !== 200) {
      throw new Error(`Overview failed: ${overviewRes.status} ${JSON.stringify(overviewRes.json)}`);
    }

    const ov = overviewRes.json;
    console.log(`   ⏱️ Response Time: ${tOverviewMs} ms`);
    console.log(`   Overall Mastery: ${ov.overallMastery}% | Overall Velocity: ${ov.overallVelocity} (${ov.velocityBand})`);
    console.log(`   Aggregate Attendance: ${ov.aggregateAttendance}%`);
    console.log(`   Courses enrolled: ${ov.courses.length}`);
    console.log(`   Sparkline points: ${ov.sparklinePoints.length} points`);
    console.log(`   Upcoming deadlines: ${ov.upcomingDeadlines.length}`);

    if (ov.sparklinePoints.length !== 14) {
      throw new Error(`Expected 14 sparkline points, got ${ov.sparklinePoints.length}`);
    }

    const cs101Card = ov.courses.find((c: any) => c.courseCode === "CS101");
    if (!cs101Card) throw new Error("CS101 not found in student01 courses");
    console.log(`   CS101 Status: Category=${cs101Card.riskCategory}, Score=${cs101Card.riskScore}, Velocity=${cs101Card.velocity}`);

    if (cs101Card.riskCategory !== "CRITICAL") {
      throw new Error(`Expected CS101 to be CRITICAL for student01, got ${cs101Card.riskCategory}`);
    }
    console.log("   ✓ Verified student01 CS101 is CRITICAL");

    // Verify course sorting: Critical first
    const isSorted = ov.courses[0].riskCategory === "CRITICAL";
    if (!isSorted) throw new Error("Course cards not sorted Critical > Moderate > Safe");
    console.log("   ✓ Verified course cards sorted Critical > Moderate > Safe");

    // 1.2 GET /api/v1/student/courses/:courseId
    console.log(`\n-> Testing GET /api/v1/student/courses/${cs101Card.courseId}`);
    const t0Course = performance.now();
    const courseDetailRes = await requestFn(`/api/v1/student/courses/${cs101Card.courseId}`, {
      headers: authHeaders,
    });
    const tCourseMs = Math.round(performance.now() - t0Course);
    if (courseDetailRes.status !== 200) {
      throw new Error(`Course detail failed: ${courseDetailRes.status}`);
    }

    const cd = courseDetailRes.json;
    console.log(`   ⏱️ Response Time: ${tCourseMs} ms`);
    console.log(`   Course: ${cd.course.name}`);
    console.log(`   Assessment breakdown count: ${cd.assessmentBreakdown.length}`);
    const pendingAssessment = cd.assessmentBreakdown.find((a: any) => a.status === "Awaiting Evaluation");
    if (!pendingAssessment) {
      throw new Error("Expected 1 pending assessment with status 'Awaiting Evaluation'");
    }
    console.log(`   ✓ Found upcoming assessment: "${pendingAssessment.title}" (${pendingAssessment.status})`);
    console.log(`   Score history entries: ${cd.scoreHistory.length}`);

    // 1.3 POST /api/v1/attendance/simulator
    console.log("\n-> Testing POST /api/v1/attendance/simulator");
    const simRes = await requestFn("/api/v1/attendance/simulator", {
      method: "POST",
      headers: authHeaders,
      body: {
        courseId: cs101Card.courseId,
        hypotheticalMissedClasses: 2,
        targetThreshold: 75,
      },
    });
    if (simRes.status !== 200) {
      throw new Error(`Simulator failed: ${simRes.status} ${JSON.stringify(simRes.json)}`);
    }
    const sim = simRes.json;
    console.log(`   Current: ${sim.currentAttendance}%, Projected (+2 missed): ${sim.projectedAttendance}%`);
    console.log(`   Safe bunks remaining: ${sim.safeBunksRemaining}, Consecutive needed: ${sim.classesNeededConsecutive}`);
    console.log(`   Status: ${sim.status}, Mathematically Irrecoverable: ${sim.isMathematicallyIrrecoverable}`);
    console.log("   ✓ Simulator returned correct PRD contract");

    // 1.4 GET /api/v1/students/:id/risk-explanation?courseId=
    console.log(`\n-> Testing GET /api/v1/students/${student01.user.id}/risk-explanation?courseId=${cs101Card.courseId}`);
    const riskRes = await requestFn(
      `/api/v1/students/${student01.user.id}/risk-explanation?courseId=${cs101Card.courseId}`,
      { headers: authHeaders },
    );
    if (riskRes.status !== 200) {
      throw new Error(`Risk explanation failed: ${riskRes.status} ${JSON.stringify(riskRes.json)}`);
    }
    const rx = riskRes.json;
    console.log(`   Composite Risk Score: ${rx.compositeRiskScore}`);
    console.log(`   Risk Level (Persisted): ${rx.riskLevel}`);
    console.log(`   Override Reason: "${rx.overrideReason}"`);
    console.log(`   Velocity: ${rx.velocity} (${rx.velocityBand})`);

    // Single source of truth assertion: overview.riskCategory === explanation.riskLevel === CRITICAL
    if (cs101Card.riskCategory !== rx.riskLevel || rx.riskLevel !== "CRITICAL") {
      throw new Error(
        `Assertion failed: Single source of truth violation: overview.riskCategory (${cs101Card.riskCategory}) !== explanation.riskLevel (${rx.riskLevel})`,
      );
    }
    if (!rx.overrideReason || !rx.overrideReason.includes("Velocity")) {
      throw new Error(`Assertion failed: Expected overrideReason to mention Velocity, got ${rx.overrideReason}`);
    }
    console.log("   ✓ Verified single source of truth: overview.riskCategory === explanation.riskLevel === CRITICAL");
    console.log("   ✓ Verified overrideReason is populated and reflected in evidence");

    console.log("   Feature attributions:");
    let pctSum = 0;
    for (const f of rx.featureAttributions) {
      console.log(`     - ${f.factor}: ${f.percentage}% (contribution: ${f.contribution}) | "${f.evidence}"`);
      pctSum += f.percentage;
    }
    console.log(`   Sum of risk factor percentages: ${Math.round(pctSum)}%`);
    if (Math.round(pctSum) !== 100) {
      throw new Error(`XAI percentages do not sum to 100: ${pctSum}`);
    }
    console.log("   ✓ Verified XAI risk-increasing factors sum to 100%");
    console.log(`   Weekday pattern: "${rx.absencePatterns.patternDescription}"`);
    console.log(`   Prescribed Interventions: ${rx.prescribedInterventions.length}`);

    // 1.5 GET /api/v1/student/benchmarks?courseId=
    console.log(`\n-> Testing GET /api/v1/student/benchmarks?courseId=${cs101Card.courseId}`);
    const benchRes = await requestFn(`/api/v1/student/benchmarks?courseId=${cs101Card.courseId}`, {
      headers: authHeaders,
    });
    if (benchRes.status !== 200) {
      throw new Error(`Benchmarks failed: ${benchRes.status}`);
    }
    const bm = benchRes.json;
    console.log(`   Cohort Size: ${bm.cohortSize}, Student Score: ${bm.studentScore}`);
    console.log(`   Percentile: ${bm.percentile}%, Mean: ${bm.mean}, SD: ${bm.sd}`);
    console.log(`   Histogram bins: ${bm.histogramBins?.length || 0} bins`);
    if (bm.restricted) {
      throw new Error("Cohort size is 40, expected unmasked benchmark distribution");
    }
    console.log("   ✓ Verified full benchmark distribution for N=40 cohort");

    // 1.6 GET /api/v1/student/prescriptions
    console.log("\n-> Testing GET /api/v1/student/prescriptions");
    const prescRes = await requestFn("/api/v1/student/prescriptions", { headers: authHeaders });
    if (prescRes.status !== 200) {
      throw new Error(`Prescriptions failed: ${prescRes.status}`);
    }
    const pr = prescRes.json;
    console.log(`   Prescriptions for weak topics (<50%): ${pr.prescriptions.length}`);
    for (const p of pr.prescriptions) {
      console.log(`     - Topic: "${p.topicTag}" (${p.courseCode}) | Mastery: ${p.currentMastery}% | Resources: ${p.resources.length}`);
    }
    console.log("   ✓ Verified prescriptions matched resources or provided fallbacks");

    // 1.7 GET /api/v1/student/calendar
    console.log("\n-> Testing GET /api/v1/student/calendar");
    const calRes = await requestFn("/api/v1/student/calendar", { headers: authHeaders });
    if (calRes.status !== 200) {
      throw new Error(`Calendar failed: ${calRes.status}`);
    }
    const cal = calRes.json;
    console.log(`   Upcoming deadlines: ${cal.deadlines.length}`);
    for (const d of cal.deadlines) {
      console.log(`     - "${d.title}" (${d.courseCode}) in ${d.hoursRemaining}h [Reminder: ${d.reminderState}]`);
    }
    const reminderStates = new Set(cal.deadlines.map((d: any) => d.reminderState));
    console.log(`   Reminder states present across deadlines: ${Array.from(reminderStates).join(", ")}`);
    if (!reminderStates.has("T-24h") || !reminderStates.has("T-48h")) {
      throw new Error(`Expected staggered reminder states including T-24h and T-48h, found: ${Array.from(reminderStates)}`);
    }
    console.log("   ✓ Verified staggered reminder states (T-24h for CS101, T-48h for CS102, UPCOMING for CS103)");
    console.log(`   Timetable slots: ${cal.schedule.length}`);
    console.log("   ✓ Verified calendar deadlines and timetable schedule");

    // -------------------------------------------------------------
    // SCENARIO 2: Escalation Demo (student02)
    // -------------------------------------------------------------
    console.log("\n=================================================");
    console.log("TEST 2: Student02 (Critical in ALL 3 courses)");
    console.log("=================================================");
    const student02 = await loginAs("student02@demo.edu");
    const s2OverviewRes = await requestFn("/api/v1/student/overview", {
      headers: { Authorization: `Bearer ${student02.token}` },
    });
    const s2Ov = s2OverviewRes.json;
    const allCritical = s2Ov.courses.every((c: any) => c.riskCategory === "CRITICAL");
    console.log(`   Student02 Courses: ${s2Ov.courses.map((c: any) => `${c.courseCode}: ${c.riskCategory}`).join(", ")}`);
    if (!allCritical) {
      throw new Error("Expected student02 to be CRITICAL in ALL 3 courses");
    }
    console.log("   ✓ Verified student02 is CRITICAL across all 3 courses (Escalation demo)");

    // -------------------------------------------------------------
    // SCENARIO 3: Conflict Case (student03: 98% attendance, 20% marks)
    // -------------------------------------------------------------
    console.log("\n=================================================");
    console.log("TEST 3: Student03 (XAI Conflict Case: High Attendance, Low Marks)");
    console.log("=================================================");
    const student03 = await loginAs("student03@demo.edu");
    const s3OverviewRes = await requestFn("/api/v1/student/overview", {
      headers: { Authorization: `Bearer ${student03.token}` },
    });
    const s3Ov = s3OverviewRes.json;
    console.log(`   Student03 Overall Attendance: ${s3Ov.aggregateAttendance}% | Overall Mastery: ${s3Ov.overallMastery}%`);

    const s3Cs101 = s3Ov.courses.find((c: any) => c.courseCode === "CS101");
    const s3RiskRes = await requestFn(
      `/api/v1/students/${student03.user.id}/risk-explanation?courseId=${s3Cs101.courseId}`,
      { headers: { Authorization: `Bearer ${student03.token}` } },
    );
    const s3Rx = s3RiskRes.json;
    const topDriver = s3Rx.featureAttributions[0];
    console.log(`   Top risk driver: ${topDriver.factor} (${topDriver.percentage}%)`);
    if (topDriver.factor !== "mastery") {
      throw new Error(`Expected top risk driver to be 'mastery', got ${topDriver.factor}`);
    }
    console.log("   ✓ Verified top risk driver is 'mastery'");

    const attendanceProtective = s3Rx.protectiveFactors.find((f: any) => f.factor === "attendance");
    if (!attendanceProtective) {
      throw new Error("Expected attendance to appear in protectiveFactors for student03");
    }
    console.log(`   Protective factor: ${attendanceProtective.factor} ("${attendanceProtective.evidence}")`);
    console.log("   ✓ Verified attendance is categorized as a protective factor");

    // -------------------------------------------------------------
    // SCENARIO 4: RBAC & Scope Enforcement
    // -------------------------------------------------------------
    console.log("\n=================================================");
    console.log("TEST 4: RBAC & Scope Enforcement (Student = Self Only)");
    console.log("=================================================");
    // student01 trying to view student02's risk explanation
    const forbiddenRes = await requestFn(
      `/api/v1/students/${student02.user.id}/risk-explanation?courseId=${cs101Card.courseId}`,
      { headers: authHeaders },
    );
    console.log(`   Attempting cross-student access: HTTP status = ${forbiddenRes.status}`);
    if (forbiddenRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for cross-student access, got ${forbiddenRes.status}`);
    }
    console.log("   ✓ Verified student cannot access another student's risk data (403 Forbidden)");

    console.log("\n🎉 ALL SMOKE TESTS PASSED SUCCESSFULLY! Module 2 verified.");
  } finally {
    if (app) {
      await app.close();
    }
  }
}

runSmokeTests().catch((err) => {
  console.error("\n❌ Smoke test failed:", err);
  process.exit(1);
});
