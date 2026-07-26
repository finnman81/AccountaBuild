import { D_weightGain, D_weightLoss, WEIGHT_V3_FROM_WEEK, weightV3ActiveForWeek } from '../../src/mmr/difficulty';
import { goalScore } from '../../src/mmr/scoring';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('../../functions/mmr-core');

/**
 * Weight v3: phase difficulty follows the week's BEST weigh-in, so a late
 * swing can't retroactively re-grade FP that was already banked.
 *
 * The regression case is real: Watto (228 -> 220 goal, 12 weeks, 77in) hit
 * 220.0 on Saturday, weighed 221.6 on Sunday, and his week's FP fell 234 -> 197.
 */
const WATTO = { W0: 228, Wg: 220, Tweeks: 12, hIn: 77, bmiBase: false } as const;

describe('weight v3 gate', () => {
  it('activates at W32 and never earlier', () => {
    expect(WEIGHT_V3_FROM_WEEK).toBe('2026-W32');
    expect(weightV3ActiveForWeek('2026-W30')).toBe(false);
    expect(weightV3ActiveForWeek('2026-W31')).toBe(false); // v2 week keeps v2 math
    expect(weightV3ActiveForWeek('2026-W32')).toBe(true);
    expect(weightV3ActiveForWeek(null)).toBe(false);
  });

  it('client and server agree on the gate', () => {
    expect(core.WEIGHT_V3_FROM_WEEK).toBe(WEIGHT_V3_FROM_WEEK);
    for (const wk of ['2026-W30', '2026-W31', '2026-W32', '2027-W01']) {
      expect(core.weightV3ActiveForWeek(wk)).toBe(weightV3ActiveForWeek(wk));
    }
  });
});

describe('weight loss phase difficulty', () => {
  it('reproduces the prod regression WITHOUT v3 (banked FP clawed back)', () => {
    const best = D_weightLoss({ ...WATTO, Wt: 220 });
    const after = D_weightLoss({ ...WATTO, Wt: 221.6 });
    expect(goalScore(best.D, 1, 1)).toBeCloseTo(201.7, 0);
    expect(goalScore(after.D, 1, 1)).toBeCloseTo(152.5, 0);
    // ~49 FP of goal score evaporates from a 1.6 lb swing.
    expect(goalScore(best.D, 1, 1) - goalScore(after.D, 1, 1)).toBeGreaterThan(45);
  });

  it('WITH v3 the Sunday swing no longer re-grades the week', () => {
    const v3 = D_weightLoss({ ...WATTO, Wt: 221.6, WtPhase: 220 });
    const best = D_weightLoss({ ...WATTO, Wt: 220 });
    expect(v3.D).toBeCloseTo(best.D, 6);
    expect(v3.progress).toBeCloseTo(1, 6);
  });

  it('WtPhase can only ever help — a WORSE phase weight is ignored', () => {
    const plain = D_weightLoss({ ...WATTO, Wt: 222 });
    const sabotaged = D_weightLoss({ ...WATTO, Wt: 222, WtPhase: 240 });
    expect(sabotaged.D).toBeCloseTo(plain.D, 6);
  });

  it('never pays for progress not made (no weigh-in below start)', () => {
    const none = D_weightLoss({ ...WATTO, Wt: 228, WtPhase: 228 });
    expect(none.progress).toBe(0);
  });

  /**
   * Regression: the gate passes `WtPhase: null` for every pre-v3 week, and
   * Number(null) === 0 (NOT NaN). An isFinite-only check therefore read "no
   * phase weight" as 0 lb — infinite progress — and silently handed EVERY
   * weight goal a maxed D_phase. An A/B dry-run caught it pre-deploy.
   */
  it('null/undefined WtPhase behaves exactly like the pre-v3 formula', () => {
    const baseline = D_weightLoss({ ...WATTO, Wt: 221.6 });
    for (const p of [null, undefined]) {
      const gated = D_weightLoss({ ...WATTO, Wt: 221.6, WtPhase: p });
      expect(gated.D).toBeCloseTo(baseline.D, 10);
      expect(gated.progress).toBeCloseTo(0.8, 10); // NOT 1.0
      expect(core.D_weightLoss({ ...WATTO, Wt: 221.6, WtPhase: p }).D).toBeCloseTo(baseline.D, 10);
    }
  });

  it('null WtPhase is inert for gain goals too', () => {
    const baseline = D_weightGain({ W0: 150, Wg: 165, Tweeks: 12, Wt: 157 });
    const gated = D_weightGain({ W0: 150, Wg: 165, Tweeks: 12, Wt: 157, WtPhase: null });
    expect(gated.D).toBeCloseTo(baseline.D, 10);
    expect(core.D_weightGain({ W0: 150, Wg: 165, Tweeks: 12, Wt: 157, WtPhase: null }).D).toBeCloseTo(baseline.D, 10);
  });

  it('client and server D match, with and without WtPhase', () => {
    for (const p of [null, 220, 224]) {
      const a = D_weightLoss({ ...WATTO, Wt: 221.6, WtPhase: p });
      const b = core.D_weightLoss({ ...WATTO, Wt: 221.6, WtPhase: p });
      expect(a.D).toBeCloseTo(b.D, 10);
      expect(a.progress).toBeCloseTo(b.progress, 10);
    }
  });
});

describe('weight gain phase difficulty', () => {
  const G = { W0: 150, Wg: 165, Tweeks: 12 } as const;

  it('uses the HIGHEST weigh-in (better progress for a gain goal)', () => {
    const v3 = D_weightGain({ ...G, Wt: 157, WtPhase: 159 });
    const best = D_weightGain({ ...G, Wt: 159 });
    expect(v3.D).toBeCloseTo(best.D, 6);
  });

  it('a LOWER phase weight is ignored', () => {
    const plain = D_weightGain({ ...G, Wt: 157 });
    const sabotaged = D_weightGain({ ...G, Wt: 157, WtPhase: 151 });
    expect(sabotaged.D).toBeCloseTo(plain.D, 6);
  });

  it('client and server agree', () => {
    const a = D_weightGain({ ...G, Wt: 157, WtPhase: 159 });
    const b = core.D_weightGain({ ...G, Wt: 157, WtPhase: 159 });
    expect(a.D).toBeCloseTo(b.D, 10);
  });
});
