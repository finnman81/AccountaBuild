/**
 * Weight-goal PACE helpers (pure, no Firebase).
 *
 * People are bad at picking a target date and worse at knowing what it
 * implies: 13 lb in 8 weeks reads fine and is 1.6 lb a week, every week. That
 * goal expires (prod 2026-08-31), and then it keeps scoring at a pace nobody
 * is on. So the UI suggests a PACE and derives the date from it. Pace is also
 * what the scorer uses for difficulty (lbs / Tweeks), so the suggestion and
 * the scoring agree.
 */

export type PaceId = 'steady' | 'standard' | 'aggressive';
export type PaceOption = { id: PaceId; label: string; lbPerWeek: number };

const LOSS: Array<[PaceId, string, number]> = [['steady', 'Steady', 0.5], ['standard', 'Standard', 1], ['aggressive', 'Aggressive', 1.5]];
const GAIN: Array<[PaceId, string, number]> = [['steady', 'Steady', 0.25], ['standard', 'Standard', 0.5], ['aggressive', 'Aggressive', 0.75]];

/** Three paces. Loss paces scale down for lighter people (a pound is more of 130 than of 230). */
export function paceOptions(startLb: number, isGain: boolean): PaceOption[] {
  const scale = isGain || !(startLb > 0) ? 1 : Math.min(1, startLb / 160);
  return (isGain ? GAIN : LOSS).map(([id, label, rate]) => ({
    id,
    label,
    lbPerWeek: Math.max(0.1, Math.round(rate * scale * 10) / 10),
  }));
}

/** Above this the readout turns amber: possible, rarely kept. */
export function isAggressivePace(lbPerWeek: number, isGain: boolean): boolean {
  return lbPerWeek > (isGain ? 1 : 2) + 1e-9;
}

const noon = (ymd: string) => new Date(`${ymd}T12:00:00`);
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Weeks the scorer will see between two dates (mirror of computeTweeks: min 4). */
export function goalWeeks(startYmd: string, endYmd: string): number {
  const days = Math.max(0, Math.round((noon(endYmd).getTime() - noon(startYmd).getTime()) / 86400000));
  return Math.max(4, Math.ceil(days / 7));
}

/**
 * The end date a pace implies: enough whole weeks to cover the pounds (never
 * under 4, the scorer's floor), snapped forward to a SUNDAY so a goal always
 * ends when a scored week does.
 */
export function endDateForPace(startYmd: string, lbs: number, lbPerWeek: number): string {
  const weeks = Math.max(4, Math.ceil(Math.abs(lbs) / Math.max(0.05, lbPerWeek)));
  const d = noon(startYmd);
  d.setDate(d.getDate() + weeks * 7);
  const toSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + toSunday);
  return fmt(d);
}

/** Pounds per week a start/end pair asks for. Null when the inputs aren't usable. */
export function impliedPace(startYmd: string, endYmd: string, lbs: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) return null;
  if (!(Math.abs(lbs) > 0) || endYmd <= startYmd) return null;
  return Math.abs(lbs) / goalWeeks(startYmd, endYmd);
}

const trim = (n: number) => String(Math.round(n * 10) / 10);

/** "13 lb at 1 lb a week. Done by Sun, Dec 20." */
export function paceReadout(lbs: number, lbPerWeek: number, endYmd: string): string {
  const end = noon(endYmd);
  const when = Number.isNaN(end.valueOf())
    ? endYmd
    : end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${trim(Math.abs(lbs))} lb at ${trim(lbPerWeek)} lb a week. Done by ${when}.`;
}
