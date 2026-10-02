export type RiskCategory = "SAFE" | "MODERATE" | "CRITICAL";

export interface RiskInputs {
  attendance: number;
  mastery: number;
  velocity: number;
  submission: number;
}

export interface RiskWeights {
  attendance: number;
  mastery: number;
  velocity: number;
  submission: number;
}

export interface RiskResult {
  score: number;
  category: RiskCategory;
  breakdown: {
    attendanceContribution: number;
    masteryContribution: number;
    velocityContribution: number;
    submissionContribution: number;
  };
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  attendance: 0.35,
  mastery: 0.35,
  velocity: 0.15,
  submission: 0.15,
};

/**
 * Calculates academic risk score from normalized risk inputs (0-100 where 100 is highest risk).
 * Default weights: attendance 0.35, mastery 0.35, velocity 0.15, submission 0.15.
 *
 * Categorization:
 * - SAFE: score < 30
 * - MODERATE: 30 <= score < 65 (30 - 64.99)
 * - CRITICAL: score >= 65
 *
 * @param inputs Normalized risk inputs (0-100 each)
 * @param weights Optional custom weights (defaults applied if not specified)
 * @returns RiskResult containing clamped score, category, and component breakdown
 */
export function riskScore(
  inputs: RiskInputs,
  weights: Partial<RiskWeights> = {},
): RiskResult {
  const mergedWeights: RiskWeights = {
    attendance: weights.attendance ?? DEFAULT_RISK_WEIGHTS.attendance,
    mastery: weights.mastery ?? DEFAULT_RISK_WEIGHTS.mastery,
    velocity: weights.velocity ?? DEFAULT_RISK_WEIGHTS.velocity,
    submission: weights.submission ?? DEFAULT_RISK_WEIGHTS.submission,
  };

  // Clamp inputs to [0, 100]
  const att = Math.min(100, Math.max(0, inputs.attendance));
  const mas = Math.min(100, Math.max(0, inputs.mastery));
  const vel = Math.min(100, Math.max(0, inputs.velocity));
  const sub = Math.min(100, Math.max(0, inputs.submission));

  const attendanceContribution = att * mergedWeights.attendance;
  const masteryContribution = mas * mergedWeights.mastery;
  const velocityContribution = vel * mergedWeights.velocity;
  const submissionContribution = sub * mergedWeights.submission;

  const rawScore =
    attendanceContribution +
    masteryContribution +
    velocityContribution +
    submissionContribution;

  // Clamp final score to [0, 100] and round to 2 decimals
  const clampedScore = Math.min(
    100,
    Math.max(0, Math.round(rawScore * 100) / 100),
  );

  let category: RiskCategory;
  if (clampedScore < 30) {
    category = "SAFE";
  } else if (clampedScore < 65) {
    category = "MODERATE";
  } else {
    category = "CRITICAL";
  }

  return {
    score: clampedScore,
    category,
    breakdown: {
      attendanceContribution: Math.round(attendanceContribution * 100) / 100,
      masteryContribution: Math.round(masteryContribution * 100) / 100,
      velocityContribution: Math.round(velocityContribution * 100) / 100,
      submissionContribution: Math.round(submissionContribution * 100) / 100,
    },
  };
}

/**
 * Convenience helper to map academic health percentages into risk inputs (where 0 is safe, 100 is high risk).
 *
 * @param attendancePercent Student attendance % (0-100)
 * @param masteryPercent Student mastery % (0-100)
 * @param velocityScore Daily velocity (-1 to +1)
 * @param submissionRate Assignment submission % (0-100)
 */
export function academicMetricsToRiskInputs(
  attendancePercent: number,
  masteryPercent: number,
  velocityScore: number,
  submissionRate: number,
): RiskInputs {
  // Invert percentages: lower performance = higher risk
  const attendanceRisk = Math.min(100, Math.max(0, 100 - attendancePercent));
  const masteryRisk = Math.min(100, Math.max(0, 100 - masteryPercent));
  const submissionRisk = Math.min(100, Math.max(0, 100 - submissionRate));

  // Velocity risk: negative velocity (declining) is high risk, positive velocity is low risk
  // Scale -0.5 .. +0.5 to 100 .. 0
  const normalizedVelocityRisk = Math.min(
    100,
    Math.max(0, 50 - velocityScore * 50),
  );

  return {
    attendance: attendanceRisk,
    mastery: masteryRisk,
    velocity: normalizedVelocityRisk,
    submission: submissionRisk,
  };
}
