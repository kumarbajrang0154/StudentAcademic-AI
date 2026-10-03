import { prisma } from "@student-academic-ai/database";
import { AssessmentType } from "@prisma/client";

export interface CreateAssessmentInput {
  courseId: string;
  title: string;
  type?: AssessmentType;
  maxScore: number;
  weight: number;
  dueDate?: Date;
}

/**
 * Service layer for Assessments.
 * Enforces business rule: Total assessment weights for any course must not exceed 100%.
 */
export class AssessmentService {
  /**
   * Validates if adding or updating an assessment weight violates the course weight limit (<= 100).
   */
  static async validateCourseWeightLimit(
    courseId: string,
    additionalWeight: number,
    excludeAssessmentId?: string,
  ): Promise<void> {
    const existingAssessments = await prisma.assessment.findMany({
      where: {
        courseId,
        ...(excludeAssessmentId ? { id: { not: excludeAssessmentId } } : {}),
      },
      select: { weight: true },
    });

    const currentTotalWeight = existingAssessments.reduce(
      (sum, a) => sum + a.weight,
      0,
    );
    const projectedWeight = currentTotalWeight + additionalWeight;

    if (projectedWeight > 100) {
      throw new Error(
        `Total assessment weight for course ${courseId} cannot exceed 100%. Current: ${currentTotalWeight}%, requested additional: ${additionalWeight}%, projected: ${projectedWeight}%.`,
      );
    }
  }

  /**
   * Creates an assessment after verifying weight invariants.
   */
  static async createAssessment(input: CreateAssessmentInput) {
    if (input.weight <= 0 || input.weight > 100) {
      throw new Error("Assessment weight must be between 1 and 100.");
    }

    await this.validateCourseWeightLimit(input.courseId, input.weight);

    return prisma.assessment.create({
      data: {
        courseId: input.courseId,
        title: input.title,
        type: input.type ?? AssessmentType.ASSIGNMENT,
        maxScore: input.maxScore,
        weight: input.weight,
        dueDate: input.dueDate,
      },
    });
  }
}
