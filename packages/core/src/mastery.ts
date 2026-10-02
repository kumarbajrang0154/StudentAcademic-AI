export interface CourseMasteryComponent {
  name?: string;
  score?: number | null;
  maxScore?: number;
  max?: number;
  weight: number;
  isPending?: boolean;
  status?: string;
}

/**
 * Calculates student course mastery score based on weighted assessment components.
 *
 * Requirements:
 * - Excludes pending components (isPending === true, status === 'PENDING', or score is null/undefined)
 * - Excludes zero-max components (max <= 0)
 * - Normalizes proportionally if total valid component weight < 100
 * - Throws an error if total weight exceeds 100
 *
 * @param components List of assessment components with scores, maximums, and weights
 * @returns Normalized course mastery percentage [0, 100]
 */
export function courseMastery(components: CourseMasteryComponent[]): number {
  if (!components || components.length === 0) {
    return 0;
  }

  // Check if overall specified weight exceeds 100
  const allComponentsWeight = components.reduce(
    (sum, c) => sum + (c.weight || 0),
    0,
  );
  if (allComponentsWeight > 100) {
    throw new Error(
      `Total assessment weight exceeds 100 (got ${allComponentsWeight})`,
    );
  }

  // Filter out pending and zero-max components
  const validComponents = components.filter((c) => {
    if (
      c.isPending === true ||
      c.status === "PENDING" ||
      c.score === null ||
      c.score === undefined
    ) {
      return false;
    }
    const maxVal = c.maxScore ?? c.max ?? 0;
    if (maxVal <= 0) {
      return false;
    }
    return true;
  });

  if (validComponents.length === 0) {
    return 0;
  }

  const validWeight = validComponents.reduce((sum, c) => sum + c.weight, 0);
  if (validWeight > 100) {
    throw new Error(
      `Total weight of evaluated components exceeds 100 (got ${validWeight})`,
    );
  }

  const weightedSum = validComponents.reduce((acc, c) => {
    const maxVal = c.maxScore ?? c.max ?? 1;
    const scoreVal = Math.max(0, c.score ?? 0);
    const componentScore = (scoreVal / maxVal) * c.weight;
    return acc + componentScore;
  }, 0);

  // If valid weight < 100, normalize proportionally
  if (validWeight < 100) {
    const normalized = (weightedSum / validWeight) * 100;
    return Math.min(100, Math.max(0, Math.round(normalized * 100) / 100));
  }

  return Math.min(100, Math.max(0, Math.round(weightedSum * 100) / 100));
}
