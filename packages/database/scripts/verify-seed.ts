import { PrismaClient, Role, RiskCategory } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("====================================================");
  console.log("🔍 Running Database Seed & Integrity Verification (Module 2)");
  console.log("====================================================\n");

  // 1. Department count
  const departmentCount = await prisma.department.count();
  console.log(`Departments:       ${departmentCount} (expected 1)`);
  if (departmentCount !== 1) {
    throw new Error(`Assertion failed: Expected 1 department, found ${departmentCount}`);
  }

  // 2. Roles verification
  const hodCount = await prisma.user.count({ where: { role: Role.HOD } });
  console.log(`HOD:               ${hodCount} (expected 1)`);
  if (hodCount !== 1) throw new Error(`Assertion failed: Expected 1 HOD, found ${hodCount}`);

  const facultyCount = await prisma.user.count({ where: { role: Role.FACULTY } });
  console.log(`Faculty:           ${facultyCount} (expected 2)`);
  if (facultyCount !== 2) throw new Error(`Assertion failed: Expected 2 faculty, found ${facultyCount}`);

  const mentorCount = await prisma.user.count({ where: { role: Role.MENTOR } });
  console.log(`Mentors:           ${mentorCount} (expected 1)`);
  if (mentorCount !== 1) throw new Error(`Assertion failed: Expected 1 mentor, found ${mentorCount}`);

  const studentCount = await prisma.user.count({ where: { role: Role.STUDENT } });
  console.log(`Students:          ${studentCount} (expected 40)`);
  if (studentCount !== 40) throw new Error(`Assertion failed: Expected 40 students, found ${studentCount}`);

  // 3. Courses count
  const courseCount = await prisma.course.count();
  console.log(`Courses:           ${courseCount} (expected 3)`);
  if (courseCount !== 3) throw new Error(`Assertion failed: Expected 3 courses, found ${courseCount}`);

  // 4. CurriculumUnits: 4 per course (12 total)
  const unitCount = await prisma.curriculumUnit.count();
  console.log(`Curriculum Units:  ${unitCount} (expected 12)`);
  if (unitCount !== 12) throw new Error(`Assertion failed: Expected 12 curriculum units, found ${unitCount}`);

  // 5. Course Outcomes & Program Outcomes (PO1..PO6)
  const poCount = await prisma.programOutcome.count();
  console.log(`Program Outcomes:  ${poCount} (expected 6)`);
  if (poCount !== 6) throw new Error(`Assertion failed: Expected 6 POs, found ${poCount}`);

  const coCount = await prisma.courseOutcome.count();
  console.log(`Course Outcomes:   ${coCount} (expected 12)`);
  if (coCount !== 12) throw new Error(`Assertion failed: Expected 12 COs, found ${coCount}`);

  const copoCount = await prisma.coPoMapping.count();
  console.log(`CO-PO Mappings:    ${copoCount} (expected >= 24)`);
  if (copoCount < 24) throw new Error(`Assertion failed: Expected >= 24 CO-PO mappings, found ${copoCount}`);

  // 6. Timetable Slots: Mon-Fri per course (15 total)
  const slotCount = await prisma.timetableSlot.count();
  console.log(`Timetable Slots:   ${slotCount} (expected 15)`);
  if (slotCount !== 15) throw new Error(`Assertion failed: Expected 15 timetable slots, found ${slotCount}`);

  // 7. Class Sessions: 20 per course (60 total)
  const totalSessions = await prisma.classSession.count();
  console.log(`Total Sessions:    ${totalSessions} (expected 60)`);
  if (totalSessions !== 60) throw new Error(`Assertion failed: Expected 60 class sessions, found ${totalSessions}`);

  // 8. Assessments: 4 per course (12 total: 3 graded + 1 upcoming)
  const assessmentCount = await prisma.assessment.count();
  console.log(`Assessments:       ${assessmentCount} (expected 12)`);
  if (assessmentCount !== 12) throw new Error(`Assertion failed: Expected 12 assessments, found ${assessmentCount}`);

  // 9. Assessment Questions: 5 per assessment (60 total)
  const questionCount = await prisma.assessmentQuestion.count();
  console.log(`Questions:         ${questionCount} (expected 60)`);
  if (questionCount !== 60) throw new Error(`Assertion failed: Expected 60 questions, found ${questionCount}`);

  // 10. Educational Resources (~15 rows)
  const resourceCount = await prisma.resource.count();
  console.log(`Resources:         ${resourceCount} (expected >= 15)`);
  if (resourceCount < 15) throw new Error(`Assertion failed: Expected >= 15 resources, found ${resourceCount}`);

  // 11. MentorAssignment: mentor1 -> 10 students
  const mentorAssignments = await prisma.mentorAssignment.count({ where: { active: true } });
  console.log(`Mentor Assignments:${mentorAssignments} (expected 10)`);
  if (mentorAssignments !== 10) throw new Error(`Assertion failed: Expected 10 mentor assignments, found ${mentorAssignments}`);

  const mentor1Mentees = await prisma.mentorAssignment.findMany({
    where: { active: true, mentor: { email: "mentor1@demo.edu" } },
    include: { student: { select: { email: true } } },
  });
  const menteeEmails = new Set(mentor1Mentees.map((m) => m.student.email));
  const requiredMentees = ["student01@demo.edu", "student02@demo.edu", "student03@demo.edu"];
  for (const req of requiredMentees) {
    if (!menteeEmails.has(req)) {
      throw new Error(`Assertion failed: Expected mentor1 to have mentee ${req}`);
    }
  }
  console.log(`✓ Verified: mentor1 mentees include student01, student02, student03`);

  // 12. GuardianContact with consent: 40 students
  const guardianContacts = await prisma.guardianContact.count({ where: { consentGiven: true } });
  console.log(`Guardian Contacts: ${guardianContacts} (expected 40)`);
  if (guardianContacts !== 40) throw new Error(`Assertion failed: Expected 40 consented guardian contacts, found ${guardianContacts}`);

  // 13. QuestionScore rows sum to StudentScore score
  console.log("\n📐 Verifying QuestionScore rows sum to StudentScore score...");
  const studentScores = await prisma.studentScore.findMany({
    take: 50,
    include: {
      assessment: {
        include: {
          questions: true,
        },
      },
    },
  });

  const allQIds = Array.from(new Set(studentScores.flatMap((ss) => ss.assessment.questions.map((q) => q.id))));
  const allStudentIds = Array.from(new Set(studentScores.map((ss) => ss.studentId)));

  const allQScores = await prisma.questionScore.findMany({
    where: {
      studentId: { in: allStudentIds },
      questionId: { in: allQIds },
    },
  });

  const qScoreMap = new Map<string, number>();
  for (const qs of allQScores) {
    qScoreMap.set(`${qs.studentId}_${qs.questionId}`, qs.score);
  }

  for (const ss of studentScores) {
    let sumScores = 0;
    for (const q of ss.assessment.questions) {
      sumScores += qScoreMap.get(`${ss.studentId}_${q.id}`) ?? 0;
    }
    const roundedSum = Math.round(sumScores * 10) / 10;
    if (Math.abs(roundedSum - ss.score) > 0.1) {
      throw new Error(
        `Assertion failed: Sum of question scores (${roundedSum}) does not match student score (${ss.score}) for student ${ss.studentId} on assessment ${ss.assessmentId}`,
      );
    }
  }
  console.log(`✓ Verified: QuestionScore rows sum exactly to StudentScore`);

  // 14. Scripted Demo Students Verification
  console.log("\n🎭 Verifying Scripted Demo Scenarios...");

  // student01 (hero)
  const student01 = await prisma.user.findUnique({ where: { email: "student01@demo.edu" } });
  if (!student01) throw new Error("student01 not found");

  const cs101 = await prisma.course.findUnique({ where: { code: "CS101" } });
  if (!cs101) throw new Error("CS101 course not found");

  const s01EnrCS101 = await prisma.courseEnrollment.findFirst({
    where: { studentId: student01.id, courseId: cs101.id },
  });
  if (!s01EnrCS101) throw new Error("student01 enrollment in CS101 not found");

  console.log(` - student01 CS101: Attendance=${s01EnrCS101.attendanceRate}%, Velocity=${s01EnrCS101.velocity}, Risk=${s01EnrCS101.riskCategory} (${s01EnrCS101.riskScore})`);
  if (s01EnrCS101.attendanceRate !== 70) {
    throw new Error(`Assertion failed: student01 CS101 attendance expected 70%, found ${s01EnrCS101.attendanceRate}%`);
  }
  if (!s01EnrCS101.velocity || s01EnrCS101.velocity > -1.5) {
    throw new Error(`Assertion failed: student01 CS101 velocity expected <= -1.5, found ${s01EnrCS101.velocity}`);
  }
  if (s01EnrCS101.riskCategory !== RiskCategory.CRITICAL) {
    throw new Error(`Assertion failed: student01 CS101 expected CRITICAL, found ${s01EnrCS101.riskCategory}`);
  }

  // student02 (escalation demo: Critical in ALL 3 courses)
  const student02 = await prisma.user.findUnique({ where: { email: "student02@demo.edu" } });
  if (!student02) throw new Error("student02 not found");
  const s02Enrs = await prisma.courseEnrollment.findMany({ where: { studentId: student02.id } });
  const s02CriticalCount = s02Enrs.filter((e) => e.riskCategory === RiskCategory.CRITICAL).length;
  console.log(` - student02: Critical in ${s02CriticalCount} / 3 courses`);
  if (s02CriticalCount !== 3) {
    throw new Error(`Assertion failed: student02 expected CRITICAL in all 3 courses, found ${s02CriticalCount}`);
  }

  // student03 (XAI conflict case: 98% attendance, ~20% marks)
  const student03 = await prisma.user.findUnique({ where: { email: "student03@demo.edu" } });
  if (!student03) throw new Error("student03 not found");
  const s03Enr = await prisma.courseEnrollment.findFirst({ where: { studentId: student03.id } });
  console.log(` - student03: Attendance=${s03Enr?.attendanceRate}%, Mastery=${s03Enr?.masteryScore}%`);
  if (!s03Enr || (s03Enr.attendanceRate ?? 0) < 95 || (s03Enr.masteryScore ?? 100) > 30) {
    throw new Error("Assertion failed: student03 expected high attendance (>= 95%) and low mastery (<= 30%)");
  }

  // student04 (recovery streak: last 6 sessions all PRESENT)
  const student04 = await prisma.user.findUnique({ where: { email: "student04@demo.edu" } });
  if (!student04) throw new Error("student04 not found");
  const s04Sessions = await prisma.attendanceRecord.findMany({
    where: { studentId: student04.id, session: { courseId: cs101.id } },
    include: { session: true },
    orderBy: { session: { sessionDate: "asc" } },
  });
  const last6Sessions = s04Sessions.slice(-6);
  const last6Present = last6Sessions.every((r) => r.status === "PRESENT");
  console.log(` - student04: Last 6 sessions all PRESENT = ${last6Present}`);
  if (!last6Present) throw new Error("Assertion failed: student04 expected last 6 sessions to be all PRESENT");

  // CS102 Unit 3 bottleneck (> 40% of class < 50% score)
  const cs102 = await prisma.course.findUnique({ where: { code: "CS102" } });
  if (!cs102) throw new Error("CS102 not found");
  const unit3 = await prisma.curriculumUnit.findFirst({ where: { courseId: cs102.id, unitNumber: 3 } });
  if (!unit3) throw new Error("CS102 Unit 3 not found");

  const unit3Questions = await prisma.assessmentQuestion.findMany({ where: { unitId: unit3.id } });
  const u3QIds = unit3Questions.map((q) => q.id);
  const u3Scores = await prisma.questionScore.findMany({ where: { questionId: { in: u3QIds } } });

  const lowScoreCount = u3Scores.filter((qs) => {
    const q = unit3Questions.find((q) => q.id === qs.questionId);
    return q && qs.score < q.maxScore * 0.5;
  }).length;
  const failureRate = Math.round((lowScoreCount / u3Scores.length) * 1000) / 10;
  console.log(` - CS102 Unit 3: Failure rate = ${failureRate}% (> 40% bottleneck demo)`);
  if (failureRate <= 40) throw new Error(`Assertion failed: CS102 Unit 3 failure rate expected > 40%, found ${failureRate}%`);

  // 15. AuditLog table immutability (Postgres Trigger rejection)
  console.log("\n🔒 Testing AuditLog immutability (Postgres Trigger)...");
  const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
    SELECT tgname 
    FROM pg_trigger 
    JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid 
    WHERE relname = 'AuditLog' AND tgname = 'trigger_audit_log_immutable';
  `;
  if (triggers.length === 0) {
    throw new Error("CRITICAL: trigger_audit_log_immutable not found on AuditLog table in pg_trigger");
  }
  console.log("✓ Verified: trigger_audit_log_immutable exists in pg_trigger");

  const testLog = await prisma.auditLog.create({
    data: {
      entity: "VerificationTestModule2",
      entityId: "test-seed-run",
      justification: "Testing trigger rejection for UPDATE and DELETE",
    },
  });

  const EXPECTED_TRIGGER_MSG = "AuditLog is append-only: UPDATE and DELETE operations are not permitted on table AuditLog";

  let updateRejected = false;
  try {
    await prisma.$executeRaw`UPDATE "AuditLog" SET justification = 'Illegally modified' WHERE id = ${testLog.id}`;
  } catch (err: unknown) {
    updateRejected = true;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes(EXPECTED_TRIGGER_MSG)) {
      throw new Error(`Assertion failed: expected error containing "${EXPECTED_TRIGGER_MSG}", got: ${msg}`);
    }
    const line = msg.split("\n").map((l) => l.trim()).find((l) => l.includes("AuditLog is append-only")) ?? msg;
    console.log(`✓ Expected error on UPDATE: ${line}`);
  }
  if (!updateRejected) throw new Error("CRITICAL: AuditLog allowed UPDATE");

  let deleteRejected = false;
  try {
    await prisma.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${testLog.id}`;
  } catch (err: unknown) {
    deleteRejected = true;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes(EXPECTED_TRIGGER_MSG)) {
      throw new Error(`Assertion failed: expected error containing "${EXPECTED_TRIGGER_MSG}", got: ${msg}`);
    }
    const line = msg.split("\n").map((l) => l.trim()).find((l) => l.includes("AuditLog is append-only")) ?? msg;
    console.log(`✓ Expected error on DELETE: ${line}`);
  }
  if (!deleteRejected) throw new Error("CRITICAL: AuditLog allowed DELETE");

  // 16. Overall Risk Distribution Verification
  console.log("\n📊 Verifying Overall Risk Distribution...");
  const allEnrollments = await prisma.courseEnrollment.findMany({
    include: { student: { select: { email: true } } },
  });

  const totalEnrollments = allEnrollments.length;
  const overallSafe = allEnrollments.filter((e) => e.riskCategory === RiskCategory.SAFE).length;
  const overallModerate = allEnrollments.filter((e) => e.riskCategory === RiskCategory.MODERATE).length;
  const overallCritical = allEnrollments.filter((e) => e.riskCategory === RiskCategory.CRITICAL).length;

  console.log(` - Overall Enrollments: Total=${totalEnrollments}`);
  console.log(`   Safe:     ${overallSafe} (${Math.round((overallSafe / totalEnrollments) * 1000) / 10}%)`);
  console.log(`   Moderate: ${overallModerate} (${Math.round((overallModerate / totalEnrollments) * 1000) / 10}%)`);
  console.log(`   Critical: ${overallCritical} (${Math.round((overallCritical / totalEnrollments) * 1000) / 10}%)`);

  // Exclude scripted demo students from percentage target
  const scriptedEmails = new Set([
    "student01@demo.edu",
    "student02@demo.edu",
    "student03@demo.edu",
    "student04@demo.edu",
  ]);

  const nonScripted = allEnrollments.filter((e) => !scriptedEmails.has(e.student.email));
  const nonScriptedTotal = nonScripted.length;
  const nonScriptedSafe = nonScripted.filter((e) => e.riskCategory === RiskCategory.SAFE).length;
  const nonScriptedModerate = nonScripted.filter((e) => e.riskCategory === RiskCategory.MODERATE).length;
  const nonScriptedCritical = nonScripted.filter((e) => e.riskCategory === RiskCategory.CRITICAL).length;

  const safePct = Math.round((nonScriptedSafe / nonScriptedTotal) * 1000) / 10;
  const moderatePct = Math.round((nonScriptedModerate / nonScriptedTotal) * 1000) / 10;
  const criticalPct = Math.round((nonScriptedCritical / nonScriptedTotal) * 1000) / 10;

  console.log(` - Non-Scripted Cohort (${nonScriptedTotal} enrollments):`);
  console.log(`   Safe:     ${nonScriptedSafe} (${safePct}%) [Target >= 55%]`);
  console.log(`   Moderate: ${nonScriptedModerate} (${moderatePct}%) [Target >= 12%]`);
  console.log(`   Critical: ${nonScriptedCritical} (${criticalPct}%) [Target <= 20%]`);

  if (safePct < 55) {
    throw new Error(`Assertion failed: Safe percentage expected >= 55%, found ${safePct}%`);
  }
  if (moderatePct < 12) {
    throw new Error(`Assertion failed: Moderate percentage expected >= 12%, found ${moderatePct}%`);
  }
  if (criticalPct > 20) {
    throw new Error(`Assertion failed: Critical percentage expected <= 20%, found ${criticalPct}%`);
  }
  console.log("✓ Verified: Safe >= 55%, Moderate >= 12%, and Critical <= 20% on non-scripted cohort");

  console.log("\n====================================================");
  console.log("✅ ALL DATABASE SEED & MODULE 2 ASSERTIONS PASSED!");
  console.log("====================================================");
}

main()
  .catch((e) => {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
