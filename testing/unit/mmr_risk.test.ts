import { demotionRisk } from '../../src/mmr/risk';

describe('mmr/risk', () => {
  test('missedLastWeek triggers danger', () => {
    const r = demotionRisk({ mmr: 3000, consecutiveMissedWeeks: 0, tierShieldWeeksRemaining: 0, missedLastWeek: true });
    expect(r.level).toBe('danger');
  });

  test('consecutiveMissedWeeks triggers watch/danger', () => {
    const r1 = demotionRisk({ mmr: 3000, consecutiveMissedWeeks: 1, tierShieldWeeksRemaining: 0, missedLastWeek: false });
    expect(r1.level).toBe('watch');
    const r2 = demotionRisk({ mmr: 3000, consecutiveMissedWeeks: 2, tierShieldWeeksRemaining: 0, missedLastWeek: false });
    expect(r2.level).toBe('danger');
  });

  test('stable mmr far from threshold returns none', () => {
    const r = demotionRisk({ mmr: 3400, consecutiveMissedWeeks: 0, tierShieldWeeksRemaining: 0, missedLastWeek: false });
    expect(r.level).toBe('none');
  });
});

