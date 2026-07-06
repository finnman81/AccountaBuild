/**
 * Personalized goal recommendations computed from onboarding basic info.
 *
 * Calories use Mifflin-St Jeor BMR × an activity factor tied to the planned
 * workout frequency, then adjusted for the training intent (cut −500, bulk
 * +300). Falls back gracefully when optional fields (weight, sex) are missing.
 */

export type GoalMode = 'cut' | 'bulk' | 'maintenance';

export type RecommendInput = {
  goalMode: GoalMode;
  /** Planned workouts per week (drives the activity factor). */
  workoutsPerWeek: number;
  weightLb?: number | null;
  heightIn?: number | null;
  age?: number | null;
  sex?: 'male' | 'female' | 'other' | null;
};

export type RecommendedTargets = {
  dailyCalorieGoal: number;
  workoutsPerWeek: number;
  /** True when we had enough stats for a personalized number (vs. static fallback). */
  personalized: boolean;
};

/** Static per-intent fallbacks when stats are missing (mirrors the old onboarding defaults). */
const FALLBACK_CALORIES: Record<GoalMode, number> = { cut: 1800, bulk: 2800, maintenance: 2200 };

export const WORKOUTS_BY_INTENT: Record<string, number> = {
  lose_weight: 4,
  build_muscle: 5,
  stay_consistent: 4,
  train_event: 5,
};

function roundTo50(n: number): number {
  return Math.round(n / 50) * 50;
}

export function recommendTargets(input: RecommendInput): RecommendedTargets {
  const workouts = Math.min(7, Math.max(1, Math.round(input.workoutsPerWeek || 4)));

  const w = Number(input.weightLb);
  const h = Number(input.heightIn);
  const a = Number(input.age);
  const hasStats = Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0 && Number.isFinite(a) && a > 0;

  if (!hasStats) {
    return { dailyCalorieGoal: FALLBACK_CALORIES[input.goalMode], workoutsPerWeek: workouts, personalized: false };
  }

  const kg = w * 0.453592;
  const cm = h * 2.54;

  // Mifflin-St Jeor: male +5, female −161; unknown/other → midpoint (−78).
  const sexConst = input.sex === 'male' ? 5 : input.sex === 'female' ? -161 : -78;
  const bmr = 10 * kg + 6.25 * cm - 5 * a + sexConst;

  // Activity factor from planned training volume: 1.35 (sedentary-ish base)
  // up to ~1.7 at daily training.
  const activity = 1.35 + 0.05 * workouts;
  const tdee = bmr * activity;

  const adjusted = input.goalMode === 'cut' ? tdee - 500 : input.goalMode === 'bulk' ? tdee + 300 : tdee;

  // Sanity clamp (also the floor for safe cutting).
  const clamped = Math.min(4000, Math.max(1400, adjusted));
  return { dailyCalorieGoal: roundTo50(clamped), workoutsPerWeek: workouts, personalized: true };
}
