import { calorieDaysHitFromTotals } from '../../src/mmr/adherence';

describe('mmr/adherence · calorieDaysHitFromTotals', () => {
  it('with no budget, counts every day that has calories logged', () => {
    expect(calorieDaysHitFromTotals({ '2026-01-01': 1500, '2026-01-02': 0, '2026-01-03': 2600 }, null)).toBe(2);
  });

  it('with a budget, counts only days at or under the target (regression: no longer counts any logged day)', () => {
    // 1500 <= 2000 hit, 2500 > 2000 miss, 2000 == 2000 hit.
    expect(
      calorieDaysHitFromTotals({ '2026-01-01': 1500, '2026-01-02': 2500, '2026-01-03': 2000 }, 2000),
    ).toBe(2);
  });

  it('counts a day exactly at the budget as a hit', () => {
    expect(calorieDaysHitFromTotals({ d: 2000 }, 2000)).toBe(1);
  });

  it('ignores days with zero or no calories', () => {
    expect(calorieDaysHitFromTotals({ a: 0, b: 1800 }, 2000)).toBe(1);
    expect(calorieDaysHitFromTotals({}, 2000)).toBe(0);
  });

  it('treats a non-positive budget as "no budget" (any logged day counts)', () => {
    expect(calorieDaysHitFromTotals({ a: 5000, b: 100 }, 0)).toBe(2);
  });
});
