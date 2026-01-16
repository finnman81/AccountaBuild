import { applyRankWithDemotionRules, bandForMMR, demotionThresholdForBand, mpForMMR, BANDS } from '../../src/mmr/ranks';

describe('mmr/ranks', () => {
  test('bandForMMR lands in expected tiers', () => {
    expect(bandForMMR(0).tier).toBe('Iron');
    expect(bandForMMR(1000).tier).toBe('Bronze');
    expect(bandForMMR(1800).tier).toBe('Silver');
    expect(bandForMMR(2600).tier).toBe('Gold');
    expect(bandForMMR(3500).tier).toBe('Platinum');
    expect(bandForMMR(4500).tier).toBe('Diamond');
    expect(bandForMMR(5800).tier).toBe('Master');
    expect(bandForMMR(7000).tier).toBe('Challenger');
  });

  test('mpForMMR is 0 for non-division tiers', () => {
    const master = BANDS.find((b) => b.tier === 'Master')!;
    expect(mpForMMR(6000, master)).toBe(0);
  });

  test('demotionThreshold uses larger buffer for tier boundary', () => {
    const gold4 = BANDS.find((b) => b.tier === 'Gold' && b.division === 4)!; // tier boundary to Silver
    const gold3 = BANDS.find((b) => b.tier === 'Gold' && b.division === 3)!; // within-tier boundary
    const t4 = demotionThresholdForBand(gold4);
    const t3 = demotionThresholdForBand(gold3);
    // Gold IV threshold should be lower by tier buffer vs division buffer.
    expect(t4).toBeLessThan(t3);
  });

  test('tier demotion shield blocks tier demotion', () => {
    const gold4 = BANDS.find((b) => b.tier === 'Gold' && b.division === 4)!;
    const demoteMmr = demotionThresholdForBand(gold4) - 10; // definitely below
    const out = applyRankWithDemotionRules({ oldBand: gold4, newMMR: demoteMmr, tierShieldWeeksRemaining: 2 });
    // Should stay in Gold tier floor (Gold IV).
    expect(out.band.tier).toBe('Gold');
    expect(out.band.division).toBe(4);
  });

  test('hysteresis prevents demotion until threshold crossed', () => {
    const silver2 = BANDS.find((b) => b.tier === 'Silver' && b.division === 2)!;
    const threshold = demotionThresholdForBand(silver2);
    const justAbove = threshold + 1;
    const out = applyRankWithDemotionRules({ oldBand: silver2, newMMR: justAbove, tierShieldWeeksRemaining: 0 });
    expect(out.band.tier).toBe('Silver');
    expect(out.band.division).toBe(2);
  });
});

