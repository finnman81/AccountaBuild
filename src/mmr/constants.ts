import type { Tier } from './types';

export const RULES_VERSION = 'v1' as const;

export const K = 100;
export const wA = 0.7;
export const wO = 0.3;

/**
 * The rank every new account starts at: Silver IV (1800 MMR) — the same
 * fresh-push baseline the reset scripts use. Used to seed a user's rank at
 * registration and as the "no MMR yet" fallback in the weekly scorer, so a
 * brand-new user begins at Silver IV instead of the old Bronze-IV (1000) floor.
 */
export const STARTING_MMR = 1800;
export const STARTING_TIER: Tier = 'Silver';
export const STARTING_DIVISION = 4 as const;

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

