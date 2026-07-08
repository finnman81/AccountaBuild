import { buildTodayChecklist, computeStreakDays, computeGoalStreak, buildTeamToday, buildLeaderboardPreview } from '../../src/viewmodels/today';
import type { GroupLog, LogType } from '../../src/services/logs';
import type { PublicUser } from '../../src/services/publicUsers';

const TODAY = '2026-07-01';
const YDAY = '2026-06-30';
const D2 = '2026-06-29';

function log(uid: string, type: LogType, date: string, payload: Record<string, unknown> = {}, tsMs: number | null = null): GroupLog {
  return { id: `${uid}-${type}-${date}-${Math.random()}`, uid, type, date, ts: tsMs != null ? ({ toMillis: () => tsMs } as any) : undefined, payload };
}

function pub(uid: string, extra: Partial<PublicUser> = {}): PublicUser {
  return {
    uid,
    displayName: uid,
    photoURL: null,
    height: null,
    age: null,
    weightCurrent: null,
    weightGoal: null,
    ...extra,
  };
}

describe('today viewmodel · buildTodayChecklist', () => {
  it('marks only my logs for today, and reports done count', () => {
    const logs = [
      log('me', 'calories', TODAY, { calories: 1840 }, 1000),
      log('me', 'workout', TODAY, { workoutType: 'weightLifting', durationMinutes: 52 }, 2000),
      log('me', 'weight', YDAY, { weight: 182 }), // wrong day
      log('other', 'weight', TODAY, { weight: 200 }), // other user
    ];
    const c = buildTodayChecklist({ logs, myUid: 'me', today: TODAY, dailyCalorieGoal: 2200 });
    expect(c.doneCount).toBe(2);
    expect(c.total).toBe(3);
    const byType = Object.fromEntries(c.items.map((i) => [i.type, i]));
    expect(byType.calories.logged).toBe(true);
    expect(byType.calories.valueLine).toContain('kcal');
    expect(byType.workout.logged).toBe(true);
    expect(byType.workout.valueLine).toContain('52m');
    expect(byType.weight.logged).toBe(false);
    expect(byType.weight.valueLine).toBe('Not logged yet');
  });
});

describe('today viewmodel · computeStreakDays', () => {
  it('counts consecutive days back from today and stops at a gap', () => {
    const workouts: LogType = 'workout';
    const logs = [
      log('a', workouts, TODAY),
      log('a', workouts, YDAY),
      log('a', workouts, D2),
      log('b', workouts, YDAY), // b did not log today -> streak 0
    ];
    const streaks = computeStreakDays(logs, new Set<LogType>(['workout']), TODAY);
    expect(streaks.a).toBe(3);
    expect(streaks.b).toBe(0);
  });

  it('respects the allowed-types filter', () => {
    const logs = [log('a', 'calories', TODAY)];
    expect(computeStreakDays(logs, new Set<LogType>(['workout']), TODAY).a ?? 0).toBe(0);
    expect(computeStreakDays(logs, new Set<LogType>(['calories']), TODAY).a).toBe(1);
  });
});

describe('today viewmodel · buildTeamToday', () => {
  const members = ['me', 'a', 'b', 'hidden'];
  const publicUsers = { me: pub('me'), a: pub('a'), b: pub('b'), hidden: pub('hidden') };
  const canSee = new Set(['a', 'b']); // not 'hidden'

  it('filters to visible members, flags logged/streak-leader, and at-risk past cutoff', () => {
    const logs = [
      log('me', 'workout', TODAY),
      log('a', 'workout', TODAY),
      log('a', 'workout', YDAY),
      log('a', 'workout', D2), // a: 3-day streak, logged today
      // b: no logs today
    ];
    const team = buildTeamToday({ memberUids: members, publicUsers, canSee, myUid: 'me', logs, today: TODAY, streakRule: 'workout', pastCutoff: true });

    expect(team.total).toBe(3); // hidden excluded
    expect(team.members.some((m) => m.uid === 'hidden')).toBe(false);
    expect(team.loggedCount).toBe(2); // me + a

    const a = team.members.find((m) => m.uid === 'a')!;
    expect(a.streakLeader).toBe(true);
    expect(a.streakDays).toBe(3);

    const b = team.members.find((m) => m.uid === 'b')!;
    expect(b.status).toBe('notLogged');
    expect(b.atRisk).toBe(true);
  });

  it('does not flag at-risk before the cutoff', () => {
    const team = buildTeamToday({ memberUids: members, publicUsers, canSee, myUid: 'me', logs: [], today: TODAY, streakRule: 'workout', pastCutoff: false });
    expect(team.members.every((m) => !m.atRisk)).toBe(true);
  });
});

describe('today viewmodel · buildLeaderboardPreview', () => {
  it('sorts visible members by MMR desc and limits', () => {
    const members = ['me', 'a', 'b', 'hidden'];
    const publicUsers = {
      me: pub('me', { mmrPublic: 1654, rankTierPublic: 'Gold', rankDivisionPublic: 2 }),
      a: pub('a', { mmrPublic: 1872, rankTierPublic: 'Gold', rankDivisionPublic: 1 }),
      b: pub('b', { mmrPublic: 1601, rankTierPublic: 'Silver', rankDivisionPublic: 1 }),
      hidden: pub('hidden', { mmrPublic: 9999 }),
    };
    const rows = buildLeaderboardPreview({ memberUids: members, publicUsers, canSee: new Set(['a', 'b']), myUid: 'me', limit: 3 });
    expect(rows.map((r) => r.uid)).toEqual(['a', 'me', 'b']); // hidden excluded, sorted desc
    expect(rows[0].rank).toBe(1);
    expect(rows.find((r) => r.uid === 'me')!.isMe).toBe(true);
    expect(rows.find((r) => r.uid === 'a')!.tier).toBe('Gold');
  });
});

describe('computeGoalStreak (pace-aware)', () => {
  // Calendar anchors (self-checked): 2026-07-06 is a Monday.
  const MON = '2026-07-06';
  const TUE = '2026-07-07';
  const WED = '2026-07-08';
  const SAT = '2026-07-11';

  test('sanity: 2026-07-06 is Monday', () => {
    expect(new Date(`${MON}T00:00:00`).getDay()).toBe(1);
  });

  test('missing a mid-week day does NOT break the streak while the weekly goal is still reachable', () => {
    // Target 5 workouts/week; 2 done (Mon+Tue), none Wed. Today = Wed.
    const logs = [log('a', 'workout', MON), log('a', 'workout', TUE)];
    const s = computeGoalStreak({ logs, uid: 'a', today: WED, streakRule: 'workout', targets: { workout: 5, calories: 0, weight: 0 } });
    // Wed/Tue/Mon are all still on-pace; the prior (empty) week's Sunday breaks it.
    expect(s).toBe(3);
  });

  test('falling behind (goal no longer reachable) breaks the streak', () => {
    // Target 5; only 2 done by Saturday -> at most 3 possible -> behind.
    const logs = [log('a', 'workout', MON), log('a', 'workout', TUE)];
    const s = computeGoalStreak({ logs, uid: 'a', today: SAT, streakRule: 'workout', targets: { workout: 5, calories: 0, weight: 0 } });
    expect(s).toBe(0);
  });

  test('no weekly targets falls back to consecutive logged days', () => {
    const logs = [log('a', 'workout', WED), log('a', 'workout', TUE)];
    const s = computeGoalStreak({ logs, uid: 'a', today: WED, streakRule: 'workout', targets: { workout: 0, calories: 0, weight: 0 } });
    expect(s).toBe(2);
  });
});
