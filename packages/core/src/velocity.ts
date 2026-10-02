export type VelocityBand =
  "RAPID_IMPROVEMENT" | "IMPROVING" | "STABLE" | "DECLINING" | "RAPID_DECLINE";

/**
 * Calculates academic mastery velocity (rate of change in mastery per day).
 *
 * @param m1 Initial mastery score (0-100)
 * @param m2 Subsequent mastery score (0-100)
 * @param days Number of elapsed calendar or instructional days
 * @returns Velocity in mastery points per day
 */
export function velocity(m1: number, m2: number, days: number): number {
  if (days <= 0) {
    throw new Error(
      "Elapsed days must be greater than zero to calculate velocity",
    );
  }
  const delta = m2 - m1;
  const rate = delta / days;
  return Math.round(rate * 1000) / 1000;
}

/**
 * Categorizes velocity rate into academic progression bands.
 *
 * Thresholds:
 * - v >= 0.5: RAPID_IMPROVEMENT
 * - 0.1 <= v < 0.5: IMPROVING
 * - -0.1 < v < 0.1: STABLE
 * - -0.5 < v <= -0.1: DECLINING
 * - v <= -0.5: RAPID_DECLINE
 *
 * @param v Mastery velocity
 * @returns Categorized VelocityBand
 */
export function velocityBand(v: number): VelocityBand {
  if (v >= 0.5) {
    return "RAPID_IMPROVEMENT";
  }
  if (v >= 0.1) {
    return "IMPROVING";
  }
  if (v > -0.1) {
    return "STABLE";
  }
  if (v > -0.5) {
    return "DECLINING";
  }
  return "RAPID_DECLINE";
}
