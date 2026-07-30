import {
  WEIGHT_BONUS_CAP,
  WEIGHT_CHECKPOINTS,
  WEIGHT_CHECKPOINTS_FROM_WEEK,
  checkpointAward,
  checkpointsActiveForWeek,
  checkpointsReached,
  weightCompletionBonus,
} from '../../src/mmr/difficulty';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('../../functions/mmr-core');

describe('checkpoint gate', () => {
  it('activates W32 — NOT W31, which is already being scored', () => {
    expect(WEIGHT_CHECKPOINTS_FROM_WEEK).toBe('2026-W32');
    expect(checkpointsActiveForWeek('2026-W31')).toBe(false);
    expect(checkpointsActiveForWeek('2026-W32')).toBe(true);
    expect(checkpointsActiveForWeek(null)).toBe(false);
    expect(core.WEIGHT_CHECKPOINTS_FROM_WEEK).toBe(WEIGHT_CHECKPOINTS_FROM_WEEK);
  });

  it('the raised cap rides the SAME gate, so W31 payouts are unchanged', () => {
    const args = { lbs: 31, D_base: 1.45, v3: true };
    expect(weightCompletionBonus({ ...args, uncapped: false })).toBe(100);
    expect(Math.round(weightCompletionBonus({ ...args, uncapped: true }))).toBe(450);
    expect(WEIGHT_BONUS_CAP).toBe(500);
  });

  it('cap catches absurd input; every CURRENT group goal stays under it', () => {
    // fat-fingered 300 -> 150 would otherwise mint 2,250 FP
    expect(weightCompletionBonus({ lbs: 150, D_base: 1.5, v3: true, uncapped: true })).toBe(500);
    // Real goals in BPM today (7-31 lb) all price below the cap.
    for (const lbs of [7, 8, 13, 16, 31]) {
      expect(weightCompletionBonus({ lbs, D_base: 1.45, v3: true, uncapped: true })).toBeLessThan(500);
    }
    // Documented binding point: ~34 lb at high difficulty. Anything larger caps.
    expect(weightCompletionBonus({ lbs: 40, D_base: 1.45, v3: true, uncapped: true })).toBe(500);
  });
});

describe('checkpoint ladder', () => {
  it('shares sum to exactly the whole pot — no FP invented or lost', () => {
    expect(WEIGHT_CHECKPOINTS.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 10);
    const pot = 450;
    const paid = WEIGHT_CHECKPOINTS.reduce((s, c) => s + checkpointAward(pot, c.at), 0);
    expect(paid).toBe(pot);
  });

  it('is back-loaded — finishing is still the biggest single prize', () => {
    const last = WEIGHT_CHECKPOINTS[WEIGHT_CHECKPOINTS.length - 1]!;
    expect(last.at).toBe(1);
    for (const c of WEIGHT_CHECKPOINTS.slice(0, -1)) expect(c.share).toBeLessThan(last.share);
  });

  it('unlocks progressively and never skips a rung', () => {
    expect(checkpointsReached(0)).toEqual([]);
    expect(checkpointsReached(0.09)).toEqual([]);
    expect(checkpointsReached(0.10)).toEqual([0.10]);
    expect(checkpointsReached(0.60)).toEqual([0.10, 0.25, 0.50]);
    expect(checkpointsReached(1)).toEqual([0.10, 0.25, 0.50, 0.75, 1.00]);
  });

  it('is monotonic: more progress can never unlock FEWER rungs', () => {
    let prev = 0;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const n = checkpointsReached(p).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('clamps out-of-range progress (a bad weigh-in cannot over-unlock)', () => {
    expect(checkpointsReached(5)).toEqual([0.10, 0.25, 0.50, 0.75, 1.00]);
    expect(checkpointsReached(-3)).toEqual([]);
  });

  it('client and server agree on every rung and award', () => {
    expect(core.WEIGHT_CHECKPOINTS.map((c: any) => c.at)).toEqual(WEIGHT_CHECKPOINTS.map((c) => c.at));
    for (const p of [0, 0.1, 0.33, 0.75, 1]) {
      expect(core.checkpointsReached(p)).toEqual(checkpointsReached(p));
    }
    for (const c of WEIGHT_CHECKPOINTS) {
      expect(core.checkpointAward(450, c.at)).toBe(checkpointAward(450, c.at));
    }
  });
});

/**
 * The defining property: a rung already paid must never be paid twice, and
 * regression must never claw one back. This is the bug class that cost Watto
 * 100 FP — encoded here so it can't return.
 */
describe('award ledger never double-pays or revokes', () => {
  const pot = 450;
  const delta = (pBest: number, already: number[]) => {
    const reached = checkpointsReached(pBest);
    const fresh = reached.filter((t) => !already.some((a) => Math.abs(a - t) < 1e-6));
    const fp = fresh.reduce((s, t) => s + checkpointAward(pot, t), 0);
    return { fresh, reached, fp };
  };

  it('pays each rung exactly once across a full journey', () => {
    let ledger: number[] = [];
    let total = 0;
    for (const p of [0.05, 0.12, 0.30, 0.30, 0.55, 0.80, 1.0, 1.0]) {
      const d = delta(p, ledger);
      total += d.fp;
      ledger = d.reached;
    }
    expect(total).toBe(pot); // the whole pot, no more
  });

  it('re-running the same progress pays nothing extra', () => {
    const first = delta(0.6, []);
    const again = delta(0.6, first.reached);
    expect(first.fp).toBeGreaterThan(0);
    expect(again.fp).toBe(0);
  });

  it('REGRESSING keeps every rung already earned (no clawback)', () => {
    const climbed = delta(0.8, []);          // unlocked 10/25/50/75
    const fellBack = delta(0.2, climbed.reached);
    expect(fellBack.fp).toBe(0);             // nothing new
    expect(climbed.reached).toContain(0.75); // and nothing taken away
  });

  it('crossing several rungs in one week pays all of them together', () => {
    const d = delta(0.55, []);
    expect(d.fresh).toEqual([0.10, 0.25, 0.50]);
    expect(d.fp).toBe(checkpointAward(pot, 0.10) + checkpointAward(pot, 0.25) + checkpointAward(pot, 0.50));
  });
});
