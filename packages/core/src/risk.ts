import { normalizeVelocityRisk } from "./velocity.js";

export type RiskCategory = "SAFE" | "MODERATE" | "CRITICAL";

export const PLANNED_SESSIONS_PER_COURSE = 30;

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

export interface FactorAttribution {
  factor: "attendance" | "mastery" | "velocity" | "submission";
  contribution: number;
  percentage: number;
  riskValue: number;
}

export interface ProtectiveFactor {
  factor: "attendance" | "mastery" | "velocity" | "submission";
  contribution: number;
  riskValue: number;
}

export interface RiskExplanation {
  compositeScore: number;
  category: RiskCategory;
  riskIncreasingFactors: FactorAttribution[];
  protectiveFactors: ProtectiveFactor[];
  contributions: {
    attendance: number;
    mastery: number;
    velocity: number;
    submission: number;
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
 * @param inputs Normalized risk inputs (or raw velocity v in [-3, 3])
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

  // If velocity is raw (negative or within [-3, 3]), normalize it; if already normalized (> 3), clamp to [0, 100]
  const vel =
    inputs.velocity < 0 || (inputs.velocity >= 0 && inputs.velocity <= 3)
      ? normalizeVelocityRisk(inputs.velocity)
      : Math.min(100, Math.max(0, inputs.velocity));

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
 * @param velocityScore Daily velocity (-3 to +3)
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
  const normalizedVelocityRiskScore = normalizeVelocityRisk(velocityScore);

  return {
    attendance: attendanceRisk,
    mastery: masteryRisk,
    velocity: normalizedVelocityRiskScore,
    submission: submissionRisk,
  };
}

/**
 * Explains risk by decomposing contributions into risk-increasing factors
 * (whose relative attribution percentages sum to 100) and protective factors.
 *
 * @param inputs Academic risk inputs
 * @param weights Optional custom weights
 */
export function explainRisk(
  inputs: RiskInputs,
  weights: Partial<RiskWeights> = {},
): RiskExplanation {
  const result = riskScore(inputs, weights);

  const attRisk = Math.min(100, Math.max(0, inputs.attendance));
  const masRisk = Math.min(100, Math.max(0, inputs.mastery));
  const velRisk =
    inputs.velocity < 0 || (inputs.velocity >= 0 && inputs.velocity <= 3)
      ? normalizeVelocityRisk(inputs.velocity)
      : Math.min(100, Math.max(0, inputs.velocity));
  const subRisk = Math.min(100, Math.max(0, inputs.submission));

  const rawFactors: {
    factor: "attendance" | "mastery" | "velocity" | "submission";
    contribution: number;
    riskValue: number;
  }[] = [
    {
      factor: "attendance",
      contribution: result.breakdown.attendanceContribution,
      riskValue: attRisk,
    },
    {
      factor: "mastery",
      contribution: result.breakdown.masteryContribution,
      riskValue: masRisk,
    },
    {
      factor: "velocity",
      contribution: result.breakdown.velocityContribution,
      riskValue: velRisk,
    },
    {
      factor: "submission",
      contribution: result.breakdown.submissionContribution,
      riskValue: subRisk,
    },
  ];

  // A factor is protective if its riskValue < 30 (safe performance threshold).
  const hasElevatedRisk = rawFactors.some((f) => f.riskValue >= 30);

  let riskIncreasingRaw: typeof rawFactors;
  let protectiveRaw: typeof rawFactors;

  if (hasElevatedRisk) {
    riskIncreasingRaw = rawFactors.filter((f) => f.riskValue >= 30);
    protectiveRaw = rawFactors.filter((f) => f.riskValue < 30);
  } else {
    // If no factor has risk >= 30, non-zero risk factors are risk-increasing, zero risk factors are protective
    const hasAnyRisk = rawFactors.some((f) => f.riskValue > 0);
    if (hasAnyRisk) {
      riskIncreasingRaw = rawFactors.filter((f) => f.riskValue > 0);
      protectiveRaw = rawFactors.filter((f) => f.riskValue === 0);
    } else {
      riskIncreasingRaw = [];
      protectiveRaw = [...rawFactors];
    }
  }

  // Sort risk-increasing factors by contribution descending (highest driver first)
  riskIncreasingRaw.sort((a, b) => b.contribution - a.contribution);

  const totalRiskContribution = riskIncreasingRaw.reduce(
    (sum, f) => sum + f.contribution,
    0,
  );

  let riskIncreasingFactors: FactorAttribution[] = [];
  if (totalRiskContribution > 0) {
    let allocatedSum = 0;
    riskIncreasingFactors = riskIncreasingRaw.map((f, idx) => {
      if (idx === riskIncreasingRaw.length - 1) {
        // Last item absorbs rounding difference to ensure exact 100.0% sum
        const percentage = Math.round((100 - allocatedSum) * 10) / 10;
        return {
          ...f,
          percentage,
        };
      }
      const percentage =
        Math.round((f.contribution / totalRiskContribution) * 1000) / 10;
      allocatedSum += percentage;
      return {
        ...f,
        percentage,
      };
    });
  }

  const protectiveFactors: ProtectiveFactor[] = protectiveRaw.map((f) => ({
    factor: f.factor,
    contribution: f.contribution,
    riskValue: f.riskValue,
  }));

  const finalCategory =
    inputs.velocity <= -1.5 || result.category === "CRITICAL"
      ? "CRITICAL"
      : result.category;

  return {
    compositeScore: result.score,
    category: finalCategory,
    riskIncreasingFactors,
    protectiveFactors,
    contributions: {
      attendance: result.breakdown.attendanceContribution,
      mastery: result.breakdown.masteryContribution,
      velocity: result.breakdown.velocityContribution,
      submission: result.breakdown.submissionContribution,
    },
  };
}
