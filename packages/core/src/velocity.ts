export type VelocityBand =
  "IMPROVING" | "STABLE" | "DECLINING" | "STEEP_DECLINE";

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
 * Categorizes velocity rate into academic progression bands (% points per day).
 *
 * Thresholds:
 * - v > 0.2: IMPROVING
 * - -0.2 <= v <= 0.2: STABLE
 * - -0.8 <= v < -0.2: DECLINING
 * - v < -0.8: STEEP_DECLINE
 *
 * @param v Mastery velocity (% points per day)
 * @returns Categorized VelocityBand
 */
export function velocityBand(v: number): VelocityBand {
  if (v > 0.2) {
    return "IMPROVING";
  }
  if (v >= -0.2) {
    return "STABLE";
  }
  if (v >= -0.8) {
    return "DECLINING";
  }
  return "STEEP_DECLINE";
}

/**
 * Flags critical velocity decline warning when rate of drop is severe (e.g. over a 14-day window).
 * Returns true when v <= -1.5.
 *
 * @param v Mastery velocity
 * @returns boolean indicating if severe decline warning is triggered
 */
export function negativeVelocityWarning(v: number): boolean {
  return v <= -1.5;
}

/**
 * Normalizes velocity score v into a 0-100 risk score where higher is more risky.
 * normalizeVelocityRisk(v) = clamp(-v / 3 * 100, 0, 100)
 *
 * Examples:
 * v = 0 -> 0 risk
 * v = -1.5 -> 50 risk
 * v <= -3.0 -> 100 risk
 * v >= 0 -> 0 risk
 *
 * @param v Velocity in mastery points per day
 * @returns Clamped risk score [0, 100]
 */
export function normalizeVelocityRisk(v: number): number {
  const val = (-v / 3) * 100;
  const clamped = Math.min(100, Math.max(0, val));
  return Math.round(clamped * 100) / 100;
}

