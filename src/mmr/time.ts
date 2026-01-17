import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const DEFAULT_TZ = 'America/New_York';

export function yyyyMmDdInTz(date: Date, timeZone: string = DEFAULT_TZ) {
  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd');
}

function isoWeekIdFromUtcNoon(dUtcNoon: Date) {
  // ISO week algorithm using UTC methods (timezone-independent).
  // Weeks start Monday; week 1 contains Jan 4.
  const d = new Date(dUtcNoon.getTime());
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3); // shift to Thursday

  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4, 12, 0, 0));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);

  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// ISO week id: YYYY-WW (e.g. 2026-W03)
// Computed in the provided timezone by formatting the local date and then using ISO-week rules.
export function isoWeekIdInTz(date: Date, timeZone: string = DEFAULT_TZ) {
  // Anchor to noon in the target timezone, then run ISO math in UTC.
  const yyyyMmDd = yyyyMmDdInTz(date, timeZone);
  const noonUtc = fromZonedTime(`${yyyyMmDd}T12:00:00`, timeZone);
  return isoWeekIdFromUtcNoon(noonUtc);
}

export function seasonIdFromDate(date: Date, timeZone: string = DEFAULT_TZ) {
  const yyyyMmDd = yyyyMmDdInTz(date, timeZone);
  const m = Number(yyyyMmDd.slice(5, 7));
  const y = yyyyMmDd.slice(0, 4);
  const q = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
  return `${y}${q}`;
}

export function isoWeekDatesInTz(weekId: string, timeZone: string = DEFAULT_TZ) {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId.trim());
  if (!m) throw new Error('Invalid weekId');
  const isoYear = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(isoYear) || !Number.isFinite(week) || week < 1 || week > 53) throw new Error('Invalid weekId');

  // Find Monday of ISO week 1 for isoYear (UTC math), anchored to noon.
  const jan4 = fromZonedTime(`${isoYear}-01-04T12:00:00`, timeZone); // ISO week 1 contains Jan 4
  const day = (jan4.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - day);

  const mon = new Date(week1Mon);
  mon.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);

  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(mon);
    d.setUTCDate(mon.getUTCDate() + i);
    out.push(yyyyMmDdInTz(d, timeZone));
  }
  return out;
}

export function isoWeekRangeInTz(weekId: string, timeZone: string = DEFAULT_TZ) {
  const dates = isoWeekDatesInTz(weekId, timeZone);
  return { start: dates[0]!, end: dates[dates.length - 1]!, dates };
}

export function nextIsoWeekId(weekId: string, timeZone: string = DEFAULT_TZ) {
  const { start } = isoWeekRangeInTz(weekId, timeZone);
  // Use noon in the target timezone to avoid DST edge cases.
  const startUtc = fromZonedTime(`${start}T12:00:00`, timeZone);
  const next = addDays(startUtc, 7);
  return isoWeekIdInTz(next, timeZone);
}

export function zonedNoonUtcFromYmd(yyyyMmDd: string, timeZone: string = DEFAULT_TZ) {
  // Convert a YYYY-MM-DD that is *meant* to be interpreted in `timeZone`
  // into a stable Date (no DST edge issues).
  return fromZonedTime(`${yyyyMmDd}T12:00:00`, timeZone);
}

