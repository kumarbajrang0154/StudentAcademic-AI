import { prisma } from "@student-academic-ai/database";

async function profileParallel() {
  const targetDeptId = "cmur6bve70000et0g6xcx0yke";
  const start = Date.now();

  const courses = await prisma.course.findMany({
    where: { departmentId: targetDeptId },
    select: { id: true, code: true, name: true, departmentId: true },
  });
  console.log("courses fetched in:", Date.now() - start, "ms");
  const courseIds = courses.map((c) => c.id);

  const t1 = Date.now();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    enrollments,
    unitQuestions,
    completedInterventions,
    pastDueAssessments,
    attendanceSessions,
  ] = await Promise.all([
    prisma.courseEnrollment.findMany({
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
    }),
    prisma.assessmentQuestion.findMany({
      where: { unit: { courseId: { in: courseIds } } },
      select: {
        id: true,
        unitId: true,
        maxScore: true,
        unit: { select: { id: true, courseId: true, unitNumber: true, title: true } },
      },
    }),
    prisma.intervention.findMany({
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
    }),
    prisma.assessment.findMany({
      where: {
        courseId: { in: courseIds },
        dueDate: { lt: new Date() },
      },
      select: {
        id: true,
        dueDate: true,
        scores: { select: { gradedAt: true } },
      },
    }),
    prisma.classSession.findMany({
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
    }),
  ]);

  console.log("Parallel batch 1 completed in:", Date.now() - t1, "ms");

  const t2 = Date.now();
  const questionIds = unitQuestions.map((q) => q.id);
  const interventionStudentIds = Array.from(
    new Set(completedInterventions.map((i) => i.studentId)),
  );

  // Critical student IDs for escalation lookup
  const studentCriticalEnrollmentsMap = new Map<string, typeof enrollments>();
  enrollments.forEach((enr) => {
    if (enr.riskCategory === "CRITICAL") {
      const list = studentCriticalEnrollmentsMap.get(enr.studentId) || [];
      list.push(enr);
      studentCriticalEnrollmentsMap.set(enr.studentId, list);
    }
  });

  const criticalStudentIds = Array.from(studentCriticalEnrollmentsMap.entries())
    .filter(([, enrs]) => enrs.length >= 3)
    .map(([sId]) => sId);

  const [questionScores, studentScoresList, escalationCases] = await Promise.all([
    questionIds.length > 0
      ? prisma.questionScore.findMany({
          where: { questionId: { in: questionIds } },
          select: { questionId: true, score: true },
        })
      : Promise.resolve([]),
    interventionStudentIds.length > 0
      ? prisma.studentScore.findMany({
          where: {
            studentId: { in: interventionStudentIds },
            assessment: { courseId: { in: courseIds } },
          },
          select: {
            studentId: true,
            score: true,
            assessment: { select: { id: true, courseId: true, maxScore: true, weight: true } },
          },
        })
      : Promise.resolve([]),
    criticalStudentIds.length > 0
      ? prisma.escalationCase.findMany({
          where: { studentId: { in: criticalStudentIds } },
          select: {
            id: true,
            studentId: true,
            status: true,
            severity: true,
            createdAt: true,
            dispatchedAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  console.log("Parallel batch 2 completed in:", Date.now() - t2, "ms");
  console.log("TOTAL TIME:", Date.now() - start, "ms");
}

profileParallel().catch(console.error);
