import { breadthFactor, combineWeekScore, coreCategoryCount, goalScore } from '../../src/mmr/scoring';
import { K, wA, wO } from '../../src/mmr/constants';
import { D_calDays, D_minutes, D_workouts, D_weightGain, D_weightLoss } from '../../src/mmr/difficulty';

describe('mmr/scoring', () => {
  test('goalScore matches formula', () => {
    const D = 1.2;
    const A = 0.8;
    const O = 0.5;
    expect(goalScore(D, A, O)).toBeCloseTo(K * D * (wA * A + wO * O), 8);
  });

  test('combineWeekScore uses max + avg blend', () => {
    const scores = [10, 20, 30];
    const max = 30;
    const avg = (10 + 20 + 30) / 3;
    expect(combineWeekScore(scores)).toBeCloseTo(0.6 * max + 0.4 * avg, 8);
  });

  test('difficulty tables clamp and map expected values', () => {
    expect(D_workouts(3)).toBeCloseTo(1.0, 8);
    expect(D_calDays(7)).toBeCloseTo(1.4, 8);

    // minutes: baseline at 150 -> ~1.0
    expect(D_minutes(150)).toBeGreaterThan(0.95);
    expect(D_minutes(150)).toBeLessThan(1.05);

    // minutes: clamps within [0.75, 2.0]
    expect(D_minutes(10)).toBeGreaterThanOrEqual(0.75);
    expect(D_minutes(9999)).toBeLessThanOrEqual(2.0);
  });

  test('coreCategoryCount counts distinct categories (minutes folds into workouts)', () => {
    expect(coreCategoryCount([])).toBe(0);
    expect(coreCategoryCount(['workouts'])).toBe(1);
    expect(coreCategoryCount(['workouts', 'minutes'])).toBe(1); // still just "workouts"
    expect(coreCategoryCount(['workouts', 'calorieDays'])).toBe(2);
    expect(coreCategoryCount(['workouts', 'calorieDays', 'weightLoss'])).toBe(3);
    expect(coreCategoryCount(['minutes', 'calorieDays', 'weightGain'])).toBe(3);
  });

  test('breadthFactor: full breadth is full rate, fewer categories are slower', () => {
    expect(breadthFactor(3)).toBe(1);
    expect(breadthFactor(2)).toBeLessThan(1);
    expect(breadthFactor(1)).toBeLessThan(breadthFactor(2));
    expect(breadthFactor(0)).toBe(0);
    // clamps out-of-range input
    expect(breadthFactor(5)).toBe(1);
    expect(breadthFactor(-1)).toBe(0);
  });

  test('only-workouts levels slower than tracking all three (equal per-goal score)', () => {
    const s = 20;
    const solo = combineWeekScore([s]) * breadthFactor(coreCategoryCount(['workouts']));
    const all = combineWeekScore([s, s, s]) * breadthFactor(coreCategoryCount(['workouts', 'calorieDays', 'weightLoss']));
    expect(solo).toBeLessThan(all);
  });

  test('weight loss/gain difficulty returns sane caps and progress', () => {
    const wl = D_weightLoss({ W0: 200, Wg: 180, Wt: 195, Tweeks: 12 });
    expect(wl.lossTarget).toBeGreaterThanOrEqual(0.25);
    expect(wl.lossTarget).toBeLessThanOrEqual(2.5);
    expect(wl.progress).toBeGreaterThanOrEqual(0);
    expect(wl.progress).toBeLessThanOrEqual(1);
    expect(wl.D).toBeGreaterThan(0);

    const wg = D_weightGain({ W0: 160, Wg: 175, Wt: 162, Tweeks: 16 });
    expect(wg.gainTarget).toBeGreaterThanOrEqual(0.1);
    expect(wg.gainTarget).toBeLessThanOrEqual(1.5);
    expect(wg.progress).toBeGreaterThanOrEqual(0);
    expect(wg.progress).toBeLessThanOrEqual(1);
    expect(wg.D).toBeGreaterThan(0);
  });
});

