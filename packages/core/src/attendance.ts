/**
 * Calculates attendance percentage from Present, On-Duty, and Total session counts.
 * Returns 100 when total sessions T = 0.
 *
 * @param P Number of sessions present
 * @param OD Number of sessions on approved duty
 * @param T Total number of conducted sessions
 * @returns Attendance percentage in range [0, 100]
 */
export function attendancePercent(P: number, OD: number, T: number): number {
  if (T <= 0) {
    return 100;
  }
  const attended = Math.max(0, P) + Math.max(0, OD);
  const percentage = (attended / T) * 100;
  return Math.min(100, Math.max(0, percentage));
}

/**
 * Calculates the maximum number of classes a student can safely miss (bunk)
 * while maintaining attendance at or above the threshold theta (default 0.75 or 75%).
 *
 * Formula: max k such that (P + OD) / (T + k) >= theta.
 * Returns 0 if current attendance is already below theta.
 *
 * @param P Number of sessions present
 * @param OD Number of sessions on approved duty
 * @param T Total number of conducted sessions
 * @param theta Threshold fraction (e.g. 0.75) or percentage (75)
 * @returns Non-negative integer count of safe bunks
 */
export function safeBunks(
  P: number,
  OD: number,
  T: number,
  theta: number = 0.75,
): number {
  const normTheta = theta > 1 ? theta / 100 : theta;
  if (normTheta <= 0) {
    return 0;
  }

  const attended = Math.max(0, P) + Math.max(0, OD);
  if (T <= 0) {
    // If no classes have happened yet, bunks cannot be safely planned with zero attended
    return 0;
  }

  const currentRatio = attended / T;
  // If already below threshold, 0 safe bunks available
  if (currentRatio < normTheta) {
    return 0;
  }

  // (attended) / (T + k) >= theta => T + k <= attended / theta => k <= (attended / theta) - T
  const maxK = Math.floor(attended / normTheta - T);
  return Math.max(0, maxK);
}

/**
 * Calculates the minimum number of consecutive future classes a student must attend
 * to recover their attendance to at or above the threshold theta (default 0.75 or 75%).
 *
 * Formula: min m such that (P + OD + m) / (T + m) >= theta.
 * Returns 0 if current attendance is already at or above theta.
 *
 * @param P Number of sessions present
 * @param OD Number of sessions on approved duty
 * @param T Total number of conducted sessions
 * @param theta Threshold fraction (e.g. 0.75) or percentage (75)
 * @returns Non-negative integer count of classes needed to recover
 */
export function classesToRecover(
  P: number,
  OD: number,
  T: number,
  theta: number = 0.75,
): number {
  const normTheta = theta > 1 ? theta / 100 : theta;
  if (normTheta <= 0) {
    return 0;
  }
  if (normTheta >= 1) {
    // 100% threshold: once a class is missed, 100% can never mathematically be reached
    const attended = Math.max(0, P) + Math.max(0, OD);
    return attended >= T ? 0 : Infinity;
  }

  if (T <= 0) {
    return 0;
  }

  const attended = Math.max(0, P) + Math.max(0, OD);
  const currentRatio = attended / T;

  if (currentRatio >= normTheta) {
    return 0;
  }

  // (attended + m) / (T + m) >= theta
  // attended + m >= theta * T + theta * m
  // m * (1 - theta) >= theta * T - attended
  // m >= (theta * T - attended) / (1 - theta)
  const minM = Math.ceil((normTheta * T - attended) / (1 - normTheta));
  return Math.max(0, minM);
}

/**
 * Predicts attendance percentage if the student either attends or misses the next N classes.
 *
 * @param P Number of sessions present
 * @param OD Number of sessions on approved duty
 * @param T Total number of conducted sessions
 * @param N Number of upcoming classes
 * @param attending Whether student attends (true) or misses (false) all N classes
 * @returns Predicted attendance percentage
 */
export function predictedAttendance(
  P: number,
  OD: number,
  T: number,
  N: number,
  attending: boolean,
): number {
  const futureClasses = Math.max(0, N);
  if (futureClasses === 0) {
    return attendancePercent(P, OD, T);
  }

  if (attending) {
    return attendancePercent(P + futureClasses, OD, T + futureClasses);
  }

  return attendancePercent(P, OD, T + futureClasses);
}

export type AttendanceWarningLevel = "NONE" | "WATCH" | "URGENT" | "BREACH";

/**
 * Categorizes attendance warning level based on attendance percentage and safe bunks.
 *
 * Rules:
 * - BREACH: percent < 75.0
 * - URGENT: percent < 77.0 (and >= 75.0)
 * - WATCH:  percent < 80.0 OR safeBunks <= 2
 * - NONE:   percent >= 80.0 AND safeBunks > 2
 *
 * @param percent Attendance percentage (0-100)
 * @param safeBunks Safe classes that can be missed while staying >= 75%
 */
export function attendanceWarningLevel(
  percent: number,
  safeBunks: number,
): AttendanceWarningLevel {
  if (percent < 75.0) {
    return "BREACH";
  }
  if (percent < 77.0) {
    return "URGENT";
  }
  if (percent < 80.0 || safeBunks <= 2) {
    return "WATCH";
  }
  return "NONE";
}

