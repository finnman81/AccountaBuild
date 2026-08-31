export type CalorieGoalMode = 'cut' | 'bulk' | 'maintenance' | null;

/**
 * Full-credit ceiling for cut/maintenance: at or under 120% of budget.
 * The original band also had a 75% FLOOR — removed 2026-07-20 after user
 * feedback: it punished sick/light days, conflating "stopped logging" with
 * "genuinely ate light" (indistinguishable from a total; under-eating on a
 * cut is not a failure). The under-logging loophole this re-opens is accepted
 * consciously — trust-based group, and lowCalorieDays still flags chronic
 * under-loggers on the weekly doc (visibility without punishment).
 */
export const CAL_BAND_HIGH = 1.2;
/** Any honestly-logged day earns at least this (the habit half of the system). */
export const CAL_HABIT_CREDIT = 0.5;

/**
 * The band rule activates at the START of this ISO week and applies to that
 * week onward. Weeks before it keep the old "any logged day counts" scoring,
 * so recomputing history never retroactively restates closed weeks — and the
 * new rule switches itself on at Monday 00:00 with no deploy required.
 * (Week ids are zero-padded, so string comparison is ordering-safe.)
 */
/**
 * The workouts goal counts DISTINCT DAYS TRAINED, not sessions, from this week
 * on. Mirrors WORKOUT_DAYS_FROM_WEEK in functions/mmr-core.js — the two must
 * move together or the app and the scorer disagree on screen.
 */
export const WORKOUT_DAYS_FROM_WEEK = '2026-W37';

export function workoutDaysActiveForWeek(weekId: string | null | undefined): boolean {
  return typeof weekId === 'string' && weekId >= WORKOUT_DAYS_FROM_WEEK;
}

export const CAL_BAND_FROM_WEEK = '2026-W30';

export function calorieBandActiveForWeek(weekId: string | null | undefined): boolean {
  return typeof weekId === 'string' && weekId >= CAL_BAND_FROM_WEEK;
}

/**
 * Credit days toward the calorie goal from per-day calorie totals.
 * Two systems in one (2026-07-18 design): the LOGGING HABIT and the actual
 * diet adherence each carry half the credit.
 *
 * - Any day with calories logged earns 0.5 (habit credit) — an under-logged
 *   1000-of-2000 day is no longer indistinguishable from a disciplined one,
 *   but it still builds the habit and never zeroes out.
 * - FULL credit (1.0) requires landing in the band:
 *   - cut / maintenance: total within 75%–120% of budget — near or at budget
 *     means the day was fully logged AND on plan; slightly over still counts
 *     (a fully-logged 2200 beats a half-logged "perfect" 1000).
 *   - bulk: total AT OR ABOVE budget (a surplus is the goal; there's no
 *     upper band — a big eating day is a bulker succeeding).
 * - No budget set: we can't judge the band, so any logged day counts fully.
 */
export function calorieDaysHitFromTotals(
  totalsByDate: Record<string, number>,
  dailyCalorieGoal: number | null,
  goalMode: CalorieGoalMode = null,
  /** false = pre-activation scoring (any day at/under budget counts fully). */
  useBand: boolean = true,
): number {
  const hasBudget = dailyCalorieGoal != null && Number.isFinite(dailyCalorieGoal) && dailyCalorieGoal > 0;
  return Object.values(totalsByDate).reduce((sum, total) => {
    if (!(total > 0)) return sum;
    if (!hasBudget) return sum + 1;
    const budget = dailyCalorieGoal as number;
    if (!useBand) {
      // Legacy rule, kept so closed weeks re-score identically forever.
      if (goalMode === 'bulk' ? total < budget : total > budget) return sum;
      return sum + 1;
    }
    const full = goalMode === 'bulk'
      ? total >= budget
      : total <= CAL_BAND_HIGH * budget;
    return sum + (full ? 1 : CAL_HABIT_CREDIT);
  }, 0);
}

/**
 * Implausibly-low logged days: a total this small almost always means the user
 * stopped logging partway through the day rather than actually eating that
 * little. Surfaced as a data-quality flag (weekly doc) rather than a scoring
 * penalty — the band rule already withholds full credit for these.
 */
export const LOW_CAL_THRESHOLD = 500;
export const LOW_CAL_FLAG_DAYS = 5;

export function countLowCalorieDays(totalsByDate: Record<string, number>): number {
  return Object.values(totalsByDate).filter((t) => t > 0 && t < LOW_CAL_THRESHOLD).length;
}
