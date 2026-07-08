import { challengeProgress, challengeWeekIds, weekIdForDate, type GroupChallenge } from '../../src/mmr/challenge';
import { buildChallengeStandings } from '../../src/viewmodels/challengeStandings';
import { isoWeekRangeInTz, zonedNoonUtcFromYmd, DEFAULT_TZ } from '../../src/mmr/time';

const base: GroupChallenge = { name: 'Test', startWeekId: '2026-W10', durationWeeks: 4, status: 'active', createdBy: 'u1' };

/** A Date that lands inside a given ISO week (its Monday, noon). */
function dateInWeek(weekId: string): Date {
  return zonedNoonUtcFromYmd(isoWeekRangeInTz(weekId, DEFAULT_TZ).start, DEFAULT_TZ);
}

describe('challenges — week math', () => {
  test('challengeWeekIds spans the right number of consecutive weeks', () => {
    const ids = challengeWeekIds('2026-W10', 4);
    expect(ids).toEqual(['2026-W10', '2026-W11', '2026-W12', '2026-W13']);
  });

  test('weekIdForDate snaps a date to its ISO week', () => {
    const mondayOfW10 = isoWeekRangeInTz('2026-W10', DEFAULT_TZ).start;
    expect(weekIdForDate(mondayOfW10)).toBe('2026-W10');
  });

  test('phase + current week track the calendar', () => {
    expect(challengeProgress(base, dateInWeek('2026-W09')).phase).toBe('upcoming');
    const wk1 = challengeProgress(base, dateInWeek('2026-W10'));
    expect(wk1.phase).toBe('active');
    expect(wk1.week).toBe(1);
    const wk4 = challengeProgress(base, dateInWeek('2026-W13'));
    expect(wk4.week).toBe(4);
    expect(challengeProgress(base, dateInWeek('2026-W14')).phase).toBe('ended');
  });

  test('status "ended" forces the ended phase regardless of date', () => {
    const ended = { ...base, status: 'ended' as const };
    expect(challengeProgress(ended, dateInWeek('2026-W10')).phase).toBe('ended');
  });
});

describe('challenges — standings', () => {
  const week = '2026-W10';
  const d0 = isoWeekRangeInTz(week, DEFAULT_TZ).dates[0];
  const d1 = isoWeekRangeInTz(week, DEFAULT_TZ).dates[1];

  const publicUsers: any = {
    a: { displayName: 'Ann', workoutsPerWeek: 3 },
    b: { displayName: 'Bo', workoutsPerWeek: 3 },
  };
  // Ann hits her 3 workouts; Bo does one.
  const logs: any[] = [
    { uid: 'a', type: 'workout', date: d0 },
    { uid: 'a', type: 'workout', date: d0 },
    { uid: 'a', type: 'workout', date: d1 },
    { uid: 'b', type: 'workout', date: d0 },
  ];

  test('ranks members by compliance vs their own goals', () => {
    const rows = buildChallengeStandings({
      elapsedWeekIds: [week],
      memberUids: ['a', 'b'],
      publicUsers,
      canSee: new Set(['a', 'b']),
      myUid: 'a',
      logs,
    });
    expect(rows[0].uid).toBe('a');
    expect(rows[0].points).toBe(100); // 3/3 workouts
    expect(rows[0].weeksCompleted).toBe(1);
    expect(rows[1].uid).toBe('b');
    expect(rows[1].points).toBe(33); // 1/3
    expect(rows[1].weeksCompleted).toBe(0);
  });

  test('hides members the viewer cannot see', () => {
    const rows = buildChallengeStandings({
      elapsedWeekIds: [week],
      memberUids: ['a', 'b'],
      publicUsers,
      canSee: new Set(), // can't see anyone else
      myUid: 'a',
      logs,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].uid).toBe('a');
  });
});
