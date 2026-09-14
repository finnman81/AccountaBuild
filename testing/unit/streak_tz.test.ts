// The bug only shows on a device EAST of New York. Jest sandboxes
// process.env per file, so set the zone from outside (Git Bash on Windows
// drops TZ=Area/City, hence the node wrapper):
//   node -e "process.env.TZ='Asia/Tokyo'; require('child_process').execSync('npx jest testing/unit/streak_tz.test.ts', {stdio:'inherit'})"
// Under Tokyo the pre-fix walkers fail all three cases (verified 2026-09-14).
// In New York the same cases still pin the expected numbers.

// today.ts -> hibernation.ts pulls in firebase/functions (ESM, untransformed
// under jest). The walkers are pure — stub the module boundary out.
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(), httpsCallable: jest.fn() }));
jest.mock('../../src/firebase/firebase', () => ({ firebaseApp: {}, db: {} }));

import { computeGoalStreak, computeStreakDays, memberStreakDays } from '../../src/viewmodels/today';
import type { GroupLog, LogType } from '../../src/services/logs';

/**
 * Regression: the walkers read a day's ISO week off LOCAL midnight. East of
 * New York, local midnight Monday is still Sunday in NY, so every Monday
 * landed in the previous week and an unlogged Monday of a shielded week broke
 * the streak. Calendar: 2026-09-07 is the Monday of W37.
 */
const log = (date: string, type: LogType = 'workout'): GroupLog => ({ uid: 'a', date, type } as unknown as GroupLog);
const dates = (from: number, to: number, month = '09') =>
  Array.from({ length: to - from + 1 }, (_, i) => `2026-${month}-${String(from + i).padStart(2, '0')}`);

// Logged Tue 9/1 .. Sun 9/6 (W36), nothing in W37 (shielded), logged Mon 9/14 .. Wed 9/16 (W38).
const LOGS = [...dates(1, 6), ...dates(14, 16)].map((d) => log(d));
const SHIELD = new Set(['2026-W37']);
const TODAY = '2026-09-16';

describe('streak walkers map days to weeks by date, not device clock', () => {
  it('computeStreakDays skips the whole shielded week, Monday included', () => {
    const s = computeStreakDays(LOGS, new Set<LogType>(['workout']), TODAY, { a: SHIELD });
    expect(s.a).toBe(9);
  });

  it('computeGoalStreak legacy branch (no targets) skips the shielded Monday', () => {
    const s = computeGoalStreak({ logs: LOGS, uid: 'a', today: TODAY, streakRule: 'workout', targets: { workout: 0, calories: 0, weight: 0 }, shieldedWeeks: SHIELD });
    expect(s).toBe(9);
  });

  it('computeGoalStreak goal branch skips the shielded Monday', () => {
    const s = computeGoalStreak({ logs: LOGS, uid: 'a', today: TODAY, streakRule: 'workout', targets: { workout: 7, calories: 0, weight: 0 }, shieldedWeeks: SHIELD });
    expect(s).toBe(9);
  });
});

describe('memberStreakDays', () => {
  const pub = (extra: Record<string, unknown> = {}) =>
    ({ uid: 'a', workoutsPerWeek: 7, vacationWeekIds: ['2026-W37'], ...extra }) as any;

  it('honors the member\'s shielded weeks from the public mirror', () => {
    expect(memberStreakDays({ logs: LOGS, uid: 'a', today: TODAY, streakRule: 'workout', pub: pub() })).toBe(9);
  });

  it('prefers a longer fresh mirror over a truncated feed', () => {
    const p = pub({ streakDaysPublic: 40, streakDaysUpdatedAtMs: Date.now() - 60_000 });
    expect(memberStreakDays({ logs: LOGS, uid: 'a', today: TODAY, streakRule: 'workout', pub: p })).toBe(40);
  });

  it('ignores a stale mirror', () => {
    const p = pub({ streakDaysPublic: 40, streakDaysUpdatedAtMs: Date.now() - 72 * 3600_000 });
    expect(memberStreakDays({ logs: LOGS, uid: 'a', today: TODAY, streakRule: 'workout', pub: p })).toBe(9);
  });
});
