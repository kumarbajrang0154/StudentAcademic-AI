/**
 * Accreditation & Outcome-Based Education (OBE) Pure Calculation Functions
 * Conforms to NBA / NAAC Tier-I & Tier-II Engineering Accreditation criteria.
 */

export const CO_TARGET = 60; // 60% mark target per CO for student attainment
export const ATTAINMENT_LEVEL_3_THRESHOLD = 70; // >= 70% students meeting target -> Level 3
export const ATTAINMENT_LEVEL_2_THRESHOLD = 60; // >= 60% students meeting target -> Level 2
export const ATTAINMENT_LEVEL_1_THRESHOLD = 50; // >= 50% students meeting target -> Level 1

export interface QuestionScoreItem {
  score: number;
  maxScore: number;
}

export interface COAttainmentResult {
  studentsEnrolled: number;
  studentsAssessed: number;
  targetCount: number;
  attainmentPercentage: number;
  level: number; // 0, 1, 2, or 3
}

export interface CoPoWeightItem {
  coLevel: number;
  weight: number; // correlation level: 1, 2, or 3
}

/**
 * Calculates student percentage score for a specific Course Outcome (CO) across tagged assessment questions.
 * coScore(student, CO) = sum(score on questions tagged with that coId) / sum(max of those questions) * 100.
 * Returns null if the student has no scored questions for that CO (unassessed).
 */
export function coScore(questions: QuestionScoreItem[]): number | null {
  if (!questions || questions.length === 0) {
    return null;
  }

  let totalScore = 0;
  let totalMax = 0;

  for (const q of questions) {
    if (typeof q.score === "number" && typeof q.maxScore === "number" && q.maxScore > 0) {
      totalScore += q.score;
      totalMax += q.maxScore;
    }
  }

  if (totalMax === 0) {
    return null;
  }

  const rawPercent = (totalScore / totalMax) * 100;
  return Math.round(rawPercent * 100) / 100;
}

/**
 * Maps attainment percentage of students meeting CO_TARGET (60%) to attainment level:
 * - Level 3: >= 70% students attain target
 * - Level 2: >= 60% students attain target
 * - Level 1: >= 50% students attain target
 * - Level 0: < 50%
 */
export function coAttainmentLevel(percentage: number): number {
  if (percentage >= ATTAINMENT_LEVEL_3_THRESHOLD) return 3;
  if (percentage >= ATTAINMENT_LEVEL_2_THRESHOLD) return 2;
  if (percentage >= ATTAINMENT_LEVEL_1_THRESHOLD) return 1;
  return 0;
}

/**
 * Calculates Course Outcome attainment for a course cohort.
 * COAttainment(course, CO) = (count of students with coScore >= CO_TARGET 60) / (students assessed on that CO).
 * Students with null coScore are unassessed and excluded from the denominator.
 */
export function COAttainment(params: {
  coScores: (number | null)[];
  coTarget?: number;
}): COAttainmentResult {
  const target = params.coTarget ?? CO_TARGET;
  const enrolled = params.coScores.length;

  const assessed = params.coScores.filter(
    (s): s is number => s !== null && s !== undefined && !Number.isNaN(s),
  );

  const studentsAssessed = assessed.length;
  if (studentsAssessed === 0) {
    return {
      studentsEnrolled: enrolled,
      studentsAssessed: 0,
      targetCount: 0,
      attainmentPercentage: 0,
      level: 0,
    };
  }

  const targetCount = assessed.filter((score) => score >= target).length;
  const attainmentPercentage = Math.round((targetCount / studentsAssessed) * 10000) / 100;
  const level = coAttainmentLevel(attainmentPercentage);

  return {
    studentsEnrolled: enrolled,
    studentsAssessed,
    targetCount,
    attainmentPercentage,
    level,
  };
}

/**
 * Calculates Program Outcome (PO) attainment for a specific course based on mapped CO attainment levels and weights.
 * POAttainment(course, PO) = weighted average of CO attainment levels mapped via CoPoMapping weights.
 * sum(coLevel * weight) / sum(weight)
 */
export function poAttainment(mappings: CoPoWeightItem[]): number {
  if (!mappings || mappings.length === 0) {
    return 0;
  }

  let totalWeighted = 0;
  let totalWeight = 0;

  for (const m of mappings) {
    if (m.weight > 0) {
      totalWeighted += m.coLevel * m.weight;
      totalWeight += m.weight;
    }
  }

  if (totalWeight === 0) {
    return 0;
  }

  const raw = totalWeighted / totalWeight;
  return Math.round(raw * 100) / 100;
}

/**
 * Program-level PO attainment: average over courses offering/mapping that PO in the department.
 */
export function programPOAttainment(coursePoAttainments: number[]): number {
  if (!coursePoAttainments || coursePoAttainments.length === 0) {
    return 0;
  }

  const valid = coursePoAttainments.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (valid.length === 0) {
    return 0;
  }

  const sum = valid.reduce((acc, curr) => acc + curr, 0);
  const avg = sum / valid.length;
  return Math.round(avg * 100) / 100;
}
