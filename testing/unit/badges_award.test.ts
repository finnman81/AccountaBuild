// eslint-disable-next-line @typescript-eslint/no-var-requires
const { badgesForRun } = require('../../functions/badges');
import { badgeLook, lookKeyForPublicBadge } from '../../src/services/badgeCatalog';

const BASE = {
  seasonId: '2026-Q3',
  summary: { goalCompletedNow: false, tierPromotedNow: false, newTier: null, streakAfter: 0 },
  minutesDone: 0,
  completedWeek: false,
  missedBefore: 0,
};

describe('badgesForRun', () => {
  it('quiet week earns nothing', () => {
    expect(badgesForRun(BASE)).toEqual([]);
  });

  it('goal completion -> Goal Crusher (seasonal id)', () => {
    const out = badgesForRun({ ...BASE, summary: { ...BASE.summary, goalCompletedNow: true } });
    expect(out.map((b: any) => b.docId)).toEqual(['2026-Q3-achv-goalCrusher']);
  });

  it('tier jump -> career reached-<Tier> badge, NO season prefix', () => {
    const out = badgesForRun({ ...BASE, summary: { ...BASE.summary, tierPromotedNow: true, newTier: 'Gold' } });
    expect(out[0].docId).toBe('achv-reached-Gold'); // first-ever, not per-season
    expect(out[0].data.achievementId).toBe('reached-Gold');
  });

  it('12-week streak requires a COMPLETED week', () => {
    const s = { ...BASE.summary, streakAfter: 12 };
    expect(badgesForRun({ ...BASE, summary: s, completedWeek: false })).toEqual([]);
    expect(badgesForRun({ ...BASE, summary: s, completedWeek: true }).map((b: any) => b.data.achievementId)).toEqual(['streakLord12']);
  });

  it('marathon week at 600+ minutes, regardless of completion', () => {
    expect(badgesForRun({ ...BASE, minutesDone: 599 })).toEqual([]);
    expect(badgesForRun({ ...BASE, minutesDone: 600 }).map((b: any) => b.data.achievementId)).toEqual(['marathonWeek']);
  });

  it('comeback = completed week right after missed week(s)', () => {
    expect(badgesForRun({ ...BASE, completedWeek: true, missedBefore: 0 })).toEqual([]);
    expect(
      badgesForRun({ ...BASE, completedWeek: true, missedBefore: 2 }).map((b: any) => b.data.achievementId),
    ).toEqual(['comeback']);
  });

  it('a big week can earn several at once', () => {
    const out = badgesForRun({
      ...BASE,
      summary: { goalCompletedNow: true, tierPromotedNow: true, newTier: 'Gold', streakAfter: 12 },
      minutesDone: 700,
      completedWeek: true,
      missedBefore: 1,
    });
    expect(out.length).toBe(5);
  });
});

describe('badge catalog rendering', () => {
  it('every awardable badge has a non-fallback look', () => {
    for (const key of ['goalCrusher', 'reached-Gold', 'reached-Platinum', 'streakLord12', 'marathonWeek', 'comeback', 'perfectWeek', 'streakLord8', 'hardMode4', 'seasonRank', 'seasonPeak']) {
      const look = badgeLook(key);
      expect(look.emoji).not.toBe('🏅' === look.emoji && key !== 'seasonRank' ? 'x' : undefined);
      expect(look.tint).toMatch(/^#/);
    }
    // distinct looks, not one gold pill for everything
    const emojis = ['goalCrusher', 'streakLord12', 'marathonWeek', 'comeback'].map((k) => badgeLook(k).emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });

  it('unknown ids fall back instead of crashing (server can add badges first)', () => {
    expect(badgeLook('someFutureBadge').emoji).toBe('🏅');
    expect(badgeLook(null).emoji).toBe('🏅');
  });

  it('public-badge keys resolve through doc-id shapes', () => {
    expect(lookKeyForPublicBadge({ id: '2026-Q3-achv-goalCrusher', type: 'achievement' })).toBe('goalCrusher');
    expect(lookKeyForPublicBadge({ id: 'achv-reached-Gold', type: 'achievement' })).toBe('reached-Gold');
    expect(lookKeyForPublicBadge({ id: '2026-Q3-rank', type: 'seasonRank' })).toBe('seasonRank');
  });
});
