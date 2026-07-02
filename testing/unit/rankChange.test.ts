import { detectRankChange, rankOrdinal } from '../../src/viewmodels/rankChange';

describe('rankChange', () => {
  it('detects a division-up promotion within a tier (Silver IV → Silver III)', () => {
    expect(detectRankChange({ tier: 'Silver', division: 4 }, { tier: 'Silver', division: 3 })).toBe('promotion');
  });

  it('detects a tier-up promotion (Silver I → Gold IV)', () => {
    expect(detectRankChange({ tier: 'Silver', division: 1 }, { tier: 'Gold', division: 4 })).toBe('promotion');
  });

  it('detects a demotion (Gold IV → Silver I)', () => {
    expect(detectRankChange({ tier: 'Gold', division: 4 }, { tier: 'Silver', division: 1 })).toBe('demotion');
  });

  it('returns null when the rank is unchanged', () => {
    expect(detectRankChange({ tier: 'Silver', division: 2 }, { tier: 'Silver', division: 2 })).toBeNull();
  });

  it('returns null when either side is missing', () => {
    expect(detectRankChange(null, { tier: 'Silver', division: 2 })).toBeNull();
    expect(detectRankChange({ tier: 'Silver', division: 2 }, null)).toBeNull();
  });

  it('orders IV below I within a tier and tiers above each other', () => {
    expect(rankOrdinal({ tier: 'Silver', division: 1 })).toBeGreaterThan(rankOrdinal({ tier: 'Silver', division: 4 }));
    expect(rankOrdinal({ tier: 'Gold', division: 4 })).toBeGreaterThan(rankOrdinal({ tier: 'Silver', division: 1 }));
  });
});
