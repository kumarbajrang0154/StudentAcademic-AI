export interface PercentileResult {
  percentile: number | null;
  reason?: string;
}

/**
 * Calculates the percentile rank of a score relative to a cohort.
 * Requires a minimum cohort size of 15; otherwise returns null with an explanation reason.
 *
 * Formula: ((Count(x < score) + 0.5 * Count(x == score)) / N) * 100
 *
 * @param score The student's score
 * @param cohort Array of all scores in the comparative cohort
 * @returns PercentileResult with percentile [0, 100] or null with reason
 */
export function percentile(score: number, cohort: number[]): PercentileResult {
  if (!cohort || cohort.length < 15) {
    return {
      percentile: null,
      reason: `Cohort size must be at least 15 (received ${cohort ? cohort.length : 0})`,
    };
  }

  const n = cohort.length;
  let below = 0;
  let equal = 0;

  for (let i = 0; i < n; i++) {
    const val = cohort[i]!;
    if (val < score) {
      below++;
    } else if (val === score) {
      equal++;
    }
  }

  const rank = ((below + 0.5 * equal) / n) * 100;
  const clampedRank = Math.min(100, Math.max(0, rank));

  return {
    percentile: Math.round(clampedRank * 100) / 100,
  };
}
