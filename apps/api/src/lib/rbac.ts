import { FastifyRequest, FastifyReply } from "fastify";

export type Scope = "none" | "self" | "assigned" | "mentees" | "dept" | "all";

export type Permission =
  | "viewSelf"
  | "editMarks"
  | "viewCohort"
  | "editRoster"
  | "viewAudit"
  | "systemConfig";

export type Role = "STUDENT" | "FACULTY" | "MENTOR" | "HOD" | "ADMIN";

export const PERMISSION_MATRIX: Record<Role, Record<Permission, Scope>> = {
  STUDENT: {
    viewSelf: "self",
    editMarks: "none",
    viewCohort: "none",
    editRoster: "none",
    viewAudit: "none",
    systemConfig: "none",
  },
  FACULTY: {
    viewSelf: "self",
    editMarks: "assigned",
    viewCohort: "assigned",
    editRoster: "assigned",
    viewAudit: "none",
    systemConfig: "none",
  },
  MENTOR: {
    viewSelf: "self",
    editMarks: "none",
    viewCohort: "mentees",
    editRoster: "none",
    viewAudit: "none",
    systemConfig: "none",
  },
  HOD: {
    viewSelf: "self",
    editMarks: "dept",
    viewCohort: "dept",
    editRoster: "dept",
    viewAudit: "dept",
    systemConfig: "dept",
  },
  ADMIN: {
    viewSelf: "all",
    editMarks: "all",
    viewCohort: "all",
    editRoster: "all",
    viewAudit: "all",
    systemConfig: "all",
  },
} as const;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId?: string | null;
}

export function canAccessCourse(
  user: { id: string; role: Role; departmentId?: string | null },
  course: {
    id: string;
    departmentId: string;
    facultyId?: string | null;
    sessions?: { facultyId: string }[];
  },
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "HOD") return user.departmentId === course.departmentId;
  if (user.role === "FACULTY") {
    if (course.facultyId && course.facultyId === user.id) return true;
    if (course.sessions?.some((s) => s.facultyId === user.id)) return true;
    return false;
  }
  return false;
}

export function canViewStudent(
  user: { id: string; role: Role; departmentId?: string | null },
  student: {
    id: string;
    departmentId?: string | null;
    mentorId?: string | null;
    mentorAssignments?: { mentorId: string; active?: boolean }[];
    enrolledCourseFacultyIds?: string[];
  },
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "STUDENT") return user.id === student.id;
  if (user.role === "HOD") {
    return Boolean(
      user.departmentId && user.departmentId === student.departmentId,
    );
  }
  if (user.role === "MENTOR") {
    if (student.mentorId && student.mentorId === user.id) return true;
    if (
      student.mentorAssignments?.some(
        (m) => m.mentorId === user.id && m.active !== false,
      )
    ) {
      return true;
    }
    return false;
  }
  if (user.role === "FACULTY") {
    if (student.enrolledCourseFacultyIds?.includes(user.id)) return true;
    return false;
  }
  return false;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication token missing or invalid",
    });
  }
}

export function requireRole(...roles: Role[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    await authenticate(request, reply);
    if (reply.sent) return;

    const user = request.user as AuthUser | undefined;
    if (!user || !roles.includes(user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Insufficient permissions for this resource",
      });
    }
  };
}
