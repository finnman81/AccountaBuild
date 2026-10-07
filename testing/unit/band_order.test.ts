import { bandForMMR, bandOrderIndex } from '../../src/mmr/ranks';

describe('bandOrderIndex', () => {
  it('ranks a bare {tier, division} the same as the full band', () => {
    expect(bandOrderIndex({ tier: 'Diamond', division: 4 })).toBe(bandOrderIndex(bandForMMR(4600)));
  });

  it('puts Diamond IV above Platinum I (the "Slipping to" bug)', () => {
    expect(bandOrderIndex({ tier: 'Diamond', division: 4 })).toBeGreaterThan(bandOrderIndex(bandForMMR(4450)));
  });

  it('handles division-less tiers with null or missing division', () => {
    expect(bandOrderIndex({ tier: 'Master', division: null as any })).toBe(bandOrderIndex({ tier: 'Master' }));
    expect(bandOrderIndex({ tier: 'Master' })).toBeGreaterThan(bandOrderIndex({ tier: 'Diamond', division: 1 }));
  });
});
