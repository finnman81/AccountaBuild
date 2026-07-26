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

export const WEIGHT_BONUS_CAP = 100;
export const WEIGHT_BONUS_PER_LB = 10;

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
export function weightCompletionBonus(params: { lbs: number; D_base: number; v3: boolean }): number {
  const { lbs, D_base, v3 } = params;
  if (!v3) return Math.min(WEIGHT_BONUS_CAP, 300 * D_base);
  return clamp(0, WEIGHT_BONUS_CAP, WEIGHT_BONUS_PER_LB * Math.max(0, lbs) * D_base);
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

