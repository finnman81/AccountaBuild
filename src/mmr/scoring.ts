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

