import { recommendTargets } from '../../src/utils/recommendedTargets';

describe('recommendTargets', () => {
  const base = { weightLb: 180, heightIn: 70, age: 30, sex: 'male' as const };

  it('personalizes calories from stats (Mifflin-St Jeor × activity − 500 for cut)', () => {
    const r = recommendTargets({ goalMode: 'cut', workoutsPerWeek: 4, ...base });
    // BMR ≈ 10*81.6 + 6.25*177.8 − 150 + 5 ≈ 1782; ×1.55 ≈ 2762; −500 ≈ 2262 → 2250
    expect(r.personalized).toBe(true);
    expect(r.dailyCalorieGoal).toBeGreaterThan(2100);
    expect(r.dailyCalorieGoal).toBeLessThan(2400);
    expect(r.dailyCalorieGoal % 50).toBe(0);
  });

  it('bulk recommends more than cut for the same person', () => {
    const cut = recommendTargets({ goalMode: 'cut', workoutsPerWeek: 4, ...base });
    const bulk = recommendTargets({ goalMode: 'bulk', workoutsPerWeek: 5, ...base });
    expect(bulk.dailyCalorieGoal).toBeGreaterThan(cut.dailyCalorieGoal);
  });

  it('falls back to static intent defaults when stats are missing', () => {
    const r = recommendTargets({ goalMode: 'cut', workoutsPerWeek: 4, weightLb: null, heightIn: 70, age: 30 });
    expect(r).toEqual({ dailyCalorieGoal: 1800, workoutsPerWeek: 4, personalized: false });
  });

  it('unknown sex uses the midpoint constant (between male and female)', () => {
    const male = recommendTargets({ goalMode: 'maintenance', workoutsPerWeek: 4, ...base, sex: 'male' });
    const female = recommendTargets({ goalMode: 'maintenance', workoutsPerWeek: 4, ...base, sex: 'female' });
    const other = recommendTargets({ goalMode: 'maintenance', workoutsPerWeek: 4, ...base, sex: null });
    expect(other.dailyCalorieGoal).toBeGreaterThan(female.dailyCalorieGoal);
    expect(other.dailyCalorieGoal).toBeLessThan(male.dailyCalorieGoal);
  });

  it('clamps to a safe floor for aggressive cuts on small bodies', () => {
    const r = recommendTargets({ goalMode: 'cut', workoutsPerWeek: 1, weightLb: 95, heightIn: 58, age: 60, sex: 'female' });
    expect(r.dailyCalorieGoal).toBeGreaterThanOrEqual(1400);
  });
});
