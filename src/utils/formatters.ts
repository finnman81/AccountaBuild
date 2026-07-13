export function friendlyNameFromDisplayName(raw?: string | null, fallbackUid?: string) {
  const t = (raw ?? '').trim();
  if (t) {
    // If the “display name” is actually an email, show a friendlier handle.
    const at = t.indexOf('@');
    if (at > 0) return t.slice(0, at);
    return t;
  }
  if (fallbackUid) return fallbackUid.slice(0, 6);
  return 'User';
}

export function formatHeightInches(inches?: number | null) {
  if (inches == null || !Number.isFinite(inches)) return '—';
  const total = Math.round(inches);
  const ft = Math.floor(total / 12);
  const inch = Math.abs(total % 12);
  return `${ft}'${inch}"`;
}

export function formatWeightLb(lb?: number | null) {
  if (lb == null || !Number.isFinite(lb)) return '—';
  // Keep up to 1 decimal if needed, otherwise show integer.
  const rounded = Math.round(lb * 10) / 10;
  const txt = String(rounded);
  return `${txt} lb`;
}

export function formatMinutesHM(totalMinutes: number) {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export function formatDeltaLb(delta?: number | null) {
  if (delta == null || !Number.isFinite(delta)) return '—';
  // Use symmetric rounding so -1.25 -> -1.3 (JS Math.round would yield -1.2).
  const rounded = (delta >= 0 ? Math.round(delta * 10) : -Math.round(Math.abs(delta) * 10)) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded} lb`;
}

export type Units = 'imperial' | 'metric';

const LB_PER_KG = 2.20462262;

/** Convert a stored-lb weight to kg (rounded to 0.1). Weights are stored in lb. */
export function lbToKg(lb: number): number {
  return Math.round((lb / LB_PER_KG) * 10) / 10;
}

/** Convert a user-entered kg weight back to lb (rounded to 0.1) for storage. */
export function kgToLb(kg: number): number {
  return Math.round(kg * LB_PER_KG * 10) / 10;
}

/**
 * Weight is always STORED in lb (see onboarding's kg->lb conversion at entry) —
 * these only control DISPLAY. Centralizes the lb->kg conversion so every
 * display site (Profile, Progress, chat log cards, onboarding summary, Today
 * checklist) shows a metric user's own preferred unit instead of hardcoded lb.
 */
export function formatWeightForUnits(lb?: number | null, units?: Units | null) {
  if (lb == null || !Number.isFinite(lb)) return '—';
  if (units === 'metric') {
    const kg = Math.round((lb / LB_PER_KG) * 10) / 10;
    return `${kg} kg`;
  }
  return formatWeightLb(lb);
}

export function formatDeltaForUnits(deltaLb?: number | null, units?: Units | null) {
  if (deltaLb == null || !Number.isFinite(deltaLb)) return '—';
  if (units === 'metric') {
    const deltaKg = deltaLb / LB_PER_KG;
    const rounded = (deltaKg >= 0 ? Math.round(deltaKg * 10) : -Math.round(Math.abs(deltaKg) * 10)) / 10;
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded} kg`;
  }
  return formatDeltaLb(deltaLb);
}

export function formatTimeAgo(ms: number | null) {
  if (!ms) return '—';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
