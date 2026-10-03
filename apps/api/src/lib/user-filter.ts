import { Prisma } from "@student-academic-ai/database";

/**
 * Shared active user filter helper.
 * Inactive users must be excluded from every roster, list, KPI and report query.
 */
export const activeUserWhere: Prisma.UserWhereInput = {
  isActive: true,
};

export const activeStudentEnrollmentWhere: Prisma.CourseEnrollmentWhereInput = {
  student: {
    isActive: true,
  },
};
