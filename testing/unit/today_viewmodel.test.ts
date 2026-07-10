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

  it('gives equal MMR the same rank (standard competition ranking) and flags ties', () => {
    // a and b tied at 1800; c distinct behind them -> ranks should be 1, 1, 3 (not 1, 2, 3).
    const members = ['a', 'b', 'c'];
    const publicUsers = {
      a: pub('a', { mmrPublic: 1800 }),
      b: pub('b', { mmrPublic: 1800 }),
      c: pub('c', { mmrPublic: 1500 }),
    };
    const rows = buildLeaderboardPreview({ memberUids: members, publicUsers, canSee: new Set(members), myUid: 'a', limit: 3 });
    const byUid = Object.fromEntries(rows.map((r) => [r.uid, r]));
    expect(byUid.a.rank).toBe(1);
    expect(byUid.b.rank).toBe(1);
    expect(byUid.a.isTied).toBe(true);
    expect(byUid.b.isTied).toBe(true);
    expect(byUid.c.rank).toBe(3); // skips 2 — two people are tied for #1
    expect(byUid.c.isTied).toBe(false);
  });
});

describe('computeGoalStreak (pace-aware, logged days only)', () => {
  // Calendar anchors (self-checked): 2026-07-06 is a Monday.
  const MON = '2026-07-06';
  const TUE = '2026-07-07';
  const WED = '2026-07-08';
  const FRI = '2026-07-10';
  const SAT = '2026-07-11';

  test('sanity: 2026-07-06 is Monday', () => {
    expect(new Date(`${MON}T00:00:00`).getDay()).toBe(1);
  });

  test('missing a mid-week day does NOT break the streak — but only logged days count', () => {
    // Target 5 workouts/week; 2 done (Mon+Tue), none Wed. Today = Wed.
    const logs = [log('a', 'workout', MON), log('a', 'workout', TUE)];
    const s = computeGoalStreak({ logs, uid: 'a', today: WED, streakRule: 'workout', targets: { workout: 5, calories: 0, weight: 0 } });
    // Wed is a no-log day that's still on pace (survives, doesn't count);
    // Mon + Tue were logged (count) → streak 2, not 3.
    expect(s).toBe(2);
  });

  test('ZERO activity never manufactures a streak (Chrizzz repro: inactive since January)', () => {
    // No logs at all this week (or ever). Old logic said "5-day streak" on
    // Friday because the weekly goal was "still reachable" — must be 0.
    const s = computeGoalStreak({ logs: [], uid: 'a', today: FRI, streakRule: 'workout', targets: { workout: 3, calories: 0, weight: 0 } });
    expect(s).toBe(0);
  });

  test('a gap day preserves the chain across it without counting', () => {
    // Logged Mon and Wed (skipped Tue), target 3, today Wed → 2 logged days.
    const logs = [log('a', 'workout', MON), log('a', 'workout', WED)];
    const s = computeGoalStreak({ logs, uid: 'a', today: WED, streakRule: 'workout', targets: { workout: 3, calories: 0, weight: 0 } });
    expect(s).toBe(2);
  });

  test('falling behind (goal no longer reachable) breaks the streak', () => {
    // Target 5; only 2 done by Saturday (no log Sat) -> at most 4 possible -> behind.
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
