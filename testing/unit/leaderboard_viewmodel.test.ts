import { buildLeaderboard } from '../../src/viewmodels/leaderboard';
import type { PublicUser } from '../../src/services/publicUsers';

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

describe('buildLeaderboard — tied ranks', () => {
  const TODAY = '2026-07-01';

  it('three members tied at the fresh Silver-IV baseline all show rank 1', () => {
    // Simulates the very common post-reset scenario: everyone starts at 1800.
    const members = ['a', 'b', 'c'];
    const publicUsers = {
      a: pub('a', { mmrPublic: 1800, rankTierPublic: 'Silver', rankDivisionPublic: 4 }),
      b: pub('b', { mmrPublic: 1800, rankTierPublic: 'Silver', rankDivisionPublic: 4 }),
      c: pub('c', { mmrPublic: 1800, rankTierPublic: 'Silver', rankDivisionPublic: 4 }),
    };
    const { rows } = buildLeaderboard({
      memberUids: members,
      publicUsers,
      canSee: new Set(members),
      myUid: 'a',
      logs: [],
      today: TODAY,
      streakRule: 'workout',
      pastCutoff: false,
    });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.rank).toBe(1);
      expect(r.isTied).toBe(true);
    }
  });

  it('a distinct leader is NOT tied; the tied pair below them skips to rank 2', () => {
    const members = ['a', 'b', 'c'];
    const publicUsers = {
      a: pub('a', { mmrPublic: 2000 }),
      b: pub('b', { mmrPublic: 1800 }),
      c: pub('c', { mmrPublic: 1800 }),
    };
    const { rows } = buildLeaderboard({
      memberUids: members,
      publicUsers,
      canSee: new Set(members),
      myUid: 'a',
      logs: [],
      today: TODAY,
      streakRule: 'workout',
      pastCutoff: false,
    });
    const byUid = Object.fromEntries(rows.map((r) => [r.uid, r]));
    expect(byUid.a.rank).toBe(1);
    expect(byUid.a.isTied).toBe(false);
    expect(byUid.b.rank).toBe(2);
    expect(byUid.b.isTied).toBe(true);
    expect(byUid.c.rank).toBe(2);
    expect(byUid.c.isTied).toBe(true);
  });

  it('no ties when every MMR is distinct', () => {
    const members = ['a', 'b', 'c'];
    const publicUsers = {
      a: pub('a', { mmrPublic: 2000 }),
      b: pub('b', { mmrPublic: 1800 }),
      c: pub('c', { mmrPublic: 1600 }),
    };
    const { rows } = buildLeaderboard({
      memberUids: members,
      publicUsers,
      canSee: new Set(members),
      myUid: 'a',
      logs: [],
      today: TODAY,
      streakRule: 'workout',
      pastCutoff: false,
    });
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.every((r) => !r.isTied)).toBe(true);
  });
});
