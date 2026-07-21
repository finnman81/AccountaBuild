import { D_weightLoss, weightV2ActiveForWeek, WEIGHT_V2_FROM_WEEK } from '../../src/mmr/difficulty';

describe('weight v2 gating', () => {
  it('activates at W31, never before', () => {
    expect(weightV2ActiveForWeek('2026-W30')).toBe(false);
    expect(weightV2ActiveForWeek(WEIGHT_V2_FROM_WEEK)).toBe(true);
    expect(weightV2ActiveForWeek('2027-W01')).toBe(true);
  });
});

describe('weight v2 BMI-spare difficulty', () => {
  const T = 12;
  it('separates lean vs heavy for the SAME loss (~18%, was ~2%)', () => {
    const lean = D_weightLoss({ W0: 180, Wg: 170, Wt: 180, Tweeks: T, hIn: 70, bmiBase: true });
    const heavy = D_weightLoss({ W0: 230, Wg: 220, Wt: 230, Tweeks: T, hIn: 72, bmiBase: true });
    expect(lean.D).toBeGreaterThan(heavy.D * 1.15);
  });

  it('falls back to v1 without height or when not gated', () => {
    const v1 = D_weightLoss({ W0: 180, Wg: 170, Wt: 180, Tweeks: T });
    const noHeight = D_weightLoss({ W0: 180, Wg: 170, Wt: 180, Tweeks: T, bmiBase: true });
    const notGated = D_weightLoss({ W0: 180, Wg: 170, Wt: 180, Tweeks: T, hIn: 70, bmiBase: false });
    expect(noHeight.D).toBeCloseTo(v1.D, 10);
    expect(notGated.D).toBeCloseTo(v1.D, 10);
  });

  it('caps at max difficulty when the goal dips below the lean floor', () => {
    // 140 lb at 5'6": only ~3.7 lb above the BMI-22 floor, cutting 10 —
    // spare falls back to L itself, rel clamps to 1 → max base difficulty.
    const r = D_weightLoss({ W0: 140, Wg: 130, Wt: 140, Tweeks: T, hIn: 66, bmiBase: true });
    expect(r.D_base).toBeCloseTo(1.9, 5);
  });

  it('near-floor cuts rate high but below the cap (150@5ft6 cutting 10 -> rel .73)', () => {
    const r = D_weightLoss({ W0: 150, Wg: 140, Wt: 150, Tweeks: T, hIn: 66, bmiBase: true });
    expect(r.D_base).toBeGreaterThan(1.6);
    expect(r.D_base).toBeLessThan(1.9);
  });
});
