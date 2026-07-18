export type CalorieGoalMode = 'cut' | 'bulk' | 'maintenance' | null;

/** Full-credit band for cut/maintenance: within [75%, 120%] of budget. */
export const CAL_BAND_LOW = 0.75;
export const CAL_BAND_HIGH = 1.2;
/** Any honestly-logged day earns at least this (the habit half of the system). */
export const CAL_HABIT_CREDIT = 0.5;

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
): number {
  const hasBudget = dailyCalorieGoal != null && Number.isFinite(dailyCalorieGoal) && dailyCalorieGoal > 0;
  return Object.values(totalsByDate).reduce((sum, total) => {
    if (!(total > 0)) return sum;
    if (!hasBudget) return sum + 1;
    const budget = dailyCalorieGoal as number;
    const full = goalMode === 'bulk'
      ? total >= budget
      : total >= CAL_BAND_LOW * budget && total <= CAL_BAND_HIGH * budget;
    return sum + (full ? 1 : CAL_HABIT_CREDIT);
  }, 0);
}
