/**
 * Count days that "hit" the calorie target from per-day calorie totals.
 *
 * If a daily calorie budget is set, a day counts only when the user stayed at or
 * under it (the standard "stayed within budget" interpretation for a cut). With no
 * budget set we cannot judge the target, so any day with calories logged counts.
 *
 * This replaces the previous behavior that counted *any* day with calories logged
 * as a hit even when a budget existed, which inflated adherence, streaks, and MMR.
 */
export function calorieDaysHitFromTotals(
  totalsByDate: Record<string, number>,
  dailyCalorieGoal: number | null,
): number {
  const hasBudget = dailyCalorieGoal != null && Number.isFinite(dailyCalorieGoal) && dailyCalorieGoal > 0;
  return Object.values(totalsByDate).reduce((sum, total) => {
    if (!(total > 0)) return sum;
    if (hasBudget && total > (dailyCalorieGoal as number)) return sum;
    return sum + 1;
  }, 0);
}
