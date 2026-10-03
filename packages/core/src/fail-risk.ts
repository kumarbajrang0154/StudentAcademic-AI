export const PASS_MARK = 40;

export type FailRiskLabel = "LIKELY_TO_FAIL" | "AT_RISK" | "ON_TRACK";

export interface FailRiskInputs {
  mastery: number; // 0-100
  velocity: number; // rate of change in points/day
  attendance: number; // 0-100
  riskCategory: "SAFE" | "MODERATE" | "CRITICAL";
}

export interface FailRiskResult {
  projectedFinal: number;
  label: FailRiskLabel;
  reasons: string[];
}

/**
 * Pure function to calculate rule-based fail risk estimate (Problems 3 and 6).
 *
 * Rule:
 * projectedFinal = mastery + (velocity * 14), clamped 0-100 (14-day horizon).
 *
 * Labels:
 * - LIKELY_TO_FAIL: projectedFinal < PASS_MARK (40) OR (riskCategory === "CRITICAL" and mastery < 50)
 * - AT_RISK: projectedFinal < 55 OR riskCategory === "MODERATE" OR attendance < 75
 * - ON_TRACK: otherwise
 *
 * @param inputs Academic indicators (mastery, velocity, attendance, riskCategory)
 * @returns FailRiskResult with projected final score, classification label, and descriptive reasons
 */
export function failRisk(inputs: FailRiskInputs): FailRiskResult {
  const { mastery, velocity, attendance, riskCategory } = inputs;

  const rawProjected = mastery + velocity * 14;
  const projectedFinal = Math.min(100, Math.max(0, Math.round(rawProjected * 10) / 10));

  const reasons: string[] = [];

  const isLikelyToFail =
    projectedFinal < PASS_MARK || (riskCategory === "CRITICAL" && mastery < 50);

  if (isLikelyToFail) {
    if (projectedFinal < PASS_MARK) {
      reasons.push(`Projected final ${projectedFinal}% is below pass mark ${PASS_MARK}%`);
    }
    if (riskCategory === "CRITICAL" && mastery < 50) {
      reasons.push(`Critical risk category with current mastery ${mastery}% below 50%`);
    }
    if (attendance < 75) {
      reasons.push(`Attendance ${attendance}% is below minimum 75% threshold`);
    }
    return {
      projectedFinal,
      label: "LIKELY_TO_FAIL",
      reasons,
    };
  }

  const isAtRisk =
    projectedFinal < 55 || riskCategory === "MODERATE" || attendance < 75;

  if (isAtRisk) {
    if (projectedFinal < 55) {
      reasons.push(`Projected final ${projectedFinal}% is below safe margin 55%`);
    }
    if (riskCategory === "MODERATE") {
      reasons.push(`Overall academic risk level is MODERATE`);
    }
    if (attendance < 75) {
      reasons.push(`Attendance ${attendance}% is below minimum 75% threshold`);
    }
    return {
      projectedFinal,
      label: "AT_RISK",
      reasons,
    };
  }

  reasons.push(`Projected final ${projectedFinal}% is on track to clear pass mark`);
  return {
    projectedFinal,
    label: "ON_TRACK",
    reasons,
  };
}
