import { prisma } from "@student-academic-ai/database";

async function profile() {
  const targetDeptId = "cmur6bve70000et0g6xcx0yke";
  
  let t = Date.now();
  const courses = await prisma.course.findMany({
    where: { departmentId: targetDeptId },
    select: { id: true, code: true, name: true, departmentId: true },
  });
  console.log("1. courses:", Date.now() - t, "ms");
  const courseIds = courses.map((c) => c.id);

  t = Date.now();
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId: { in: courseIds } },
    select: {
      id: true,
      studentId: true,
      courseId: true,
      riskCategory: true,
      riskScore: true,
      attendanceRate: true,
      masteryScore: true,
      velocity: true,
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          departmentId: true,
          mentorAssignmentsAsStudent: {
            where: { active: true },
            select: { mentor: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  console.log("2. enrollments:", Date.now() - t, "ms");

  t = Date.now();
  const unitQuestions = await prisma.assessmentQuestion.findMany({
    where: { unit: { courseId: { in: courseIds } } },
    select: {
      id: true,
      unitId: true,
      maxScore: true,
      unit: { select: { id: true, courseId: true, unitNumber: true, title: true } },
    },
  });
  console.log("3. unitQuestions:", Date.now() - t, "ms");
  const questionIds = unitQuestions.map((q) => q.id);

  t = Date.now();
  const questionScores = await prisma.questionScore.findMany({
    where: { questionId: { in: questionIds } },
    select: { questionId: true, score: true },
  });
  console.log("4. questionScores:", Date.now() - t, "ms");

  t = Date.now();
  const completedInterventions = await prisma.intervention.findMany({
    where: {
      status: "COMPLETED",
      courseId: { in: courseIds },
      preScoreAvg: { not: null },
    },
    select: {
      id: true,
      studentId: true,
      courseId: true,
      preScoreAvg: true,
      postScoreAvg: true,
      scheduledAt: true,
    },
  });
  console.log("5. completedInterventions:", Date.now() - t, "ms");

  t = Date.now();
  const interventionStudentIds = Array.from(
    new Set(completedInterventions.map((i) => i.studentId)),
  );
  const studentScoresList = await prisma.studentScore.findMany({
    where: {
      studentId: { in: interventionStudentIds },
      assessment: { courseId: { in: courseIds } },
    },
    select: {
      studentId: true,
      score: true,
      assessment: { select: { id: true, courseId: true, maxScore: true, weight: true } },
    },
  });
  console.log("6. studentScoresList:", Date.now() - t, "ms");

  t = Date.now();
  const pastDueAssessments = await prisma.assessment.findMany({
    where: {
      courseId: { in: courseIds },
      dueDate: { lt: new Date() },
    },
    select: {
      id: true,
      dueDate: true,
      scores: { select: { gradedAt: true } },
    },
  });
  console.log("7. pastDueAssessments:", Date.now() - t, "ms");

  t = Date.now();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const attendanceSessions = await prisma.classSession.findMany({
    where: {
      courseId: { in: courseIds },
      sessionDate: { gte: fourteenDaysAgo },
    },
    select: {
      id: true,
      sessionDate: true,
      course: { select: { code: true } },
      attendanceRecords: { select: { status: true } },
    },
    orderBy: { sessionDate: "asc" },
  });
  console.log("8. attendanceSessions:", Date.now() - t, "ms");

  t = Date.now();
  const escalationCases = await prisma.escalationCase.findMany({
    select: {
      id: true,
      studentId: true,
      status: true,
      severity: true,
      createdAt: true,
      dispatchedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  console.log("9. escalationCases:", Date.now() - t, "ms");
}

profile().catch(console.error);
