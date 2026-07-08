import { isoWeekIdInTz, isoWeekRangeInTz, nextIsoWeekId, prevIsoWeekId, seasonIdFromDate, DEFAULT_TZ } from '../../src/mmr/time';

describe('mmr/time', () => {
  test('seasonIdFromDate returns correct quarter', () => {
    expect(seasonIdFromDate(new Date('2026-01-15T12:00:00Z'), DEFAULT_TZ)).toBe('2026Q1');
    expect(seasonIdFromDate(new Date('2026-04-15T12:00:00Z'), DEFAULT_TZ)).toBe('2026Q2');
    expect(seasonIdFromDate(new Date('2026-08-15T12:00:00Z'), DEFAULT_TZ)).toBe('2026Q3');
    expect(seasonIdFromDate(new Date('2026-11-15T12:00:00Z'), DEFAULT_TZ)).toBe('2026Q4');
  });

  test('isoWeekIdInTz returns YYYY-WNN format', () => {
    const id = isoWeekIdInTz(new Date('2026-02-15T12:00:00Z'), DEFAULT_TZ);
    expect(id).toMatch(/^\d{4}-W\d{2}$/);
  });

  test('isoWeekRangeInTz returns 7 dates and ordered start/end', () => {
    const id = isoWeekIdInTz(new Date('2026-02-15T12:00:00Z'), DEFAULT_TZ);
    const range = isoWeekRangeInTz(id, DEFAULT_TZ);
    expect(range.dates).toHaveLength(7);
    expect(range.start).toBe(range.dates[0]);
    expect(range.end).toBe(range.dates[6]);
    // Dates are YYYY-MM-DD strings; lexical order matches chronological order.
    expect(range.start <= range.end).toBe(true);
  });

  test('nextIsoWeekId advances by one week', () => {
    const id = isoWeekIdInTz(new Date('2026-02-15T12:00:00Z'), DEFAULT_TZ);
    const next = nextIsoWeekId(id, DEFAULT_TZ);
    expect(next).toMatch(/^\d{4}-W\d{2}$/);
    expect(next).not.toBe(id);
  });

  test('prevIsoWeekId is the inverse of nextIsoWeekId', () => {
    const id = isoWeekIdInTz(new Date('2026-02-15T12:00:00Z'), DEFAULT_TZ);
    const prev = prevIsoWeekId(id, DEFAULT_TZ);
    expect(prev).toMatch(/^\d{4}-W\d{2}$/);
    expect(prev).not.toBe(id);
    expect(nextIsoWeekId(prev, DEFAULT_TZ)).toBe(id);
  });
});

