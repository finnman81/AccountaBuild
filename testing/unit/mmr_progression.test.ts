import { nextShieldWeeks, lowerTierProgressBonus, LOWER_TIER_WEEK_BONUS } from '../../src/mmr/progression';

describe('mmr/progression · nextShieldWeeks', () => {
  it('grants a 2-week shield on tier promotion', () => {
    expect(nextShieldWeeks({ shieldBefore: 0, tierPromoted: true, completedWeek: true, consecutiveMissedWeeks: 0 })).toBe(2);
  });

  it('does not tick down on the promotion week itself', () => {
    // completedWeek is true on a promotion, but the fresh 2 should not be decremented.
    expect(nextShieldWeeks({ shieldBefore: 1, tierPromoted: true, completedWeek: true, consecutiveMissedWeeks: 0 })).toBe(2);
  });

  it('ticks down by one on a completed week without promotion', () => {
    expect(nextShieldWeeks({ shieldBefore: 2, tierPromoted: false, completedWeek: true, consecutiveMissedWeeks: 0 })).toBe(1);
  });

  it('never goes below zero when ticking down', () => {
    expect(nextShieldWeeks({ shieldBefore: 0, tierPromoted: false, completedWeek: true, consecutiveMissedWeeks: 0 })).toBe(0);
  });

  it('holds the shield on a non-completed, non-promotion week', () => {
    expect(nextShieldWeeks({ shieldBefore: 2, tierPromoted: false, completedWeek: false, consecutiveMissedWeeks: 1 })).toBe(2);
  });

  it('breaks the shield after 2 consecutive missed weeks', () => {
    expect(nextShieldWeeks({ shieldBefore: 2, tierPromoted: false, completedWeek: false, consecutiveMissedWeeks: 2 })).toBe(0);
  });

  it('does not default to a high "testing" value (regression: was 5)', () => {
    // A brand-new user (shieldBefore 0) with a quiet week keeps 0, not 5.
    expect(nextShieldWeeks({ shieldBefore: 0, tierPromoted: false, completedWeek: false, consecutiveMissedWeeks: 0 })).toBe(0);
  });
});

describe('mmr/progression · lowerTierProgressBonus', () => {
  it('awards a flat bonus for a completed week in the lower tiers', () => {
    for (const tier of ['Iron', 'Bronze', 'Silver', 'Gold'] as const) {
      expect(lowerTierProgressBonus(tier, true)).toBe(LOWER_TIER_WEEK_BONUS);
    }
  });

  it('awards nothing in Platinum and above', () => {
    for (const tier of ['Platinum', 'Diamond', 'Master', 'Challenger'] as const) {
      expect(lowerTierProgressBonus(tier, true)).toBe(0);
    }
  });

  it('awards nothing when the week was not completed', () => {
    expect(lowerTierProgressBonus('Iron', false)).toBe(0);
    expect(lowerTierProgressBonus('Gold', false)).toBe(0);
  });

  it('is a modest nudge, not a full division (regression: was 200-250)', () => {
    expect(LOWER_TIER_WEEK_BONUS).toBeLessThanOrEqual(50);
  });
});
