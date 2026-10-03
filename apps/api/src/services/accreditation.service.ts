import { prisma } from "@student-academic-ai/database";
import {
  coScore,
  COAttainment,
  poAttainment,
  programPOAttainment,
  QuestionScoreItem,
  CoPoWeightItem,
} from "@student-academic-ai/core";
import { AuthUser } from "../lib/rbac.js";

export interface CourseAccreditationData {
  course: {
    id: string;
    code: string;
    name: string;
    departmentId: string;
    departmentCode: string;
  };
  coTable: Array<{
    id: string;
    code: string;
    statement: string;
    target: number;
    studentsEnrolled: number;
    studentsAssessed: number;
    targetCount: number;
    attainmentPercentage: number;
    level: number;
  }>;
  coPoMatrix: {
    pos: Array<{ id: string; code: string; statement: string }>;
    rows: Array<{
      coId: string;
      coCode: string;
      mappings: Record<string, number>;
    }>;
  };
  poAttainment: Array<{
    poId: string;
    poCode: string;
    statement: string;
    attainmentLevel: number;
  }>;
  indirectAssessment: {
    status: string;
    note: string;
  };
}

export interface ProgramAccreditationData {
  department: {
    id: string;
    code: string;
    name: string;
  };
  courses: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  pos: Array<{
    id: string;
    code: string;
    statement: string;
  }>;
  programMatrix: Array<{
    poId: string;
    poCode: string;
    statement: string;
    courseAttainments: Record<string, number>;
    programAttainment: number;
  }>;
}

/**
 * Computes Course-level Course Outcome and Program Outcome attainment.
 * Accessible by ADMIN (all courses) and HOD (courses within their department).
 * FACULTY, MENTOR, and STUDENT are forbidden (403).
 */
export async function getCourseAccreditation(
  courseIdOrCode: string,
  user: AuthUser,
): Promise<CourseAccreditationData> {
  if (user.role !== "ADMIN" && user.role !== "HOD") {
    throw new Error("FORBIDDEN");
  }

  const course = await prisma.course.findFirst({
    where: {
      OR: [{ id: courseIdOrCode }, { code: courseIdOrCode }],
    },
    include: {
      department: true,
      outcomes: {
        include: {
          questions: {
            select: {
              id: true,
              maxScore: true,
              scores: {
                select: {
                  studentId: true,
                  score: true,
                },
              },
            },
          },
          coPoMappings: {
            include: {
              po: true,
            },
          },
        },
        orderBy: { code: "asc" },
      },
      enrollments: {
        select: { studentId: true },
      },
    },
  });

  if (!course) {
    throw new Error("COURSE_NOT_FOUND");
  }

  if (user.role === "HOD" && course.departmentId !== user.departmentId) {
    throw new Error("FORBIDDEN");
  }

  const enrolledStudentIds = course.enrollments.map((e) => e.studentId);
  const enrolledCount = enrolledStudentIds.length;

  // 1. Calculate CO Attainment for each CO
  const coResults: CourseAccreditationData["coTable"] = [];
  const coLevelMap = new Map<string, number>();

  for (const co of course.outcomes) {
    const studentCoScores: (number | null)[] = [];

    for (const sId of enrolledStudentIds) {
      const qScores: QuestionScoreItem[] = [];
      for (const q of co.questions) {
        const found = q.scores.find((s) => s.studentId === sId);
        if (found && typeof found.score === "number") {
          qScores.push({ score: found.score, maxScore: q.maxScore });
        }
      }
      studentCoScores.push(coScore(qScores));
    }

    const attainment = COAttainment({
      coScores: studentCoScores,
      coTarget: 60,
    });

    coLevelMap.set(co.id, attainment.level);

    coResults.push({
      id: co.id,
      code: co.code,
      statement: co.description,
      target: 60,
      studentsEnrolled: enrolledCount,
      studentsAssessed: attainment.studentsAssessed,
      targetCount: attainment.targetCount,
      attainmentPercentage: attainment.attainmentPercentage,
      level: attainment.level,
    });
  }

  // 2. Fetch Department POs
  const pos = await prisma.programOutcome.findMany({
    where: { departmentId: course.departmentId },
    orderBy: { code: "asc" },
  });

  // 3. Build CO-PO Matrix
  const matrixRows = course.outcomes.map((co) => {
    const mappingRecord: Record<string, number> = {};
    for (const po of pos) {
      const map = co.coPoMappings.find((m) => m.poId === po.id);
      mappingRecord[po.code] = map ? map.correlationLevel : 0;
    }
    return {
      coId: co.id,
      coCode: co.code,
      mappings: mappingRecord,
    };
  });

  // 4. Calculate PO Attainments
  const poResults = pos.map((po) => {
    const mappingsForPo: CoPoWeightItem[] = [];
    for (const co of course.outcomes) {
      const map = co.coPoMappings.find((m) => m.poId === po.id);
      if (map && map.correlationLevel > 0) {
        const coLevel = coLevelMap.get(co.id) ?? 0;
        mappingsForPo.push({
          coLevel,
          weight: map.correlationLevel,
        });
      }
    }

    const attainmentLevel = poAttainment(mappingsForPo);
    return {
      poId: po.id,
      poCode: po.code,
      statement: po.description,
      attainmentLevel,
    };
  });

  return {
    course: {
      id: course.id,
      code: course.code,
      name: course.name,
      departmentId: course.departmentId,
      departmentCode: course.department.code,
    },
    coTable: coResults,
    coPoMatrix: {
      pos: pos.map((p) => ({ id: p.id, code: p.code, statement: p.description })),
      rows: matrixRows,
    },
    poAttainment: poResults,
    indirectAssessment: {
      status: "not collected",
      note: "Indirect student exit survey / feedback not collected",
    },
  };
}

/**
 * Computes Program-level PO attainment across all courses in a department.
 * Accessible by ADMIN and HOD (scoped to their department).
 */
export async function getProgramAccreditation(
  requestedDeptId: string | undefined,
  user: AuthUser,
): Promise<ProgramAccreditationData> {
  if (user.role !== "ADMIN" && user.role !== "HOD") {
    throw new Error("FORBIDDEN");
  }

  let departmentId = requestedDeptId;
  if (user.role === "HOD") {
    if (!user.departmentId) {
      throw new Error("FORBIDDEN_NO_DEPARTMENT");
    }
    if (departmentId && departmentId !== user.departmentId) {
      throw new Error("FORBIDDEN");
    }
    departmentId = user.departmentId;
  }

  const department = departmentId
    ? await prisma.department.findUnique({ where: { id: departmentId } })
    : await prisma.department.findFirst();

  if (!department) {
    throw new Error("DEPARTMENT_NOT_FOUND");
  }

  const [courses, pos] = await Promise.all([
    prisma.course.findMany({
      where: { departmentId: department.id },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.programOutcome.findMany({
      where: { departmentId: department.id },
      orderBy: { code: "asc" },
    }),
  ]);

  // Compute PO attainment for each course
  const coursePoAttainmentMap = new Map<string, Record<string, number>>();

  for (const c of courses) {
    try {
      const courseAcc = await getCourseAccreditation(c.id, user);
      const poMap: Record<string, number> = {};
      for (const p of courseAcc.poAttainment) {
        poMap[p.poCode] = p.attainmentLevel;
      }
      coursePoAttainmentMap.set(c.code, poMap);
    } catch {
      coursePoAttainmentMap.set(c.code, {});
    }
  }

  // Build program matrix
  const programMatrix = pos.map((po) => {
    const courseAttainments: Record<string, number> = {};
    const valuesList: number[] = [];

    for (const c of courses) {
      const val = coursePoAttainmentMap.get(c.code)?.[po.code] ?? 0;
      courseAttainments[c.code] = val;
      if (val > 0) {
        valuesList.push(val);
      }
    }

    const programAttainmentVal = programPOAttainment(valuesList);

    return {
      poId: po.id,
      poCode: po.code,
      statement: po.description,
      courseAttainments,
      programAttainment: programAttainmentVal,
    };
  });

  return {
    department: {
      id: department.id,
      code: department.code,
      name: department.name,
    },
    courses: courses.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    pos: pos.map((p) => ({ id: p.id, code: p.code, statement: p.description })),
    programMatrix,
  };
}
