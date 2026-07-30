import { clamp } from './constants';

export function D_workouts(target: number): number {
  const table: Record<number, number> = {
    1: 0.7,
    2: 0.85,
    3: 1.0,
    4: 1.18,
    5: 1.4,
    6: 1.7,
    7: 1.85,
  };
  return table[Math.round(target)] ?? 1.0;
}

export function D_minutes(targetMinutes: number): number {
  const base = Math.pow(targetMinutes / 150, 0.55);
  return clamp(0.75, 2.0, base);
}

export function D_calDays(targetDays: number): number {
  const table: Record<number, number> = {
    1: 0.75,
    2: 0.82,
    3: 0.9,
    4: 0.98,
    5: 1.08,
    6: 1.22,
    7: 1.4,
  };
  return table[Math.round(targetDays)] ?? 1.0;
}

/**
 * Weight-v2 activates at the start of this ISO week (2026-07-27). Weeks before
 * keep v1 math forever — recomputes never restate closed weeks, and the switch
 * flips itself at Monday 00:00 with no deploy. (Zero-padded ids sort safely.)
 */
export const WEIGHT_V2_FROM_WEEK = '2026-W31';

export function weightV2ActiveForWeek(weekId: string | null | undefined): boolean {
  return typeof weekId === 'string' && weekId >= WEIGHT_V2_FROM_WEEK;
}

/**
 * Weight-v3 (2026-07-27): phase difficulty tracks the BEST progress reached
 * during the week instead of the final weigh-in.
 *
 * Ships in the SAME week as v2 (originally gated a week later for clean
 * attribution). An A/B over real W30 data showed v3's increment on top of v2 is
 * <= +10 FP for anyone and is structurally never negative — it only declines to
 * take points away — so separating the rollouts bought nothing worth a week of
 * the clawback bug.
 *
 * WHY: D_phase is cubic in progress, so a normal 1-2 lb water swing after a
 * good weigh-in re-graded the WHOLE week downward — banked FP visibly went
 * backwards (prod 2026-07-26: Watto hit his goal Saturday at 100% progress,
 * bounced 1.6 lb Sunday, and lost 37 FP he had already earned). Callers pass
 * the week's best weigh-in as WtPhase; the OUTCOME still uses real end-of-week
 * (or v2 average) weight, so this only stops retroactive clawback — it never
 * pays for progress you didn't make.
 */
export const WEIGHT_V3_FROM_WEEK = '2026-W31';

export function weightV3ActiveForWeek(weekId: string | null | undefined): boolean {
  return typeof weekId === 'string' && weekId >= WEIGHT_V3_FROM_WEEK;
}

/**
 * Sanity bound only — NOT a balance lever. Raised from 100 to 500 in W32
 * because 100 was binding for every goal over ~8 lb, flattening a 31 lb cut
 * and a 13 lb one to the identical payout and defeating the whole point of
 * scaling. 500 is far above any realistic goal, so it only catches fat-fingered
 * input (a mistyped 300 -> 150 would otherwise mint 2,250 FP).
 */
export const WEIGHT_BONUS_CAP = 500;
export const WEIGHT_BONUS_PER_LB = 10;

/**
 * Progress checkpoints. The pot is paid out across the journey instead of all
 * at the finish: proximal sub-goals sustain self-efficacy far better than one
 * distant target (Bandura), and for a 31 lb goal the first reward was otherwise
 * ~8 lb and months away.
 *
 * The 10% rung exists specifically for LONG goals — it is also roughly where
 * clinical guidance puts the first medically meaningful loss (5-10% of body
 * weight). Back-loaded on purpose: finishing is still by far the biggest prize.
 */
export const WEIGHT_CHECKPOINTS: ReadonlyArray<{ at: number; share: number }> = [
  { at: 0.10, share: 0.10 },
  { at: 0.25, share: 0.15 },
  { at: 0.50, share: 0.15 },
  { at: 0.75, share: 0.20 },
  { at: 1.00, share: 0.40 },
];

/**
 * The full payout ladder for a pot.
 *
 * Rounds CUMULATIVELY (each rung is the difference between running totals)
 * rather than rounding each share independently — otherwise 0.10/0.15/0.15/
 * 0.20/0.40 of 450 pays out 451 and the pot silently inflates. Caught by the
 * "shares sum to exactly the whole pot" test.
 */
export function checkpointLadder(pot: number): Array<{ at: number; fp: number }> {
  let cum = 0;
  let prevRounded = 0;
  return WEIGHT_CHECKPOINTS.map((c) => {
    cum += c.share;
    const rounded = Math.round(pot * cum);
    const fp = rounded - prevRounded;
    prevRounded = rounded;
    return { at: c.at, fp };
  });
}

/** FP for the rung at `at`, given the full pot. */
export function checkpointAward(pot: number, at: number): number {
  return checkpointLadder(pot).find((r) => Math.abs(r.at - at) < 1e-6)?.fp ?? 0;
}

/**
 * Which checkpoints a given best-ever progress has unlocked.
 * `progress` MUST come from the best weekly AVERAGE, never a single weigh-in —
 * one water-weight morning shouldn't unlock a rung (and v2 already established
 * averages as the honest measure).
 */
export function checkpointsReached(progress: number): number[] {
  const p = clamp(0, 1, progress);
  return WEIGHT_CHECKPOINTS.filter((c) => p >= c.at).map((c) => c.at);
}

/**
 * One-time bonus for FINISHING a weight goal.
 *
 * Pre-v3 this was min(100, 300 * D_base) — but D_base barely moves with goal
 * size (a 1 lb goal scores 1.05, a 20 lb goal 1.20), so 300x always blew
 * through the cap and EVERY completed goal paid the full 100 FP. Harmless
 * while goals were set once; farmable the moment the app started prompting
 * "set a new goal" after each win. v3 scales the payout with the pounds
 * actually committed, so a token 1 lb goal is worth ~11 FP and anything
 * genuinely ambitious still caps out.
 */
export function weightCompletionBonus(params: { lbs: number; D_base: number; v3: boolean; uncapped?: boolean }): number {
  const { lbs, D_base, v3 } = params;
  if (!v3) return Math.min(100, 300 * D_base);
  // The 100 cap survives until checkpoints activate, so W31 is not restated.
  const cap = params.uncapped ? WEIGHT_BONUS_CAP : 100;
  return clamp(0, cap, WEIGHT_BONUS_PER_LB * Math.max(0, lbs) * D_base);
}

/**
 * Checkpoints + the raised cap activate together (2026-08-03). Separate from
 * the v3 gate because v3 already shipped in W31 — reusing it would retroactively
 * change a week that is already being scored.
 */
export const WEIGHT_CHECKPOINTS_FROM_WEEK = '2026-W32';

export function checkpointsActiveForWeek(weekId: string | null | undefined): boolean {
  return typeof weekId === 'string' && weekId >= WEIGHT_CHECKPOINTS_FROM_WEEK;
}

export function D_weightLoss(params: {
  W0: number;
  Wg: number;
  Wt: number;
  Tweeks: number;
  hIn?: number | null;
  bmiBase?: boolean;
  /** v3: lowest weigh-in of the week. Omit (or null) for pre-v3 behaviour. */
  WtPhase?: number | null;
}) {
  const { W0, Wg, Wt } = params;
  const L = W0 - Wg;
  const Tweeks = Math.max(4, params.Tweeks);
  // min() so a supplied WtPhase can only ever REPRESENT better progress than
  // the final weigh-in, never worse.
  // The `!= null` guard is load-bearing: Number(null) is 0, NOT NaN, so an
  // isFinite-only check treats "no phase weight" as 0 lb — i.e. instant 100%
  // progress for everyone. Caught by an A/B dry-run before deploy.
  const hasPhase = params.WtPhase != null && Number.isFinite(Number(params.WtPhase));
  const WtForPhase = hasPhase ? Math.min(Number(params.WtPhase), Wt) : Wt;
  const p = clamp(0, 1, (W0 - WtForPhase) / (L || 1));

  // v2 base (gated by caller via bmiBase): difficulty = fraction of your SPARE
  // weight (above BMI 22 for your height) this goal commits. Same 10 lb rates
  // ~18% harder for a lean cutter than a heavy one (v1 separated them by ~2% —
  // loss/bodyweight through ^0.6 compressed the difference away). Linear on
  // purpose: "you're committing half your spare weight" is explainable. Falls
  // back to v1 when height is missing.
  const hIn = Number(params.hIn);
  const useBmi = params.bmiBase === true && Number.isFinite(hIn) && hIn > 0;
  const D_base = useBmi
    ? 1 + 0.9 * clamp(0, 1, L / Math.max(W0 - (22 * hIn * hIn) / 703, L, 1))
    : 1 + 0.9 * Math.pow(L / W0, 0.6);
  const D_phase = 1 + 1.0 * Math.pow(p, 3.0);

  const lossTargetRaw = L / Tweeks;
  const lossTarget = clamp(0.25, 2.5, lossTargetRaw);
  const D_timeline = clamp(0.9, 1.6, Math.pow(lossTarget / 1.0, 0.35));

  const D = D_base * D_phase * D_timeline;
  return { D, D_base, lossTarget, progress: p };
}

export function D_weightGain(params: {
  W0: number;
  Wg: number;
  Wt: number;
  Tweeks: number;
  /** v3: highest weigh-in of the week (see D_weightLoss). */
  WtPhase?: number | null;
}) {
  const { W0, Wg, Wt } = params;
  const G = Wg - W0;
  const Tweeks = Math.max(4, params.Tweeks);
  // max() — for a gain goal, better progress means a HIGHER weigh-in.
  // `!= null` guard: see the note in D_weightLoss (Number(null) === 0).
  const hasPhase = params.WtPhase != null && Number.isFinite(Number(params.WtPhase));
  const WtForPhase = hasPhase ? Math.max(Number(params.WtPhase), Wt) : Wt;
  const p = clamp(0, 1, (WtForPhase - W0) / (G || 1));

  const D_base = 1 + 0.7 * Math.pow(G / W0, 0.6);
  const D_phase = 1 + 0.7 * Math.pow(p, 2.5);

  const gainTargetRaw = G / Tweeks;
  const gainTarget = clamp(0.1, 1.5, gainTargetRaw);
  const D_timeline = clamp(0.9, 1.5, Math.pow(gainTarget / 0.5, 0.35));

  const D = D_base * D_phase * D_timeline;
  return { D, D_base, gainTarget, progress: p };
}

