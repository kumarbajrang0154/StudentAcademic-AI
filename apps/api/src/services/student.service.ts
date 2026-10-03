import {
  prisma,
  AttendanceStatus,
  RiskCategory,
} from "@student-academic-ai/database";
import {
  velocityBand,
  explainRisk,
  academicMetricsToRiskInputs,
  attendancePercent,
  safeBunks,
  classesToRecover,
  PLANNED_SESSIONS_PER_COURSE,
} from "@student-academic-ai/core";

export interface StudentOverviewResult {
  student: {
    id: string;
    name: string;
    email: string;
    rollNumber: string | null;
  };
  overallMastery: number;
  overallVelocity: number;
  velocityBand: string;
  velocityDeltaLastWeek: number;
  sparklinePoints: { date: string; mastery: number }[];
  aggregateAttendance: number;
  courses: {
    courseId: string;
    courseCode: string;
    courseName: string;
    facultyName: string;
    credits: number;
    riskScore: number;
    riskCategory: RiskCategory;
    masteryScore: number;
    attendanceRate: number;
    velocity: number;
  }[];
  upcomingDeadlines: {
    id: string;
    title: string;
    type: string;
    courseId: string;
    courseCode: string;
    courseName: string;
    dueDate: Date;
    maxScore: number;
    weight: number;
    daysRemaining: number;
  }[];
}

export async function getStudentOverview(
  studentId: string,
): Promise<StudentOverviewResult> {
  const user = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    throw new Error("Student not found");
  }

  const rollNumber = user.email.startsWith("student")
    ? `2026-CS-${user.email.slice(7, 9)}`
    : null;

  const student = {
    id: user.id,
    name: user.name,
    email: user.email,
    rollNumber,
  };

  // 1. Course enrollments with course details and sessions
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId },
    include: {
      course: {
        include: {
          sessions: {
            take: 1,
            include: {
              faculty: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  // Sort course cards: CRITICAL > MODERATE > SAFE, then by riskScore desc
  const riskRank: Record<RiskCategory, number> = {
    CRITICAL: 3,
    MODERATE: 2,
    SAFE: 1,
  };

  const courseCards = enrollments
    .map((e) => {
      const riskCat = e.riskCategory ?? RiskCategory.SAFE;
      const riskSc = e.riskScore ?? 0;
      const mastSc = e.masteryScore ?? 0;
      const attRate = e.attendanceRate ?? 0;
      const vel = e.velocity ?? 0;
      const facultyName =
        e.course.sessions[0]?.faculty?.name ?? "Faculty Member";

      return {
        courseId: e.courseId,
        courseCode: e.course.code,
        courseName: e.course.name,
        facultyName,
        credits: e.course.credits,
        riskScore: riskSc,
        riskCategory: riskCat,
        masteryScore: mastSc,
        attendanceRate: attRate,
        velocity: vel,
      };
    })
    .sort((a, b) => {
      const diff = riskRank[b.riskCategory] - riskRank[a.riskCategory];
      if (diff !== 0) return diff;
      return b.riskScore - a.riskScore;
    });

  // Overall Mastery (mean of enrolled courses)
  const overallMastery =
    courseCards.length > 0
      ? Math.round(
          (courseCards.reduce((acc, c) => acc + c.masteryScore, 0) /
            courseCards.length) *
            10,
        ) / 10
      : 0;

  // Overall Velocity
  const overallVelocity =
    courseCards.length > 0
      ? Math.round(
          (courseCards.reduce((acc, c) => acc + c.velocity, 0) /
            courseCards.length) *
            1000,
        ) / 1000
      : 0;

  const band = velocityBand(overallVelocity);
  const velocityDeltaLastWeek = Math.round(overallVelocity * 7 * 10) / 10;

  // 14-day sparkline points
  const now = new Date();
  const sparklinePoints: { date: string; mastery: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0]!;
    const rawPoint = overallMastery - overallVelocity * i;
    const clampedPoint = Math.max(0, Math.min(100, Math.round(rawPoint * 10) / 10));
    sparklinePoints.push({ date: dateStr, mastery: clampedPoint });
  }

  // Aggregate Attendance across all enrolled courses
  const enrolledCourseIds = enrollments.map((e) => e.courseId);
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      session: {
        courseId: { in: enrolledCourseIds },
      },
    },
    select: { status: true },
  });

  const totalSessions = attendanceRecords.length;
  let presentCount = 0;
  let onDutyCount = 0;
  for (const r of attendanceRecords) {
    if (r.status === AttendanceStatus.PRESENT) presentCount++;
    else if (
      r.status === AttendanceStatus.ON_DUTY ||
      r.status === AttendanceStatus.MEDICAL_LEAVE
    ) {
      onDutyCount++;
    }
  }

  const aggregateAttendance = attendancePercent(
    presentCount,
    onDutyCount,
    totalSessions,
  );

  // Next 3 Deadlines across enrolled courses
  const upcomingAssessments = await prisma.assessment.findMany({
    where: {
      courseId: { in: enrolledCourseIds },
      dueDate: { gte: now },
    },
    include: {
      course: {
        select: { code: true, name: true },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 3,
  });

  const upcomingDeadlines = upcomingAssessments.map((a) => {
    const msDiff = (a.dueDate ? a.dueDate.getTime() : now.getTime()) - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      courseId: a.courseId,
      courseCode: a.course.code,
      courseName: a.course.name,
      dueDate: a.dueDate ?? now,
      maxScore: a.maxScore,
      weight: a.weight,
      daysRemaining,
    };
  });

  return {
    student,
    overallMastery,
    overallVelocity,
    velocityBand: band,
    velocityDeltaLastWeek,
    sparklinePoints,
    aggregateAttendance,
    courses: courseCards,
    upcomingDeadlines,
  };
}

export async function getStudentCourseDetail(
  studentId: string,
  courseId: string,
) {
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: {
      courseId,
      studentId,
    },
    include: {
      course: {
        include: {
          sessions: {
            take: 1,
            include: {
              faculty: { select: { id: true, name: true, email: true } },
            },
          },
          units: { orderBy: { unitNumber: "asc" } },
        },
      },
    },
  });

  if (!enrollment) {
    throw new Error("Course enrollment not found");
  }

  // Assessments for course with student's score
  const assessments = await prisma.assessment.findMany({
    where: { courseId },
    include: {
      scores: {
        where: { studentId },
      },
      questions: {
        select: {
          id: true,
          maxScore: true,
          topicTag: true,
          unitId: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const assessmentBreakdown = assessments.map((a) => {
    const scoreRecord = a.scores[0];
    const rawScore = scoreRecord?.score ?? null;
    const normalizedScore =
      rawScore !== null
        ? Math.round((rawScore / a.maxScore) * 1000) / 10
        : null;

    return {
      id: a.id,
      title: a.title,
      type: a.type,
      dueDate: a.dueDate,
      maxScore: a.maxScore,
      weight: a.weight,
      rawScore,
      normalizedScore,
      status: rawScore !== null ? "EVALUATED" : "Awaiting Evaluation",
      questionCount: a.questions.length,
    };
  });

  const scoreHistory = assessmentBreakdown
    .filter((a) => a.rawScore !== null)
    .map((a) => ({
      assessmentId: a.id,
      title: a.title,
      type: a.type,
      dueDate: a.dueDate,
      rawScore: a.rawScore!,
      maxScore: a.maxScore,
      normalizedScore: a.normalizedScore!,
      weight: a.weight,
    }));

  // Per-type performance breakdown & CAT1 -> CAT2 trend
  const typeMap: Record<string, { totalPct: number; count: number }> = {};
  for (const a of assessmentBreakdown) {
    if (a.normalizedScore !== null) {
      const t = a.type || "OTHER";
      if (!typeMap[t]) typeMap[t] = { totalPct: 0, count: 0 };
      typeMap[t].totalPct += a.normalizedScore;
      typeMap[t].count++;
    }
  }

  const perTypeAverages: Record<string, number> = {};
  for (const [t, d] of Object.entries(typeMap)) {
    perTypeAverages[t] = d.count > 0 ? Math.round((d.totalPct / d.count) * 10) / 10 : 0;
  }

  const cat1Val = perTypeAverages["CAT1"] ?? null;
  const cat2Val = perTypeAverages["CAT2"] ?? null;
  let catDiff: number | null = null;
  let catDirection: "UP" | "DOWN" | "STABLE" | "N/A" = "N/A";
  if (cat1Val !== null && cat2Val !== null) {
    catDiff = Math.round((cat2Val - cat1Val) * 10) / 10;
    catDirection = catDiff > 0 ? "UP" : catDiff < 0 ? "DOWN" : "STABLE";
  }

  const perTypeBreakdown = {
    averages: perTypeAverages,
    catTrend: {
      cat1: cat1Val,
      cat2: cat2Val,
      diff: catDiff,
      direction: catDirection,
    },
  };

  return {
    course: {
      id: enrollment.course.id,
      code: enrollment.course.code,
      name: enrollment.course.name,
      credits: enrollment.course.credits,
      semester: enrollment.semester,
      faculty: enrollment.course.sessions[0]?.faculty ?? null,
      units: enrollment.course.units,
    },
    metrics: {
      attendanceRate: enrollment.attendanceRate ?? 0,
      masteryScore: enrollment.masteryScore ?? 0,
      velocity: enrollment.velocity ?? 0,
      submissionDeficit: enrollment.submissionDeficit ?? 0,
      riskScore: enrollment.riskScore ?? 0,
      riskCategory: enrollment.riskCategory ?? RiskCategory.SAFE,
      failRisk: enrollment.failRisk,
      weakSubjectFlag: enrollment.weakSubjectFlag,
      attendanceWarningLevel: enrollment.attendanceWarningLevel,
    },
    perTypeBreakdown,
    assessmentBreakdown,
    scoreHistory,
  };
}

export interface AttendanceSimulatorOptions {
  studentId?: string;
  courseId?: string;
  hypotheticalMissedClasses?: number;
  targetThreshold?: number;
  currentAttended?: number;
  currentTotal?: number;
}

export async function simulateAttendance(options: AttendanceSimulatorOptions) {
  let P = options.currentAttended ?? 0;
  let T = options.currentTotal ?? 0;

  if (options.studentId && options.courseId) {
    const records = await prisma.attendanceRecord.findMany({
      where: {
        studentId: options.studentId,
        session: { courseId: options.courseId },
      },
      select: { status: true },
    });

    T = records.length;
    P = records.filter(
      (r) =>
        r.status === AttendanceStatus.PRESENT ||
        r.status === AttendanceStatus.ON_DUTY ||
        r.status === AttendanceStatus.MEDICAL_LEAVE,
    ).length;
  }

  const h = options.hypotheticalMissedClasses ?? 0;
  const targetThreshold = options.targetThreshold ?? 75;
  const PLANNED = PLANNED_SESSIONS_PER_COURSE; // 30
  const remainingSessions = Math.max(0, PLANNED - T);

  const currentAttendance =
    T > 0 ? Math.round((P / T) * 1000) / 10 : 100;

  const projectedTotal = T + h;
  const projectedAttendance =
    projectedTotal > 0
      ? Math.round((P / projectedTotal) * 1000) / 10
      : 100;

  let safeBunksRemaining = 0;
  if (targetThreshold > 0) {
    const maxK = Math.floor(
      (100 * P - targetThreshold * T) / targetThreshold,
    );
    safeBunksRemaining = Math.max(0, maxK);
  }

  let classesNeededConsecutive = 0;
  if (currentAttendance < targetThreshold && targetThreshold < 100) {
    const numerator = targetThreshold * T - 100 * P;
    const denominator = 100 - targetThreshold;
    classesNeededConsecutive = Math.max(0, Math.ceil(numerator / denominator));
  }

  const maxPossibleAttended = P + remainingSessions;
  const maxPossibleRate =
    PLANNED > 0 ? (maxPossibleAttended / PLANNED) * 100 : 100;

  const isMathematicallyIrrecoverable =
    classesNeededConsecutive > remainingSessions ||
    maxPossibleRate < targetThreshold;

  const status =
    projectedAttendance >= targetThreshold
      ? "SAFE"
      : projectedAttendance >= 65
        ? "AT_RISK"
        : "BREACH_WARNING";

  const mode =
    h > 0
      ? "SAFE_BUNK"
      : currentAttendance < targetThreshold
        ? "REMEDY"
        : "SAFE_BUNK";

  return {
    mode,
    currentAttendance,
    hypotheticalMissedClasses: h,
    targetThreshold,
    projectedAttendance,
    safeBunksRemaining,
    classesNeededConsecutive,
    isMathematicallyIrrecoverable,
    remainingSessions,
    totalConductedSessions: T,
    plannedSessions: PLANNED,
    status,
  };
}

export async function getRiskExplanation(
  studentId: string,
  courseId: string,
) {
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: {
      courseId,
      studentId,
    },
    include: {
      course: true,
      student: { select: { id: true, name: true } },
    },
  });

  if (!enrollment) {
    throw new Error("Enrollment not found");
  }

  const attRate = enrollment.attendanceRate ?? 0;
  const mastScore = enrollment.masteryScore ?? 0;
  const vel = enrollment.velocity ?? 0;
  const subDeficit = enrollment.submissionDeficit ?? 0;

  // Cohort average mastery for evidence comparison
  const cohortEnrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    select: { masteryScore: true },
  });

  const validScores = cohortEnrollments
    .map((c) => c.masteryScore ?? 50)
    .filter((s) => s != null);

  const cohortMeanMastery =
    validScores.length > 0
      ? Math.round(
          (validScores.reduce((acc, c) => acc + c, 0) / validScores.length) *
            10,
        ) / 10
      : 50;

  // Convert metrics to risk inputs
  const inputs = academicMetricsToRiskInputs(
    attRate,
    mastScore,
    vel,
    100 - subDeficit,
  );

  const riskResult = explainRisk(inputs);

  // Analyze weekday absence patterns
  const absentRecords = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      status: AttendanceStatus.ABSENT,
      session: { courseId },
    },
    include: {
      session: { select: { sessionDate: true } },
    },
  });

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const weekdayCounts: Record<string, number> = {
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
  };

  for (const rec of absentRecords) {
    const day = dayNames[rec.session.sessionDate.getDay()];
    if (day && weekdayCounts[day] !== undefined) {
      weekdayCounts[day]++;
    }
  }

  let patternDescription = "No recurring weekday absence patterns detected.";
  const maxDayEntry = Object.entries(weekdayCounts).sort((a, b) => b[1] - a[1])[0];
  if (maxDayEntry && maxDayEntry[1] >= 2) {
    patternDescription = `Missed ${maxDayEntry[1]} consecutive or frequent ${maxDayEntry[0]} lectures`;
  }

  // Single source of truth: persisted CourseEnrollment.riskCategory
  const persistedCategory = enrollment.riskCategory ?? RiskCategory.SAFE;

  let overrideReason: string | null = null;
  if (persistedCategory === RiskCategory.CRITICAL && riskResult.compositeScore < 65) {
    if (vel <= -1.5) {
      overrideReason = `Velocity ${vel.toFixed(2)}%/day triggered automatic Critical override`;
    } else if (attRate <= 60 && mastScore <= 35) {
      overrideReason = `Low attendance (${attRate.toFixed(1)}%) and low mastery (${mastScore.toFixed(1)}%) triggered automatic Critical override`;
    } else {
      overrideReason = "Acute risk indicator triggered automatic Critical override";
    }
  }

  // Build plain-English evidence strings
  const featureAttributions = riskResult.riskIncreasingFactors.map((f) => {
    let evidence = "";
    if (f.factor === "mastery") {
      evidence = `Mastery at ${mastScore.toFixed(1)}% (Cohort mean: ${cohortMeanMastery.toFixed(1)}%)`;
      if (overrideReason && attRate <= 60 && mastScore <= 35) {
        evidence = `${evidence} - ${overrideReason}`;
      }
    } else if (f.factor === "attendance") {
      evidence = `Attendance is ${attRate.toFixed(1)}% (Institutional threshold: 75.0%)`;
    } else if (f.factor === "velocity") {
      evidence = `Academic velocity is ${vel.toFixed(3)}%/day (${velocityBand(vel)})`;
      if (overrideReason && vel <= -1.5) {
        evidence = `${evidence} - ${overrideReason}`;
      }
    } else if (f.factor === "submission") {
      evidence = `Submission deficit is ${subDeficit.toFixed(1)}% past due without submission`;
    }

    return {
      factor: f.factor,
      contribution: f.contribution,
      percentage: f.percentage,
      evidence,
    };
  });

  const protectiveFactors = riskResult.protectiveFactors.map((f) => {
    let evidence = "";
    if (f.factor === "attendance") {
      evidence = `Consistent attendance at ${attRate.toFixed(1)}% (Protective: well above threshold)`;
    } else if (f.factor === "mastery") {
      evidence = `Solid mastery at ${mastScore.toFixed(1)}% demonstrates strong baseline comprehension`;
    } else if (f.factor === "velocity") {
      evidence = `Positive academic velocity of +${vel.toFixed(3)}%/day indicates upward trajectory`;
    } else if (f.factor === "submission") {
      evidence = `Perfect or near-perfect assignment turnaround (100% on-time submission rate)`;
    }

    return {
      factor: f.factor,
      contribution: f.contribution,
      evidence,
    };
  });

  // Prescribed interventions
  const prescribedInterventions: string[] = [];
  const topFactor = featureAttributions[0]?.factor;

  if (topFactor === "mastery") {
    prescribedInterventions.push("Review targeted topic notes and supplementary problem sets");
    prescribedInterventions.push("Attend peer-assisted remedial session or faculty office hours");
  } else if (topFactor === "attendance") {
    prescribedInterventions.push("Attendance alert triggered: meet academic advisor regarding leave recovery");
    prescribedInterventions.push("Ensure medical or on-duty certificates are submitted for regularization");
  } else if (topFactor === "velocity") {
    prescribedInterventions.push("Performance trajectory declining: schedule 15-minute diagnostic with mentor");
  } else if (topFactor === "submission") {
    prescribedInterventions.push("Submit overdue lab/assignment components to avoid penalty escalation");
  }

  if (persistedCategory === RiskCategory.CRITICAL) {
    prescribedInterventions.push("Automated Tier-1 escalation case initiated for academic support review");
  }

  return {
    studentId,
    courseId,
    courseCode: enrollment.course.code,
    courseName: enrollment.course.name,
    compositeRiskScore: riskResult.compositeScore,
    riskLevel: persistedCategory,
    overrideReason,
    velocity: vel,
    velocityBand: velocityBand(vel),
    featureAttributions,
    protectiveFactors,
    absencePatterns: {
      weekdayBreakdown: weekdayCounts,
      patternDescription,
    },
    prescribedInterventions,
  };
}

export async function getStudentBenchmarks(
  studentId: string,
  courseId: string,
) {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    select: { studentId: true, masteryScore: true },
    orderBy: { masteryScore: "asc" },
  });

  const cohortSize = enrollments.length;
  if (cohortSize === 0) {
    throw new Error("No enrollment data available for course");
  }

  const scores: number[] = enrollments.map((e) => e.masteryScore ?? 0);
  const mid = Math.floor(cohortSize / 2);
  const median =
    cohortSize % 2 !== 0
      ? scores[mid]!
      : ((scores[mid - 1]! + scores[mid]!) / 2);

  // Small cohort privacy rule: < 15 return only median and reason
  if (cohortSize < 15) {
    return {
      courseId,
      cohortSize,
      median: Math.round(median * 10) / 10,
      restricted: true,
      reason: "Cohort size under 15; detailed distribution withheld to protect privacy",
    };
  }

  // Calculate mean and standard deviation
  const sum = scores.reduce((acc, s) => acc + s, 0);
  const mean = Math.round((sum / cohortSize) * 10) / 10;

  const variance =
    scores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / cohortSize;
  const sd = Math.round(Math.sqrt(variance) * 10) / 10;

  const studentEnrollment = enrollments.find((e) => e.studentId === studentId);
  const studentScore = studentEnrollment?.masteryScore ?? 0;

  // Percentile rank: % of cohort strictly below studentScore
  const strictlyBelow = scores.filter((s) => s < studentScore).length;
  const percentile = Math.round((strictlyBelow / cohortSize) * 1000) / 10;

  // Histogram bins (5 bins: 0-20, 20-40, 40-60, 60-80, 80-100)
  const bins = [
    { range: "0-20", min: 0, max: 20, count: 0 },
    { range: "20-40", min: 20, max: 40, count: 0 },
    { range: "40-60", min: 40, max: 60, count: 0 },
    { range: "60-80", min: 60, max: 80, count: 0 },
    { range: "80-100", min: 80, max: 100, count: 0 },
  ];

  for (const s of scores) {
    if (s <= 20) bins[0]!.count++;
    else if (s <= 40) bins[1]!.count++;
    else if (s <= 60) bins[2]!.count++;
    else if (s <= 80) bins[3]!.count++;
    else bins[4]!.count++;
  }

  return {
    courseId,
    cohortSize,
    studentScore,
    percentile,
    mean,
    sd,
    median: Math.round(median * 10) / 10,
    histogramBins: bins,
    restricted: false,
  };
}

export async function getStudentPrescriptions(studentId: string) {
  // 1. Identify topics where student scored < 50% on question scores
  const lowQuestionScores = await prisma.questionScore.findMany({
    where: {
      studentId,
    },
    include: {
      question: {
        select: {
          id: true,
          topicTag: true,
          maxScore: true,
          assessment: {
            select: {
              course: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  });

  const topicDeficits = new Map<
    string,
    {
      courseCode: string;
      courseName: string;
      totalEarned: number;
      totalPossible: number;
    }
  >();

  for (const qs of lowQuestionScores) {
    const q = qs.question;
    const ratio = qs.score / q.maxScore;
    if (ratio < 0.5) {
      const existing = topicDeficits.get(q.topicTag) ?? {
        courseCode: q.assessment.course.code,
        courseName: q.assessment.course.name,
        totalEarned: 0,
        totalPossible: 0,
      };
      existing.totalEarned += qs.score;
      existing.totalPossible += q.maxScore;
      topicDeficits.set(q.topicTag, existing);
    }
  }

  const prescriptions = [];

  for (const [topicTag, info] of topicDeficits.entries()) {
    const matchingResources = await prisma.resource.findMany({
      where: {
        topicTag: {
          contains: topicTag,
          mode: "insensitive",
        },
      },
    });

    const masteryPercent =
      info.totalPossible > 0
        ? Math.round((info.totalEarned / info.totalPossible) * 1000) / 10
        : 0;

    if (matchingResources.length > 0) {
      prescriptions.push({
        topicTag,
        courseCode: info.courseCode,
        courseName: info.courseName,
        currentMastery: masteryPercent,
        resources: matchingResources.map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type,
          url: r.url,
          chapterRef: r.chapterRef,
        })),
        isFallback: false,
      });
    } else {
      const peersNeedingTopic = await prisma.questionScore.count({
        where: {
          question: { topicTag },
          score: { lt: 5 },
        },
      });

      prescriptions.push({
        topicTag,
        courseCode: info.courseCode,
        courseName: info.courseName,
        currentMastery: masteryPercent,
        resources: [
          {
            id: `fallback-${topicTag.toLowerCase().replace(/\s+/g, "-")}`,
            title: `Curated Study Guide: ${topicTag}`,
            type: "NOTES",
            url: `https://learn.demo.edu/notes/${encodeURIComponent(topicTag)}`,
            chapterRef: "Curriculum Reference Material",
          },
        ],
        isFallback: true,
        demandNotice: `${peersNeedingTopic || 1} students need material on ${topicTag}`,
      });
    }
  }

  return {
    studentId,
    prescriptions,
  };
}

export async function getStudentCalendar(studentId: string) {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId },
    select: { courseId: true },
  });

  const enrolledCourseIds = enrollments.map((e) => e.courseId);
  const now = new Date();
  const pastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Deadlines
  const assessments = await prisma.assessment.findMany({
    where: {
      courseId: { in: enrolledCourseIds },
      dueDate: { gte: pastWeek },
    },
    include: {
      course: { select: { code: true, name: true } },
      scores: { where: { studentId } },
    },
    orderBy: { dueDate: "asc" },
  });

  const deadlines = assessments.map((a) => {
    const dueTime = a.dueDate ? a.dueDate.getTime() : now.getTime();
    const hoursRemaining = Math.round((dueTime - now.getTime()) / (1000 * 60 * 60));

    let reminderState: "T-2h" | "T-24h" | "T-48h" | "UPCOMING" | "PAST_DUE" =
      "UPCOMING";

    if (hoursRemaining < 0) {
      reminderState = "PAST_DUE";
    } else if (hoursRemaining <= 2) {
      reminderState = "T-2h";
    } else if (hoursRemaining <= 24) {
      reminderState = "T-24h";
    } else if (hoursRemaining <= 48) {
      reminderState = "T-48h";
    }

    const hasScore = a.scores.length > 0 && a.scores[0]?.score != null;

    return {
      assessmentId: a.id,
      title: a.title,
      type: a.type,
      courseCode: a.course.code,
      courseName: a.course.name,
      dueDate: a.dueDate,
      hoursRemaining,
      reminderState,
      isEvaluated: hasScore,
      score: hasScore ? a.scores[0]!.score : null,
      maxScore: a.maxScore,
    };
  });

  // Timetable slots
  const timetableSlots = await prisma.timetableSlot.findMany({
    where: { courseId: { in: enrolledCourseIds } },
    include: {
      course: { select: { code: true, name: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  return {
    studentId,
    deadlines,
    schedule: timetableSlots.map((s) => ({
      id: s.id,
      courseCode: s.course.code,
      courseName: s.course.name,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      roomNumber: s.room,
    })),
  };
}

export interface CourseAttendanceSummary {
  courseId: string;
  courseCode: string;
  courseName: string;
  facultyName: string;
  conducted: number;
  attended: number;
  onDuty: number;
  absent: number;
  percentage: number;
  status: "SAFE" | "WARNING" | "CRITICAL";
  safeBunks: number;
  classesToRecover: number;
}

export interface StudentAttendanceSummary {
  studentId: string;
  totalConducted: number;
  totalAttended: number;
  totalOnDuty: number;
  totalAbsent: number;
  overallPercentage: number;
  overallStatus: "SAFE" | "WARNING" | "CRITICAL";
  overallSafeBunks: number;
  overallClassesToRecover: number;
  courses: CourseAttendanceSummary[];
}

export async function getStudentAttendanceSummary(
  studentId: string,
): Promise<StudentAttendanceSummary> {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId },
    include: {
      course: {
        include: {
          sessions: {
            take: 1,
            include: {
              faculty: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { course: { code: "asc" } },
  });

  const courses: CourseAttendanceSummary[] = [];
  let totalConducted = 0;
  let totalAttended = 0;
  let totalOnDuty = 0;
  let totalAbsent = 0;

  for (const enrollment of enrollments) {
    const records = await prisma.attendanceRecord.findMany({
      where: {
        studentId,
        session: { courseId: enrollment.courseId },
      },
      select: { status: true },
    });

    const conducted = records.length;
    let attended = 0;
    let onDuty = 0;
    let absent = 0;

    for (const r of records) {
      if (r.status === AttendanceStatus.PRESENT) attended++;
      else if (
        r.status === AttendanceStatus.ON_DUTY ||
        r.status === AttendanceStatus.MEDICAL_LEAVE
      ) {
        onDuty++;
      } else if (r.status === AttendanceStatus.ABSENT) {
        absent++;
      }
    }

    totalConducted += conducted;
    totalAttended += attended;
    totalOnDuty += onDuty;
    totalAbsent += absent;

    const percentage = attendancePercent(attended, onDuty, conducted);
    const bunks = safeBunks(attended, onDuty, conducted, 0.75);
    const recover = classesToRecover(attended, onDuty, conducted, 0.75);
    const status: "SAFE" | "WARNING" | "CRITICAL" =
      percentage >= 75 ? "SAFE" : percentage >= 65 ? "WARNING" : "CRITICAL";

    const facultyName =
      enrollment.course.sessions[0]?.faculty?.name ?? "Faculty Member";

    courses.push({
      courseId: enrollment.courseId,
      courseCode: enrollment.course.code,
      courseName: enrollment.course.name,
      facultyName,
      conducted,
      attended,
      onDuty,
      absent,
      percentage: Math.round(percentage * 10) / 10,
      status,
      safeBunks: bunks,
      classesToRecover: recover,
    });
  }

  const overallPercentage = attendancePercent(
    totalAttended,
    totalOnDuty,
    totalConducted,
  );
  const overallSafeBunks = safeBunks(
    totalAttended,
    totalOnDuty,
    totalConducted,
    0.75,
  );
  const overallClassesToRecover = classesToRecover(
    totalAttended,
    totalOnDuty,
    totalConducted,
    0.75,
  );
  const overallStatus: "SAFE" | "WARNING" | "CRITICAL" =
    overallPercentage >= 75
      ? "SAFE"
      : overallPercentage >= 65
        ? "WARNING"
        : "CRITICAL";

  return {
    studentId,
    totalConducted,
    totalAttended,
    totalOnDuty,
    totalAbsent,
    overallPercentage: Math.round(overallPercentage * 10) / 10,
    overallStatus,
    overallSafeBunks,
    overallClassesToRecover,
    courses,
  };
}

