import { K, clamp, wA, wO } from './constants';

export function adherenceFraction(done: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 1;
  return clamp(0, 1, done / target);
}

export function outcomeRate(actual: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return clamp(0, 1, actual / target);
}

export function goalScore(D: number, A: number, O: number): number {
  return K * D * (wA * A + wO * O);
}

export function combineWeekScore(scores: number[]): number {
  if (!scores.length) return 0;
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  return 0.6 * maxScore + 0.4 * avgScore;
}

/**
 * How many of the three core categories (workouts, calories, weight) are being
 * tracked, given the ids of the active goals. `minutes` folds into workouts;
 * weightLoss/weightGain both count as the weight category.
 */
export function coreCategoryCount(activeGoalIds: string[]): number {
  const has = (ids: string[]) => activeGoalIds.some((id) => ids.includes(id));
  const workouts = has(['workouts', 'minutes']);
  const calories = has(['calorieDays']);
  const weight = has(['weightLoss', 'weightGain']);
  return (workouts ? 1 : 0) + (calories ? 1 : 0) + (weight ? 1 : 0);
}

/**
 * Breadth factor on weekly MMR gain: tracking more of the three core categories
 * levels you up faster; tracking fewer is slower. Opting a category out avoids
 * any penalty for it, but you forgo its share of progress. Full breadth (3) runs
 * at the normal rate, so this only slows the partial trackers.
 */
export function breadthFactor(coreCount: number): number {
  const n = Math.max(0, Math.min(3, Math.round(coreCount)));
  const table: Record<number, number> = { 0: 0, 1: 0.8, 2: 0.92, 3: 1 };
  return table[n] ?? 1;
}

