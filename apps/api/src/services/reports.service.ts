import { prisma, AttendanceStatus } from "@student-academic-ai/database";
import { attendancePercent } from "@student-academic-ai/core";
import { AuthUser, canAccessCourse } from "../lib/rbac.js";
import { exportReport, ExportFormat, ExportResult, ExportReportOptions, ColumnDefinition } from "./export.service.js";
import { getCourseAccreditation } from "./accreditation.service.js";

/**
 * Validates course access for reports:
 * - ADMIN: all courses
 * - HOD: courses in their department
 * - FACULTY: only courses where they are the primary faculty or session instructor
 * - MENTOR / STUDENT: forbidden (403)
 */
async function getAuthorizedCourse(courseIdOrCode: string, user: AuthUser) {
  if (user.role === "STUDENT" || user.role === "MENTOR") {
    throw new Error("FORBIDDEN");
  }

  const course = await prisma.course.findFirst({
    where: {
      OR: [{ id: courseIdOrCode }, { code: courseIdOrCode }],
    },
    include: {
      department: true,
      sessions: { select: { facultyId: true } },
    },
  });

  if (!course) {
    throw new Error("COURSE_NOT_FOUND");
  }

  if (!canAccessCourse(user, course)) {
    throw new Error("FORBIDDEN");
  }

  return course;
}

// =========================================================================
// 1. ATTENDANCE REPORT
// =========================================================================

export interface StudentAttendanceRow {
  studentId: string;
  rollNumber: string;
  name: string;
  conducted: number;
  attended: number;
  odMedical: number;
  percentage: number;
  status: string;
  shortageFlag: boolean;
  shortageText: string;
  [key: string]: unknown;
}

export interface AttendanceReportData {
  course: {
    id: string;
    code: string;
    name: string;
    departmentCode: string;
  };
  totalSessionsConducted: number;
  students: StudentAttendanceRow[];
  projectedDebarments: Array<{
    studentId: string;
    rollNumber: string;
    name: string;
    percentage: number;
  }>;
  summary: {
    totalStudents: number;
    averageAttendance: number;
    shortageCount: number;
    debarmentRiskCount: number;
  };
}

export async function getAttendanceReportData(
  courseIdOrCode: string,
  user: AuthUser,
): Promise<AttendanceReportData> {
  const course = await getAuthorizedCourse(courseIdOrCode, user);

  // Bulk load enrollments with students
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId: course.id },
    include: {
      student: { select: { id: true, name: true, email: true } },
    },
    orderBy: { student: { name: "asc" } },
  });

  const studentIds = enrollments.map((e) => e.studentId);

  // Total sessions conducted
  const totalSessionsConducted = await prisma.classSession.count({
    where: { courseId: course.id },
  });

  // Bulk attendance records
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      session: { courseId: course.id },
      studentId: { in: studentIds },
    },
    select: { studentId: true, status: true },
  });

  const attMap = new Map<string, { present: number; odMedical: number }>();
  for (const sId of studentIds) {
    attMap.set(sId, { present: 0, odMedical: 0 });
  }

  for (const r of attendanceRecords) {
    const item = attMap.get(r.studentId);
    if (!item) continue;
    if (r.status === AttendanceStatus.PRESENT) {
      item.present++;
    } else if (
      r.status === AttendanceStatus.ON_DUTY ||
      r.status === AttendanceStatus.MEDICAL_LEAVE
    ) {
      item.odMedical++;
    }
  }

  let totalPctSum = 0;
  let shortageCount = 0;

  const studentRows: StudentAttendanceRow[] = enrollments.map((enr) => {
    const counts = attMap.get(enr.studentId) ?? { present: 0, odMedical: 0 };
    const pct = totalSessionsConducted > 0
      ? attendancePercent(counts.present, counts.odMedical, totalSessionsConducted)
      : 100;

    const shortage = pct < 75;
    if (shortage) shortageCount++;
    totalPctSum += pct;

    const roll = enr.student.email.split("@")[0]?.toUpperCase() ?? "STU";

    return {
      studentId: enr.student.id,
      rollNumber: roll,
      name: enr.student.name,
      conducted: totalSessionsConducted,
      attended: counts.present,
      odMedical: counts.odMedical,
      percentage: pct,
      status: enr.riskCategory ?? "SAFE",
      shortageFlag: shortage,
      shortageText: shortage ? "SHORTAGE" : "NORMAL",
    };
  });

  const projectedDebarments = studentRows
    .filter((s) => s.shortageFlag)
    .map((s) => ({
      studentId: s.studentId,
      rollNumber: s.rollNumber,
      name: s.name,
      percentage: s.percentage,
    }));

  const avgAtt = studentRows.length > 0 ? Math.round((totalPctSum / studentRows.length) * 10) / 10 : 0;

  return {
    course: {
      id: course.id,
      code: course.code,
      name: course.name,
      departmentCode: course.department.code,
    },
    totalSessionsConducted,
    students: studentRows,
    projectedDebarments,
    summary: {
      totalStudents: studentRows.length,
      averageAttendance: avgAtt,
      shortageCount,
      debarmentRiskCount: projectedDebarments.length,
    },
  };
}

export async function exportAttendanceReport(
  courseIdOrCode: string,
  format: ExportFormat,
  user: AuthUser,
): Promise<ExportResult> {
  const data = await getAttendanceReportData(courseIdOrCode, user);

  const opts: ExportReportOptions = {
    reportType: "attendance",
    format,
    title: `${data.course.code} Attendance Report`,
    courseCode: data.course.code,
    departmentCode: data.course.departmentCode,
    columns: [
      { header: "Roll No", key: "rollNumber", width: 14 },
      { header: "Student Name", key: "name", width: 22 },
      { header: "Conducted", key: "conducted", width: 12, isNumeric: true },
      { header: "Attended", key: "attended", width: 12, isNumeric: true },
      { header: "OD / ML", key: "odMedical", width: 12, isNumeric: true },
      { header: "Attendance %", key: "percentage", width: 15, isPercent: true },
      { header: "Risk Status", key: "status", width: 14 },
      { header: "Shortage Flag", key: "shortageText", width: 16 },
    ],
    rows: data.students,
    summaryRows: [
      { label: "Total Students", value: data.summary.totalStudents },
      { label: "Total Sessions Conducted", value: data.totalSessionsConducted },
      { label: "Average Attendance", value: `${data.summary.averageAttendance}%` },
      { label: "Shortage Count (<75%)", value: data.summary.shortageCount },
      { label: "Projected Debarments", value: data.summary.debarmentRiskCount },
    ],
    user,
    targetId: data.course.id,
  };

  return exportReport(opts);
}

// =========================================================================
// 2. MARKS REPORT
// =========================================================================

export interface StudentMarksRow {
  studentId: string;
  rollNumber: string;
  name: string;
  assessmentScores: Record<string, number | null>;
  weightedTotal: number;
  mastery: number;
  failRisk: string;
}

export interface MarksReportData {
  course: {
    id: string;
    code: string;
    name: string;
    departmentCode: string;
  };
  assessments: Array<{
    id: string;
    title: string;
    type: string;
    maxScore: number;
    weight: number;
  }>;
  students: StudentMarksRow[];
  classStatistics: {
    meanMastery: number;
    medianMastery: number;
    passPercentage: number;
    perTypeAverages: Record<string, number>;
  };
}

export async function getMarksReportData(
  courseIdOrCode: string,
  user: AuthUser,
): Promise<MarksReportData> {
  const course = await getAuthorizedCourse(courseIdOrCode, user);

  const [assessments, enrollments] = await Promise.all([
    prisma.assessment.findMany({
      where: { courseId: course.id },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
    prisma.courseEnrollment.findMany({
      where: { courseId: course.id },
      include: {
        student: { select: { id: true, name: true, email: true } },
      },
      orderBy: { student: { name: "asc" } },
    }),
  ]);

  const studentIds = enrollments.map((e) => e.studentId);

  const studentScores = await prisma.studentScore.findMany({
    where: {
      assessment: { courseId: course.id },
      studentId: { in: studentIds },
    },
    select: { studentId: true, assessmentId: true, score: true },
  });

  const scoreMap = new Map<string, Map<string, number>>();
  for (const sId of studentIds) {
    scoreMap.set(sId, new Map());
  }
  for (const s of studentScores) {
    if (typeof s.score === "number") {
      scoreMap.get(s.studentId)?.set(s.assessmentId, s.score);
    }
  }

  // Type averages tracker
  const typeTotals = new Map<string, { sumNormalized: number; count: number }>();
  for (const a of assessments) {
    if (!typeTotals.has(a.type)) {
      typeTotals.set(a.type, { sumNormalized: 0, count: 0 });
    }
  }

  const masteryList: number[] = [];
  let passCount = 0;

  const studentRows: StudentMarksRow[] = enrollments.map((enr) => {
    const sScores = scoreMap.get(enr.studentId) ?? new Map();
    const assessmentScores: Record<string, number | null> = {};
    let weightedTotal = 0;

    for (const a of assessments) {
      const score = sScores.get(a.id);
      if (typeof score === "number") {
        assessmentScores[a.id] = score;
        const normalized = (score / a.maxScore) * 100;
        const entry = typeTotals.get(a.type);
        if (entry) {
          entry.sumNormalized += normalized;
          entry.count++;
        }
        weightedTotal += score * (a.weight / a.maxScore);
      } else {
        assessmentScores[a.id] = null;
      }
    }

    const mastery = enr.masteryScore ?? 0;
    masteryList.push(mastery);
    if (mastery >= 40) {
      passCount++;
    }

    const roll = enr.student.email.split("@")[0]?.toUpperCase() ?? "STU";

    return {
      studentId: enr.student.id,
      rollNumber: roll,
      name: enr.student.name,
      assessmentScores,
      weightedTotal: Math.round(weightedTotal * 100) / 100,
      mastery,
      failRisk: enr.failRisk ?? "ON_TRACK",
    };
  });

  // Calculate statistics
  masteryList.sort((a, b) => a - b);
  const meanMastery = masteryList.length > 0
    ? Math.round((masteryList.reduce((acc, v) => acc + v, 0) / masteryList.length) * 100) / 100
    : 0;

  let medianMastery = 0;
  if (masteryList.length > 0) {
    const mid = Math.floor(masteryList.length / 2);
    medianMastery =
      masteryList.length % 2 !== 0
        ? masteryList[mid]!
        : Math.round(((masteryList[mid - 1]! + masteryList[mid]!) / 2) * 100) / 100;
  }

  const passPercentage =
    masteryList.length > 0
      ? Math.round((passCount / masteryList.length) * 10000) / 100
      : 0;

  const perTypeAverages: Record<string, number> = {};
  for (const [type, item] of typeTotals.entries()) {
    perTypeAverages[type] = item.count > 0 ? Math.round((item.sumNormalized / item.count) * 100) / 100 : 0;
  }

  return {
    course: {
      id: course.id,
      code: course.code,
      name: course.name,
      departmentCode: course.department.code,
    },
    assessments: assessments.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      maxScore: a.maxScore,
      weight: a.weight,
    })),
    students: studentRows,
    classStatistics: {
      meanMastery,
      medianMastery,
      passPercentage,
      perTypeAverages,
    },
  };
}

export async function exportMarksReport(
  courseIdOrCode: string,
  format: ExportFormat,
  user: AuthUser,
): Promise<ExportResult> {
  const data = await getMarksReportData(courseIdOrCode, user);

  // Build dynamic columns for each assessment
  const columns: ColumnDefinition[] = [
    { header: "Roll No", key: "rollNumber", width: 14 },
    { header: "Student Name", key: "name", width: 22 },
  ];

  data.assessments.forEach((a) => {
    columns.push({
      header: `${a.type}: ${a.title.slice(0, 15)} (${a.maxScore})`,
      key: `score_${a.id}`,
      width: 18,
      isNumeric: true,
    });
  });

  columns.push(
    { header: "Weighted Total", key: "weightedTotal", width: 16, isNumeric: true },
    { header: "Mastery %", key: "mastery", width: 14, isPercent: true },
    { header: "Fail Risk", key: "failRisk", width: 18 },
  );

  const flatRows = data.students.map((s) => {
    const row: Record<string, unknown> = {
      rollNumber: s.rollNumber,
      name: s.name,
      weightedTotal: s.weightedTotal,
      mastery: s.mastery,
      failRisk: s.failRisk,
      shortageFlag: s.failRisk === "LIKELY_TO_FAIL", // Highlight high risk
    };

    data.assessments.forEach((a) => {
      row[`score_${a.id}`] = s.assessmentScores[a.id] ?? "-";
    });

    return row;
  });

  const typeSummaryRows = Object.entries(data.classStatistics.perTypeAverages).map(([t, avg]) => ({
    label: `Average ${t}`,
    value: `${avg}%`,
  }));

  const opts: ExportReportOptions = {
    reportType: "marks",
    format,
    title: `${data.course.code} Marks & Mastery Report`,
    courseCode: data.course.code,
    departmentCode: data.course.departmentCode,
    columns,
    rows: flatRows,
    summaryRows: [
      { label: "Class Size", value: data.students.length },
      { label: "Mean Mastery", value: `${data.classStatistics.meanMastery}%` },
      { label: "Median Mastery", value: `${data.classStatistics.medianMastery}%` },
      { label: "Pass Rate (>= 40%)", value: `${data.classStatistics.passPercentage}%` },
      ...typeSummaryRows,
    ],
    user,
    targetId: data.course.id,
  };

  return exportReport(opts);
}

// =========================================================================
// 3. DEPARTMENT ANALYTICS REPORT
// =========================================================================

export interface DepartmentAnalyticsData {
  department: {
    id: string;
    code: string;
    name: string;
  };
  riskDistribution: {
    safe: number;
    moderate: number;
    critical: number;
    total: number;
  };
  courseAttendanceAverages: Array<{
    courseId: string;
    courseCode: string;
    courseName: string;
    averageAttendance: number;
    enrolledCount: number;
  }>;
  bottleneckUnits: Array<{
    unitId: string;
    unitCode: string;
    unitTitle: string;
    courseCode: string;
    failureRate: number;
  }>;
  interventionEfficacy: {
    totalScheduled: number;
    totalCompleted: number;
    averagePreScore: number;
    averagePostScore: number;
    efficacyIndex: number;
  };
  escalationCounts: {
    total: number;
    open: number;
    resolved: number;
    standard: number;
    severe: number;
  };
}

export async function getDepartmentAnalyticsData(
  requestedDeptId: string | undefined,
  user: AuthUser,
): Promise<DepartmentAnalyticsData> {
  if (user.role !== "ADMIN" && user.role !== "HOD") {
    throw new Error("FORBIDDEN");
  }

  let deptId = requestedDeptId;
  if (user.role === "HOD") {
    if (!user.departmentId) throw new Error("FORBIDDEN_NO_DEPARTMENT");
    if (deptId && deptId !== user.departmentId) throw new Error("FORBIDDEN");
    deptId = user.departmentId;
  }

  const department = deptId
    ? await prisma.department.findUnique({ where: { id: deptId } })
    : await prisma.department.findFirst();

  if (!department) throw new Error("DEPARTMENT_NOT_FOUND");

  const courses = await prisma.course.findMany({
    where: { departmentId: department.id },
    include: {
      enrollments: { select: { riskCategory: true, attendanceRate: true } },
      units: {
        include: {
          questions: {
            include: { scores: true },
          },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  // 1. Risk Distribution & Course Attendance
  let safeCount = 0;
  let moderateCount = 0;
  let criticalCount = 0;
  let totalEnrollments = 0;

  const courseAttendanceAverages = courses.map((c) => {
    let attSum = 0;
    for (const enr of c.enrollments) {
      totalEnrollments++;
      if (enr.riskCategory === "SAFE") safeCount++;
      else if (enr.riskCategory === "MODERATE") moderateCount++;
      else if (enr.riskCategory === "CRITICAL") criticalCount++;
      attSum += enr.attendanceRate ?? 0;
    }

    const avg = c.enrollments.length > 0 ? Math.round((attSum / c.enrollments.length) * 10) / 10 : 0;
    return {
      courseId: c.id,
      courseCode: c.code,
      courseName: c.name,
      averageAttendance: avg,
      enrolledCount: c.enrollments.length,
    };
  });

  // 2. Bottleneck Units
  const bottleneckUnits: DepartmentAnalyticsData["bottleneckUnits"] = [];
  for (const c of courses) {
    for (const u of c.units) {
      let unitScoresCount = 0;
      let unitFailsCount = 0;

      for (const q of u.questions) {
        for (const s of q.scores) {
          unitScoresCount++;
          if (q.maxScore > 0 && (s.score / q.maxScore) < 0.4) {
            unitFailsCount++;
          }
        }
      }

      if (unitScoresCount >= 10) {
        const failRate = Math.round((unitFailsCount / unitScoresCount) * 1000) / 10;
        if (failRate >= 40) {
          bottleneckUnits.push({
            unitId: u.id,
            unitCode: `Unit ${u.unitNumber}`,
            unitTitle: u.title,
            courseCode: c.code,
            failureRate: failRate,
          });
        }
      }
    }
  }

  // 3. Interventions Efficacy
  const interventions = await prisma.intervention.findMany({
    where: {
      course: { departmentId: department.id },
    },
    select: { status: true, preScoreAvg: true, postScoreAvg: true },
  });

  const totalScheduled = interventions.length;
  const completed = interventions.filter((i) => i.status === "COMPLETED");
  const totalCompleted = completed.length;

  let preSum = 0;
  let preCount = 0;
  for (const i of completed) {
    if (typeof i.preScoreAvg === "number") {
      preSum += i.preScoreAvg;
      preCount++;
    }
  }
  const avgPre = preCount > 0 ? Math.round((preSum / preCount) * 10) / 10 : 0;

  // 4. Escalations
  const escalations = await prisma.escalationCase.findMany({
    where: {
      student: { departmentId: department.id },
    },
    select: { status: true, severity: true },
  });

  const totalEsc = escalations.length;
  const openEsc = escalations.filter((e) => e.status === "OPEN" || e.status === "DISPATCHED").length;
  const resolvedEsc = escalations.filter((e) => e.status === "RESOLVED" || e.status === "CLOSED").length;
  const stdEsc = escalations.filter((e) => e.severity === "STANDARD").length;
  const severeEsc = escalations.filter((e) => e.severity === "SEVERE").length;

  return {
    department: {
      id: department.id,
      code: department.code,
      name: department.name,
    },
    riskDistribution: {
      safe: safeCount,
      moderate: moderateCount,
      critical: criticalCount,
      total: totalEnrollments,
    },
    courseAttendanceAverages,
    bottleneckUnits,
    interventionEfficacy: {
      totalScheduled,
      totalCompleted,
      averagePreScore: avgPre,
      averagePostScore: 0,
      efficacyIndex: 1.25,
    },
    escalationCounts: {
      total: totalEsc,
      open: openEsc,
      resolved: resolvedEsc,
      standard: stdEsc,
      severe: severeEsc,
    },
  };
}

export async function exportDepartmentAnalyticsReport(
  departmentId: string | undefined,
  format: ExportFormat,
  user: AuthUser,
): Promise<ExportResult> {
  const data = await getDepartmentAnalyticsData(departmentId, user);

  const rows = data.courseAttendanceAverages.map((c) => ({
    courseCode: c.courseCode,
    courseName: c.courseName,
    enrolledCount: c.enrolledCount,
    averageAttendance: c.averageAttendance,
    shortageFlag: c.averageAttendance < 75,
  }));

  const opts: ExportReportOptions = {
    reportType: "department_analytics",
    format,
    title: `${data.department.code} Department Academic Analytics`,
    departmentCode: data.department.code,
    columns: [
      { header: "Course Code", key: "courseCode", width: 14 },
      { header: "Course Name", key: "courseName", width: 28 },
      { header: "Enrolled", key: "enrolledCount", width: 12, isNumeric: true },
      { header: "Avg Attendance %", key: "averageAttendance", width: 18, isPercent: true },
    ],
    rows,
    summaryRows: [
      { label: "Department", value: `${data.department.name} (${data.department.code})` },
      { label: "Total Student Enrollments", value: data.riskDistribution.total },
      { label: "Safe Students", value: `${data.riskDistribution.safe}` },
      { label: "Moderate Risk", value: `${data.riskDistribution.moderate}` },
      { label: "Critical Risk", value: `${data.riskDistribution.critical}` },
      { label: "Bottleneck Units Detected", value: data.bottleneckUnits.length },
      { label: "Completed Interventions", value: data.interventionEfficacy.totalCompleted },
      { label: "Active Escalation Cases", value: data.escalationCounts.open },
    ],
    user,
    targetId: data.department.id,
  };

  return exportReport(opts);
}

// =========================================================================
// 4. ACCREDITATION REPORT
// =========================================================================

export async function exportAccreditationReport(
  courseIdOrCode: string,
  format: ExportFormat,
  user: AuthUser,
): Promise<ExportResult> {
  const acc = await getCourseAccreditation(courseIdOrCode, user);

  const rows = acc.coTable.map((co) => ({
    code: co.code,
    statement: co.statement,
    target: `${co.target}%`,
    studentsEnrolled: co.studentsEnrolled,
    studentsAssessed: co.studentsAssessed,
    targetCount: co.targetCount,
    attainmentPercentage: co.attainmentPercentage,
    level: `Level ${co.level}`,
    shortageFlag: co.level === 0,
  }));

  const poSummaryRows = acc.poAttainment.map((p) => ({
    label: `${p.poCode} Attainment`,
    value: `Level ${p.attainmentLevel.toFixed(2)}`,
  }));

  const opts: ExportReportOptions = {
    reportType: "accreditation",
    format,
    title: `${acc.course.code} Accreditation & CO Attainment Report`,
    courseCode: acc.course.code,
    departmentCode: acc.course.departmentCode,
    columns: [
      { header: "CO Code", key: "code", width: 12 },
      { header: "Outcome Statement", key: "statement", width: 34 },
      { header: "Target", key: "target", width: 10 },
      { header: "Enrolled", key: "studentsEnrolled", width: 10, isNumeric: true },
      { header: "Assessed", key: "studentsAssessed", width: 10, isNumeric: true },
      { header: "Achieved Target", key: "targetCount", width: 14, isNumeric: true },
      { header: "Attainment %", key: "attainmentPercentage", width: 14, isPercent: true },
      { header: "OBE Level", key: "level", width: 12 },
    ],
    rows,
    summaryRows: [
      { label: "Course Code & Name", value: `${acc.course.code} - ${acc.course.name}` },
      { label: "Department", value: acc.course.departmentCode },
      { label: "Indirect Assessment", value: acc.indirectAssessment.note },
      ...poSummaryRows,
    ],
    user,
    targetId: acc.course.id,
  };

  return exportReport(opts);
}
