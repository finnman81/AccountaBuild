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

export function D_weightLoss(params: { W0: number; Wg: number; Wt: number; Tweeks: number }) {
  const { W0, Wg, Wt } = params;
  const L = W0 - Wg;
  const Tweeks = Math.max(4, params.Tweeks);
  const p = clamp(0, 1, (W0 - Wt) / (L || 1));

  const D_base = 1 + 0.9 * Math.pow(L / W0, 0.6);
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

