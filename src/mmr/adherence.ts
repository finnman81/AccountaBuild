export type CalorieGoalMode = 'cut' | 'bulk' | 'maintenance' | null;

/**
 * Count days that "hit" the calorie target from per-day calorie totals.
 *
 * Direction depends on the user's goal mode:
 * - cut / maintenance (and default): a day counts when the user stayed at or
 *   UNDER budget (the standard "within budget" interpretation).
 * - bulk: a day counts when the user ate AT OR ABOVE budget — a bulker's goal
 *   is hitting a surplus, so "under budget" would be exactly backwards (the
 *   old behavior penalized bulk users for succeeding).
 *
 * With no budget set we cannot judge the target, so any day with calories
 * logged counts.
 */
export function calorieDaysHitFromTotals(
  totalsByDate: Record<string, number>,
  dailyCalorieGoal: number | null,
  goalMode: CalorieGoalMode = null,
): number {
  const hasBudget = dailyCalorieGoal != null && Number.isFinite(dailyCalorieGoal) && dailyCalorieGoal > 0;
  return Object.values(totalsByDate).reduce((sum, total) => {
    if (!(total > 0)) return sum;
    if (hasBudget) {
      const budget = dailyCalorieGoal as number;
      if (goalMode === 'bulk' ? total < budget : total > budget) return sum;
    }
    return sum + 1;
  }, 0);
}
