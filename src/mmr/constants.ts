export const RULES_VERSION = 'v1' as const;

export const K = 100;
export const wA = 0.7;
export const wO = 0.3;

export function clamp(min: number, max: number, x: number): number {
  return Math.max(min, Math.min(max, x));
}

export function streakMultiplier(streakWeeks: number): number {
  if (streakWeeks >= 12) return 1.45;
  if (streakWeeks >= 8) return 1.3;
  if (streakWeeks >= 4) return 1.15;
  if (streakWeeks >= 2) return 1.05;
  return 1.0;
}

export function missedWeekPenalty(mmr: number): number {
  return Math.max(30, 0.015 * mmr);
}

export function partialWeekPenalty(mmr: number): number {
  return Math.max(15, 0.0075 * mmr);
}

