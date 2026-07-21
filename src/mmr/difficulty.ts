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

export function D_weightLoss(params: { W0: number; Wg: number; Wt: number; Tweeks: number; hIn?: number | null; bmiBase?: boolean }) {
  const { W0, Wg, Wt } = params;
  const L = W0 - Wg;
  const Tweeks = Math.max(4, params.Tweeks);
  const p = clamp(0, 1, (W0 - Wt) / (L || 1));

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

export function D_weightGain(params: { W0: number; Wg: number; Wt: number; Tweeks: number }) {
  const { W0, Wg, Wt } = params;
  const G = Wg - W0;
  const Tweeks = Math.max(4, params.Tweeks);
  const p = clamp(0, 1, (Wt - W0) / (G || 1));

  const D_base = 1 + 0.7 * Math.pow(G / W0, 0.6);
  const D_phase = 1 + 0.7 * Math.pow(p, 2.5);

  const gainTargetRaw = G / Tweeks;
  const gainTarget = clamp(0.1, 1.5, gainTargetRaw);
  const D_timeline = clamp(0.9, 1.5, Math.pow(gainTarget / 0.5, 0.35));

  const D = D_base * D_phase * D_timeline;
  return { D, D_base, gainTarget, progress: p };
}

