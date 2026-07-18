import { calorieDaysHitFromTotals } from '../../src/mmr/adherence';

/**
 * Band rule (2026-07-18): two systems in one — logging habit + diet adherence.
 * Any logged day = 0.5 (habit credit, streak-safe); FULL credit needs the band:
 * cut/maintenance 75%–120% of budget, bulk >= budget. No budget: logged = full.
 */
describe('mmr/adherence · calorieDaysHitFromTotals', () => {
  it('with no budget, counts every day that has calories logged as full', () => {
    expect(calorieDaysHitFromTotals({ '2026-01-01': 1500, '2026-01-02': 0, '2026-01-03': 2600 }, null)).toBe(2);
  });

  it('cut: in-band days are full, out-of-band logged days earn habit credit (0.5)', () => {
    // Budget 2000 → band [1500, 2400]. 1500 full, 2500 over-band 0.5, 2000 full.
    expect(calorieDaysHitFromTotals({ '2026-01-01': 1500, '2026-01-02': 2500, '2026-01-03': 2000 }, 2000)).toBe(2.5);
  });

  it('under-logging no longer earns full credit (the 1000-of-2000 half-day)', () => {
    expect(calorieDaysHitFromTotals({ a: 1000 }, 2000, 'cut')).toBe(0.5);
    // 74.9% just misses the band; 75% exactly makes it.
    expect(calorieDaysHitFromTotals({ a: 1499 }, 2000, 'cut')).toBe(0.5);
    expect(calorieDaysHitFromTotals({ a: 1500 }, 2000, 'cut')).toBe(1);
  });

  it('slightly over budget still earns full credit (fully logged beats half-logged)', () => {
    expect(calorieDaysHitFromTotals({ a: 2200 }, 2000, 'cut')).toBe(1); // 110%
    expect(calorieDaysHitFromTotals({ a: 2400 }, 2000, 'cut')).toBe(1); // 120% edge
    expect(calorieDaysHitFromTotals({ a: 2401 }, 2000, 'cut')).toBe(0.5); // past the band
  });

  it('counts a day exactly at the budget as a full hit', () => {
    expect(calorieDaysHitFromTotals({ d: 2000 }, 2000)).toBe(1);
  });

  it('ignores days with zero or no calories entirely (no habit credit for nothing)', () => {
    expect(calorieDaysHitFromTotals({ a: 0, b: 1800 }, 2000)).toBe(1);
    expect(calorieDaysHitFromTotals({}, 2000)).toBe(0);
  });

  it('treats a non-positive budget as "no budget" (any logged day counts fully)', () => {
    expect(calorieDaysHitFromTotals({ a: 5000, b: 100 }, 0)).toBe(2);
  });

  it('BULK: at-or-above budget is full, under-budget logged days get habit credit', () => {
    // 2800 budget: 3000 full, 2800 full, 2200 habit 0.5 (no upper band for bulk).
    expect(calorieDaysHitFromTotals({ a: 3000, b: 2800, c: 2200 }, 2800, 'bulk')).toBe(2.5);
  });

  it('cut and maintenance share the band', () => {
    expect(calorieDaysHitFromTotals({ a: 1500, b: 2500 }, 2000, 'cut')).toBe(1.5);
    expect(calorieDaysHitFromTotals({ a: 1500, b: 2500 }, 2000, 'maintenance')).toBe(1.5);
  });
});
