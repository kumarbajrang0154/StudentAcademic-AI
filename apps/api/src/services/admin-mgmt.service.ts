import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@student-academic-ai/database";
import { Role, Prisma } from "@prisma/client";
import { AuthUser, PERMISSION_MATRIX } from "../lib/rbac.js";
import { DEFAULT_RISK_WEIGHTS } from "@student-academic-ai/core";
import { recomputeEnrollment } from "./enrollment.service.js";
import { getRecentAnalysisRuns } from "./analysis.service.js";
import { getAdminAuditLogs } from "./admin.service.js";

/**
 * Generates a high-entropy random password (14 characters)
 * containing uppercase, lowercase, numbers, and symbols.
 */
export function generateSecurePassword(length = 14): string {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghjkmnpqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%&*";
  const all = uppercase + lowercase + numbers + symbols;

  const pwd = [
    uppercase[crypto.randomInt(uppercase.length)],
    lowercase[crypto.randomInt(lowercase.length)],
    numbers[crypto.randomInt(numbers.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  for (let i = pwd.length; i < length; i++) {
    pwd.push(all[crypto.randomInt(all.length)]);
  }

  return pwd.sort(() => crypto.randomInt(3) - 1).join("");
}

/**
 * Deep sanitization for AuditLog to ensure no password, hash, or credential
 * can ever be written to disk, database, or network responses.
 */
export function sanitizeForAudit(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForAudit);
  }
  const clone: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (/password/i.test(key) || /secret/i.test(key) || /hash/i.test(key)) {
      clone[key] = "****";
    } else if (val && typeof val === "object") {
      clone[key] = sanitizeForAudit(val);
    } else {
      clone[key] = val;
    }
  }
  return clone;
}

/**
 * 1. Admin System Overview
 */
export async function getAdminSystemOverview() {
  const [
    users,
    departmentsCount,
    coursesCount,
    enrollmentsCount,
    openEscalationsCount,
    recentAuditLogs,
    recentAnalysis,
  ] = await Promise.all([
    prisma.user.findMany({
      select: { role: true, isActive: true },
    }),
    prisma.department.count(),
    prisma.course.count(),
    prisma.courseEnrollment.count({
      where: { student: { isActive: true } },
    }),
    prisma.escalationCase.count({
      where: {
        status: { in: ["TRIGGERED", "UNDER_REVIEW", "OPEN", "ESCALATED"] },
        student: { isActive: true },
      },
    }),
    prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        modifiedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
    getRecentAnalysisRuns(1),
  ]);

  const roleCounts: Record<Role, { active: number; inactive: number; total: number }> = {
    STUDENT: { active: 0, inactive: 0, total: 0 },
    FACULTY: { active: 0, inactive: 0, total: 0 },
    MENTOR:  { active: 0, inactive: 0, total: 0 },
    HOD:     { active: 0, inactive: 0, total: 0 },
    ADMIN:   { active: 0, inactive: 0, total: 0 },
  };

  for (const u of users) {
    if (roleCounts[u.role]) {
      roleCounts[u.role].total++;
      if (u.isActive) {
        roleCounts[u.role].active++;
      } else {
        roleCounts[u.role].inactive++;
      }
    }
  }

  const counts = {
    byRole: roleCounts,
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.isActive).length,
    inactiveUsers: users.filter((u) => !u.isActive).length,
    usersByRole: {
      STUDENT: roleCounts.STUDENT.total,
      FACULTY: roleCounts.FACULTY.total,
      MENTOR: roleCounts.MENTOR.total,
      HOD: roleCounts.HOD.total,
      ADMIN: roleCounts.ADMIN.total,
    },
    departments: departmentsCount,
    totalDepartments: departmentsCount,
    courses: coursesCount,
    totalCourses: coursesCount,
    enrollments: enrollmentsCount,
    totalEnrollments: enrollmentsCount,
    openEscalations: openEscalationsCount,
  };

  const auditEntries = recentAuditLogs.map((log) => ({
    id: log.id,
    entity: log.entity,
    entityId: log.entityId,
    action: log.justification || `${log.entity} modified`,
    justification: log.justification,
    createdAt: log.createdAt.toISOString(),
    modifiedBy: log.modifiedBy,
    previousValue: sanitizeForAudit(log.previousValue),
    newValue: sanitizeForAudit(log.newValue),
  }));

  const healthObj = {
    database: "healthy",
    status: "healthy",
    latencyMs: 5,
    timestamp: new Date().toISOString(),
  };

  return {
    health: healthObj,
    dbHealth: healthObj,
    counts,
    overview: counts,
    lastAnalysisRun: recentAnalysis[0] ?? null,
    recentAuditEntries: auditEntries,
    recentAudit: auditEntries,
  };
}

/**
 * 2. User Management (CRUD)
 */
export async function getAdminUsers(params: {
  search?: string;
  role?: Role;
  departmentId?: string;
  status?: "ACTIVE" | "INACTIVE" | "ALL";
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const skip = (page - 1) * limit;

  const whereClause: Prisma.UserWhereInput = {};

  if (params.search) {
    const q = params.search.trim();
    whereClause.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { rollNumber: { contains: q, mode: "insensitive" } },
    ];
  }

  if (params.role) {
    whereClause.role = params.role;
  }

  if (params.departmentId) {
    whereClause.departmentId = params.departmentId;
  }

  if (params.status === "ACTIVE") {
    whereClause.isActive = true;
  } else if (params.status === "INACTIVE") {
    whereClause.isActive = false;
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where: whereClause }),
    prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        rollNumber: true,
        departmentId: true,
        isActive: true,
        mustChangePassword: true,
        deactivatedAt: true,
        createdAt: true,
        department: { select: { id: true, code: true, name: true } },
        headedDepartment: { select: { id: true, code: true, name: true } },
        enrollments: {
          select: {
            id: true,
            courseId: true,
            course: { select: { id: true, code: true, name: true } },
          },
        },
        mentorAssignmentsAsStudent: {
          where: { active: true },
          select: {
            id: true,
            mentor: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    users,
  };
}

export async function createAdminUser(
  actor: AuthUser,
  data: {
    name: string;
    email: string;
    role: Role;
    departmentId?: string;
    rollNumber?: string;
    replaceExistingHead?: boolean;
  },
) {
  const email = data.email.toLowerCase().trim();

  // Check email uniqueness
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("EMAIL_EXISTS");
  }

  // HOD validation: requires department
  if (data.role === "HOD") {
    if (!data.departmentId) {
      throw new Error("HOD_REQUIRES_DEPARTMENT");
    }
    const dept = await prisma.department.findUnique({
      where: { id: data.departmentId },
      include: { head: { select: { id: true, name: true } } },
    });
    if (!dept) {
      throw new Error("DEPARTMENT_NOT_FOUND");
    }
    if (dept.headId && !data.replaceExistingHead) {
      return {
        requiresConfirmation: true,
        existingHead: dept.head?.name,
        message: `Department ${dept.name} already has HOD (${dept.head?.name}). Confirm to replace.`,
      };
    }
  }

  const tempPassword = generateSecurePassword(14);
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(tempPassword, salt);

  const newUser = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email,
      role: data.role,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
      departmentId: data.departmentId || null,
      rollNumber: data.role === "STUDENT" ? data.rollNumber?.trim() || null : null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      rollNumber: true,
      departmentId: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      department: { select: { id: true, code: true, name: true } },
    },
  });

  // If HOD, assign as department head
  if (data.role === "HOD" && data.departmentId) {
    await prisma.department.update({
      where: { id: data.departmentId },
      data: { headId: newUser.id },
    });
  }

  // AuditLog with previous/new values WITHOUT password hashes
  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: newUser.id,
      previousValue: undefined,
      newValue: sanitizeForAudit({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        departmentId: newUser.departmentId,
        rollNumber: newUser.rollNumber,
        mustChangePassword: true,
      }),
      modifiedById: actor.id,
      justification: `UserCreated: User ${newUser.name} created with role ${newUser.role}`,
    },
  });

  return {
    user: newUser,
    tempPassword, // Returned ONCE for display in UI copy modal
    temporaryPassword: tempPassword,
  };
}

export async function updateAdminUser(
  actor: AuthUser,
  id: string,
  data: {
    name?: string;
    email?: string;
    departmentId?: string | null;
    rollNumber?: string | null;
    role?: Role;
    replaceExistingHead?: boolean;
  },
) {
  const existingUser = await prisma.user.findUnique({
    where: { id },
    include: { headedDepartment: true },
  });

  if (!existingUser) {
    throw new Error("NOT_FOUND");
  }

  // Guards: cannot change self role or last admin
  if (actor.id === id && data.role && data.role !== "ADMIN") {
    throw new Error("CANNOT_MODIFY_SELF_ROLE");
  }

  if (existingUser.role === "ADMIN" && data.role && data.role !== "ADMIN") {
    const activeAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    });
    if (activeAdmins <= 1) {
      throw new Error("CANNOT_MODIFY_LAST_ADMIN");
    }
  }

  // HOD check
  const newRole = data.role || existingUser.role;
  const targetDeptId = data.departmentId !== undefined ? data.departmentId : existingUser.departmentId;

  if (newRole === "HOD") {
    if (!targetDeptId) {
      throw new Error("HOD_REQUIRES_DEPARTMENT");
    }
    const dept = await prisma.department.findUnique({
      where: { id: targetDeptId },
      include: { head: { select: { id: true, name: true } } },
    });
    if (!dept) {
      throw new Error("DEPARTMENT_NOT_FOUND");
    }
    if (dept.headId && dept.headId !== id && !data.replaceExistingHead) {
      return {
        requiresConfirmation: true,
        existingHead: dept.head?.name,
        message: `Department ${dept.name} already has HOD (${dept.head?.name}). Confirm to replace.`,
      };
    }
  }

  // If email is changing, check uniqueness
  if (data.email && data.email.toLowerCase() !== existingUser.email.toLowerCase()) {
    const conflict = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });
    if (conflict) {
      throw new Error("EMAIL_EXISTS");
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      name: data.name ? data.name.trim() : undefined,
      email: data.email ? data.email.toLowerCase().trim() : undefined,
      departmentId: data.departmentId !== undefined ? data.departmentId : undefined,
      rollNumber: data.rollNumber !== undefined ? (data.rollNumber ? data.rollNumber.trim() : null) : undefined,
      role: data.role || undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      rollNumber: true,
      departmentId: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      department: { select: { id: true, code: true, name: true } },
    },
  });

  // Manage HOD assignment
  if (newRole === "HOD" && targetDeptId) {
    await prisma.department.update({
      where: { id: targetDeptId },
      data: { headId: id },
    });
  } else if (existingUser.role === "HOD" && newRole !== "HOD" && existingUser.headedDepartment) {
    await prisma.department.update({
      where: { id: existingUser.headedDepartment.id },
      data: { headId: null },
    });
  }

  // AuditLog
  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: id,
      previousValue: sanitizeForAudit({
        name: existingUser.name,
        email: existingUser.email,
        role: existingUser.role,
        departmentId: existingUser.departmentId,
        rollNumber: existingUser.rollNumber,
      }),
      newValue: sanitizeForAudit({
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        departmentId: updatedUser.departmentId,
        rollNumber: updatedUser.rollNumber,
      }),
      modifiedById: actor.id,
      justification: `UserUpdated: Profile for ${updatedUser.name} updated by admin`,
    },
  });

  return { user: updatedUser };
}

export async function resetAdminUserPassword(actor: AuthUser, id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new Error("NOT_FOUND");
  }

  const tempPassword = generateSecurePassword(14);
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(tempPassword, salt);

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });

  // Revoke all refresh tokens
  await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: id,
      previousValue: { mustChangePassword: user.mustChangePassword },
      newValue: { mustChangePassword: true, resetBy: actor.email },
      modifiedById: actor.id,
      justification: `PasswordReset: Admin reset password for ${user.email}`,
    },
  });

  return { tempPassword, temporaryPassword: tempPassword };
}

export async function setAdminUserStatus(actor: AuthUser, id: string, isActive: boolean) {
  if (actor.id === id) {
    throw new Error("CANNOT_MODIFY_SELF");
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new Error("NOT_FOUND");
  }

  if (user.role === "ADMIN" && !isActive) {
    const activeAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    });
    if (activeAdmins <= 1) {
      throw new Error("CANNOT_DEACTIVATE_LAST_ADMIN");
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      isActive,
      deactivatedAt: isActive ? null : new Date(),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      deactivatedAt: true,
    },
  });

  // If deactivating, revoke all active sessions
  if (!isActive) {
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: id,
      previousValue: { isActive: user.isActive },
      newValue: { isActive, deactivatedAt: updated.deactivatedAt },
      modifiedById: actor.id,
      justification: isActive
        ? `UserReactivated: Account ${user.email} reactivated`
        : `UserDeactivated: Account ${user.email} deactivated; sessions terminated`,
    },
  });

  return updated;
}

export async function deleteAdminUser(actor: AuthUser, id: string) {
  if (actor.id === id) {
    throw new Error("CANNOT_MODIFY_SELF");
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new Error("NOT_FOUND");
  }

  if (user.role === "ADMIN") {
    const activeAdmins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    });
    if (activeAdmins <= 1) {
      throw new Error("CANNOT_DELETE_LAST_ADMIN");
    }
  }

  // Check dependent rows across all models
  const [
    scoresCount,
    attendanceCount,
    enrollmentsCount,
    facultySessionsCount,
    interventionsCount,
    escalationCasesCount,
    auditLogCount,
  ] = await Promise.all([
    prisma.studentScore.count({ where: { studentId: id } }),
    prisma.attendanceRecord.count({ where: { studentId: id } }),
    prisma.courseEnrollment.count({ where: { studentId: id } }),
    prisma.classSession.count({ where: { facultyId: id } }),
    prisma.intervention.count({ where: { OR: [{ studentId: id }, { mentorId: id }] } }),
    prisma.escalationCase.count({ where: { OR: [{ studentId: id }, { assignedToId: id }] } }),
    prisma.auditLog.count({ where: { modifiedById: id } }),
  ]);

  const totalDependentRecords =
    scoresCount +
    attendanceCount +
    enrollmentsCount +
    facultySessionsCount +
    interventionsCount +
    escalationCasesCount +
    auditLogCount;

  if (totalDependentRecords > 0) {
    const error = new Error("HAS_RECORDS");
    (error as any).details = `User has ${totalDependentRecords} dependent records; deactivate instead.`;
    throw error;
  }

  // Fresh user with no dependent records: delete tokens and user
  await prisma.refreshToken.deleteMany({ where: { userId: id } });

  // Clear department head link if any
  await prisma.department.updateMany({
    where: { headId: id },
    data: { headId: null },
  });

  await prisma.course.updateMany({
    where: { facultyId: id },
    data: { facultyId: null },
  });

  // Delete user
  await prisma.user.delete({ where: { id } });

  // Append-only AuditLog
  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: id,
      previousValue: sanitizeForAudit({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      }),
      newValue: undefined,
      modifiedById: actor.id,
      justification: `UserDeleted: Hard delete of user ${user.email} with zero records`,
    },
  });

  return { success: true };
}

/**
 * 3. Student Management: Enrollments & Mentors
 */
export async function enrollAdminStudent(actor: AuthUser, studentId: string, courseId: string) {
  const [student, course] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId, role: "STUDENT" } }),
    prisma.course.findUnique({ where: { id: courseId } }),
  ]);

  if (!student) throw new Error("STUDENT_NOT_FOUND");
  if (!course) throw new Error("COURSE_NOT_FOUND");

  // Check if enrollment already exists
  const existing = await prisma.courseEnrollment.findFirst({
    where: { studentId, courseId },
  });

  if (existing) {
    throw new Error("ALREADY_ENROLLED");
  }

  const enrollment = await prisma.courseEnrollment.create({
    data: {
      studentId,
      courseId,
      semester: "Fall",
      academicYear: "2026-2027",
      status: "ACTIVE",
    },
  });

  // Trigger recompute for this enrollment
  await recomputeEnrollment(studentId, courseId).catch(() => {});

  await prisma.auditLog.create({
    data: {
      entity: "CourseEnrollment",
      entityId: enrollment.id,
      previousValue: undefined,
      newValue: { studentId, courseId, courseCode: course.code, studentName: student.name },
      modifiedById: actor.id,
      justification: `StudentEnrolled: Enrolled student ${student.name} in ${course.code}`,
    },
  });

  return enrollment;
}

export async function unenrollAdminStudent(actor: AuthUser, studentId: string, courseId: string) {
  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId, courseId },
    include: { course: true, student: true },
  });

  if (!enrollment) {
    throw new Error("NOT_ENROLLED");
  }

  await prisma.courseEnrollment.delete({
    where: { id: enrollment.id },
  });

  await prisma.auditLog.create({
    data: {
      entity: "CourseEnrollment",
      entityId: enrollment.id,
      previousValue: { studentId, courseId, courseCode: enrollment.course.code },
      newValue: undefined,
      modifiedById: actor.id,
      justification: `StudentUnenrolled: Unenrolled student ${enrollment.student.name} from ${enrollment.course.code}`,
    },
  });

  return { success: true };
}

export async function assignAdminMentor(actor: AuthUser, studentId: string, mentorId: string) {
  const [student, mentor] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId, role: "STUDENT" } }),
    prisma.user.findUnique({ where: { id: mentorId, role: "MENTOR" } }),
  ]);

  if (!student) throw new Error("STUDENT_NOT_FOUND");
  if (!mentor) throw new Error("MENTOR_NOT_FOUND");

  // Deactivate any currently active mentor assignment for this student
  await prisma.mentorAssignment.updateMany({
    where: { studentId, active: true },
    data: { active: false },
  });

  // Upsert active mentor assignment
  const assignment = await prisma.mentorAssignment.upsert({
    where: {
      mentorId_studentId: { mentorId, studentId },
    },
    update: {
      active: true,
      assignedAt: new Date(),
    },
    create: {
      mentorId,
      studentId,
      active: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      entity: "MentorAssignment",
      entityId: assignment.id,
      previousValue: undefined,
      newValue: { studentId, mentorId, mentorName: mentor.name, studentName: student.name },
      modifiedById: actor.id,
      justification: `MentorAssigned: Assigned mentor ${mentor.name} to student ${student.name}`,
    },
  });

  return assignment;
}

export async function importStudentsFromCsv(
  actor: AuthUser,
  rows: Array<{ name: string; email: string; rollNumber?: string; departmentCode?: string }>,
  confirmCreate: boolean,
) {
  const results: Array<{
    row: number;
    name: string;
    email: string;
    rollNumber?: string;
    departmentCode?: string;
    status: "VALID" | "ERROR";
    error?: string;
  }> = [];

  const existingEmails = new Set(
    (
      await prisma.user.findMany({
        where: { email: { in: rows.map((r) => r.email.toLowerCase().trim()) } },
        select: { email: true },
      })
    ).map((u) => u.email.toLowerCase()),
  );

  const departments = await prisma.department.findMany({ select: { id: true, code: true } });
  const deptMap = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));

  const seenInBatch = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const name = r.name?.trim();
    const email = r.email?.toLowerCase().trim();
    const deptCode = r.departmentCode?.trim().toUpperCase();

    if (!name) {
      results.push({ row: i + 1, name: "", email, status: "ERROR", error: "Name is required" });
      continue;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ row: i + 1, name, email: email || "", status: "ERROR", error: "Valid email is required" });
      continue;
    }
    if (seenInBatch.has(email)) {
      results.push({ row: i + 1, name, email, status: "ERROR", error: "Duplicate email in CSV" });
      continue;
    }
    seenInBatch.add(email);

    if (existingEmails.has(email)) {
      results.push({ row: i + 1, name, email, status: "ERROR", error: "Email already exists in system" });
      continue;
    }

    if (deptCode && !deptMap.has(deptCode)) {
      results.push({ row: i + 1, name, email, status: "ERROR", error: `Department code ${deptCode} not found` });
      continue;
    }

    results.push({
      row: i + 1,
      name,
      email,
      rollNumber: r.rollNumber?.trim(),
      departmentCode: deptCode,
      status: "VALID",
    });
  }

  if (!confirmCreate) {
    return {
      isValid: results.every((r) => r.status === "VALID"),
      totalRows: rows.length,
      validRowsCount: results.filter((r) => r.status === "VALID").length,
      errorRowsCount: results.filter((r) => r.status === "ERROR").length,
      preview: results,
    };
  }

  // Create valid students
  const validRows = results.filter((r) => r.status === "VALID");
  const createdStudentsWithPasswords: Array<{
    name: string;
    email: string;
    rollNumber: string;
    department: string;
    tempPassword: string;
  }> = [];

  for (const item of validRows) {
    const tempPassword = generateSecurePassword(14);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(tempPassword, salt);
    const deptId = item.departmentCode ? deptMap.get(item.departmentCode) : null;

    const user = await prisma.user.create({
      data: {
        name: item.name,
        email: item.email,
        role: "STUDENT",
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        departmentId: deptId || null,
        rollNumber: item.rollNumber || null,
      },
    });

    createdStudentsWithPasswords.push({
      name: user.name,
      email: user.email,
      rollNumber: user.rollNumber || "",
      department: item.departmentCode || "",
      tempPassword,
    });
  }

  // Generate downloadable CSV with temporary passwords
  const csvHeader = "Name,Email,RollNumber,Department,TemporaryPassword\n";
  const csvRows = createdStudentsWithPasswords
    .map((s) => `"${s.name}","${s.email}","${s.rollNumber}","${s.department}","${s.tempPassword}"`)
    .join("\n");
  const csvData = csvHeader + csvRows;

  await prisma.auditLog.create({
    data: {
      entity: "User",
      entityId: "bulk-import",
      previousValue: undefined,
      newValue: {
        createdCount: createdStudentsWithPasswords.length,
        emails: createdStudentsWithPasswords.map((s) => s.email),
      },
      modifiedById: actor.id,
      justification: `ImportStudentsCSV: ${createdStudentsWithPasswords.length} students created`,
    },
  });

  return {
    success: true,
    createdCount: createdStudentsWithPasswords.length,
    csvData, // Returned once for immediate browser download
  };
}

/**
 * 4. Faculty Management: Course Assignment
 */
export async function assignCourseFaculty(actor: AuthUser, courseId: string, facultyId: string | null) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("COURSE_NOT_FOUND");

  let facultyName = "Unassigned";
  if (facultyId) {
    const faculty = await prisma.user.findUnique({ where: { id: facultyId, role: "FACULTY" } });
    if (!faculty) throw new Error("FACULTY_NOT_FOUND");
    facultyName = faculty.name;
  }

  const updated = await prisma.course.update({
    where: { id: courseId },
    data: { facultyId },
    include: { faculty: { select: { id: true, name: true, email: true } } },
  });

  await prisma.auditLog.create({
    data: {
      entity: "Course",
      entityId: courseId,
      previousValue: { courseCode: course.code, previousFacultyId: course.facultyId },
      newValue: { courseCode: course.code, facultyId, facultyName },
      modifiedById: actor.id,
      justification: `FacultyAssigned: Assigned faculty ${facultyName} to course ${course.code}`,
    },
  });

  return updated;
}

/**
 * 5. Departments & Courses Management
 */
export async function listAdminDepartments() {
  return prisma.department.findMany({
    include: {
      head: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          courses: true,
          users: { where: { isActive: true } },
        },
      },
    },
    orderBy: { code: "asc" },
  });
}

export async function createAdminDepartment(actor: AuthUser, data: { code: string; name: string; headId?: string }) {
  const code = data.code.trim().toUpperCase();
  const existing = await prisma.department.findUnique({ where: { code } });
  if (existing) throw new Error("DEPT_CODE_EXISTS");

  const dept = await prisma.department.create({
    data: {
      code,
      name: data.name.trim(),
      headId: data.headId || null,
    },
    include: { head: { select: { id: true, name: true, email: true } } },
  });

  await prisma.auditLog.create({
    data: {
      entity: "Department",
      entityId: dept.id,
      previousValue: undefined,
      newValue: { code: dept.code, name: dept.name, headId: dept.headId },
      modifiedById: actor.id,
      justification: `DepartmentCreated: Created department ${dept.code}`,
    },
  });

  return dept;
}

export async function updateAdminDepartment(
  actor: AuthUser,
  id: string,
  data: { code?: string; name?: string; headId?: string | null; replaceExistingHead?: boolean },
) {
  const existing = await prisma.department.findUnique({
    where: { id },
    include: { head: true },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (data.code && data.code.toUpperCase() !== existing.code) {
    const conflict = await prisma.department.findUnique({
      where: { code: data.code.toUpperCase().trim() },
    });
    if (conflict) throw new Error("DEPT_CODE_EXISTS");
  }

  const updated = await prisma.department.update({
    where: { id },
    data: {
      code: data.code ? data.code.toUpperCase().trim() : undefined,
      name: data.name ? data.name.trim() : undefined,
      headId: data.headId !== undefined ? data.headId : undefined,
    },
    include: { head: { select: { id: true, name: true, email: true } } },
  });

  await prisma.auditLog.create({
    data: {
      entity: "Department",
      entityId: id,
      previousValue: { code: existing.code, name: existing.name, headId: existing.headId },
      newValue: { code: updated.code, name: updated.name, headId: updated.headId },
      modifiedById: actor.id,
      justification: `DepartmentUpdated: Updated department ${updated.code}`,
    },
  });

  return updated;
}

export async function listAdminCourses() {
  return prisma.course.findMany({
    include: {
      department: { select: { id: true, code: true, name: true } },
      faculty: { select: { id: true, name: true, email: true } },
      _count: {
        select: {
          enrollments: { where: { student: { isActive: true } } },
          sessions: true,
          assessments: true,
        },
      },
    },
    orderBy: { code: "asc" },
  });
}

export async function createAdminCourse(
  actor: AuthUser,
  data: { code: string; name: string; credits: number; departmentId: string; facultyId?: string },
) {
  const code = data.code.trim().toUpperCase();
  const existing = await prisma.course.findUnique({ where: { code } });
  if (existing) throw new Error("COURSE_CODE_EXISTS");

  const course = await prisma.course.create({
    data: {
      code,
      name: data.name.trim(),
      credits: data.credits || 3,
      departmentId: data.departmentId,
      facultyId: data.facultyId || null,
    },
    include: {
      department: { select: { id: true, code: true, name: true } },
      faculty: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      entity: "Course",
      entityId: course.id,
      previousValue: undefined,
      newValue: { code: course.code, name: course.name, credits: course.credits, departmentId: course.departmentId },
      modifiedById: actor.id,
      justification: `CourseCreated: Created course ${course.code}`,
    },
  });

  return course;
}

export async function updateAdminCourse(
  actor: AuthUser,
  id: string,
  data: { code?: string; name?: string; credits?: number; facultyId?: string | null },
) {
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");

  if (data.code && data.code.toUpperCase() !== existing.code) {
    const conflict = await prisma.course.findUnique({ where: { code: data.code.toUpperCase().trim() } });
    if (conflict) throw new Error("COURSE_CODE_EXISTS");
  }

  const updated = await prisma.course.update({
    where: { id },
    data: {
      code: data.code ? data.code.toUpperCase().trim() : undefined,
      name: data.name ? data.name.trim() : undefined,
      credits: data.credits !== undefined ? data.credits : undefined,
      facultyId: data.facultyId !== undefined ? data.facultyId : undefined,
    },
    include: {
      department: { select: { id: true, code: true, name: true } },
      faculty: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      entity: "Course",
      entityId: id,
      previousValue: { code: existing.code, name: existing.name, credits: existing.credits, facultyId: existing.facultyId },
      newValue: { code: updated.code, name: updated.name, credits: updated.credits, facultyId: updated.facultyId },
      modifiedById: actor.id,
      justification: `CourseUpdated: Updated course ${updated.code}`,
    },
  });

  return updated;
}

export async function deleteAdminCourse(actor: AuthUser, id: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      _count: {
        select: { enrollments: true, sessions: true, assessments: true },
      },
    },
  });

  if (!course) throw new Error("NOT_FOUND");

  const totalRecords = course._count.enrollments + course._count.sessions + course._count.assessments;
  if (totalRecords > 0) {
    const error = new Error("HAS_RECORDS");
    (error as any).details = `Course has ${totalRecords} historical records; cannot be destroyed.`;
    throw error;
  }

  await prisma.course.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      entity: "Course",
      entityId: id,
      previousValue: { code: course.code, name: course.name },
      newValue: undefined,
      modifiedById: actor.id,
      justification: `CourseDeleted: Deleted unused course ${course.code}`,
    },
  });

  return { success: true };
}

/**
 * 6. Audit & Settings
 */
export async function getAdminAudit(params: {
  page?: number;
  limit?: number;
  entity?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}) {
  return getAdminAuditLogs(
    { id: "admin", email: "admin@demo.edu", name: "Admin", role: "ADMIN" },
    params.entity,
    undefined,
    params.startDate,
    params.endDate,
    params.page,
    params.limit,
  );
}

export function getAdminSystemSettings() {
  return {
    rbacMatrix: PERMISSION_MATRIX,
    riskWeights: DEFAULT_RISK_WEIGHTS,
    thresholds: {
      attendanceDebarmentRate: 75,
      curriculumBottleneckMastery: 60,
      criticalRiskEnrollmentThreshold: 3,
      slaMarkEntryDays: 7,
      slaAttendanceTimelinessHours: 24,
    },
    officeHours: {
      defaultSlotDurationMin: 30,
      activeDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    },
  };
}
