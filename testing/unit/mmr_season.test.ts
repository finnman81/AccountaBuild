/**
 * Season rollover moved server-side 2026-07-22 (functions/mmr-season.js) and
 * the client implementation was deleted — so the spec table below (mmr.txt
 * 9.3/9.4) is asserted directly against the server module, same style as the
 * mmr-core parity suite.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const season = require('../../functions/mmr-season');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require('../../functions/mmr-core');

describe('season soft-reset mapping (mmr.txt 9.3/9.4)', () => {
  it.each([
    ['Iron', 'Iron'],
    ['Bronze', 'Bronze'],
    ['Silver', 'Bronze'],
    ['Gold', 'Silver'],
    ['Platinum', 'Silver'],
    ['Diamond', 'Gold'],
    ['Master', 'Platinum'],
    ['Challenger', 'Diamond'],
  ])('%s resets to %s', (src, target) => {
    expect(season.resetTargetTierFromSpec(src)).toBe(target);
  });

  it('preserves the division index when the source has one', () => {
    expect(season.resetTargetDivisionFromSpec('Gold', 3)).toBe(3);
    expect(season.resetTargetDivisionFromSpec('Silver', 1)).toBe(1);
  });

  it('divisionless tiers use the spec defaults', () => {
    expect(season.resetTargetDivisionFromSpec('Master', null)).toBe(2); // → Platinum II
    expect(season.resetTargetDivisionFromSpec('Challenger', null)).toBe(1); // → Diamond I
  });

  it('every reset target resolves to a real band (no dead mapping)', () => {
    for (const b of core.BANDS) {
      const tier = season.resetTargetTierFromSpec(b.tier);
      const div = season.resetTargetDivisionFromSpec(b.tier, b.division ?? null);
      const target = core.BANDS.find((x: any) => x.tier === tier && (x.division ?? null) === div)
        ?? core.BANDS.find((x: any) => x.tier === tier);
      expect(target).toBeTruthy();
      // A soft reset must never move anyone UP.
      expect(core.bandOrderIndex(target)).toBeLessThanOrEqual(core.bandOrderIndex(b));
    }
  });
});
