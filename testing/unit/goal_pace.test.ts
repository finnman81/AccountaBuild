import { endDateForPace, goalWeeks, impliedPace, isAggressivePace, paceOptions, paceReadout } from '../../src/mmr/goalPace';

describe('goal pace', () => {
  it('offers three loss paces, scaled down for lighter people', () => {
    expect(paceOptions(188, false).map((o) => o.lbPerWeek)).toEqual([0.5, 1, 1.5]);
    expect(paceOptions(128, false).map((o) => o.lbPerWeek)).toEqual([0.4, 0.8, 1.2]);
    expect(paceOptions(150, true).map((o) => o.lbPerWeek)).toEqual([0.25, 0.5, 0.75].map((n) => Math.round(n * 10) / 10));
  });
  it('end date covers the pounds and lands on a Sunday', () => {
    const end = endDateForPace('2026-09-17', 11, 1); // Thu + 11 weeks -> Thu Dec 3 -> Sun Dec 6
    expect(end).toBe('2026-12-06');
    expect(new Date(`${end}T12:00:00`).getDay()).toBe(0);
  });
  it('never suggests under the 4-week floor the scorer uses', () => {
    expect(goalWeeks('2026-09-17', endDateForPace('2026-09-17', 2, 1.5))).toBeGreaterThanOrEqual(4);
  });
  it('implied pace matches what the scorer will see', () => {
    expect(impliedPace('2026-07-06', '2026-08-31', 13)).toBeCloseTo(13 / 8, 5); // the goal that expired
    expect(impliedPace('2026-09-17', '2026-09-10', 13)).toBeNull();
    expect(impliedPace('2026-09-17', 'soon', 13)).toBeNull();
  });
  it('flags hard paces', () => {
    expect(isAggressivePace(1.6, false)).toBe(false);
    expect(isAggressivePace(2.1, false)).toBe(true);
    expect(isAggressivePace(1.1, true)).toBe(true);
  });
  it('readout is plain words', () => {
    expect(paceReadout(13, 1, '2026-12-20')).toBe('13 lb at 1 lb a week. Done by Sun, Dec 20.');
  });
});
