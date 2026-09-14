// Fake Firestore refs carry their path so the test can drive each snapshot.
jest.mock('../../src/firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => {
  const ref = (...segs: unknown[]) => ({ path: segs.slice(1).join('/') });
  return {
    collection: jest.fn(ref),
    doc: jest.fn(ref),
    documentId: jest.fn(),
    getDocs: jest.fn(),
    limit: jest.fn(),
    onSnapshot: jest.fn(),
    orderBy: jest.fn(),
    query: jest.fn((r: any) => r),
    where: jest.fn(),
  };
});

import { onSnapshot } from 'firebase/firestore';
import { computeProjection, subscribeMyMmrProjection, type MmrProjection } from '../../src/services/mmrProjection';
import { DEFAULT_TZ, isoWeekIdInTz, isoWeekRangeInTz, nextIsoWeekId, prevIsoWeekId, yyyyMmDdInTz } from '../../src/mmr/time';

const weekId = isoWeekIdInTz(new Date(), DEFAULT_TZ);
const today = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
// A day this week that isn't today, so a what-if workout adds a NEW day.
const otherDay = isoWeekRangeInTz(weekId, DEFAULT_TZ).dates.find((d) => d !== today)!;

function baseParams(overrides: Partial<Parameters<typeof computeProjection>[0]> = {}) {
  return {
    weekId,
    seasonId: '2026-Q3',
    mmrBefore: 2000,
    mpBefore: 0,
    streakWeeks: 0,
    tierShieldWeeksRemaining: 0,
    goals: { workouts: { type: 'workouts', status: 'active', targetWorkoutsPerWeek: 4 } } as Record<string, any>,
    workouts: [],
    weights: [],
    calorieDaysMet: new Set<string>(),
    ...overrides,
  };
}

describe('shielded week: projection mirrors the server scorer', () => {
  it('holds the streak instead of resetting it', () => {
    const normal = computeProjection(baseParams({ streakWeeks: 5 }), { skipWhatIf: true, frame: 'weekEnd' });
    const shielded = computeProjection(baseParams({ streakWeeks: 5, vacation: true }), { skipWhatIf: true, frame: 'weekEnd' });
    expect(shielded.streakMultiplier).toBeGreaterThan(normal.streakMultiplier);
  });

  it('never claims demotion risk from a penalty that cannot happen', () => {
    // Find an FP where the missed-week penalty WOULD drop the rank.
    let atRisk: number | null = null;
    for (let mmr = 200; mmr <= 6000 && atRisk == null; mmr += 5) {
      if (computeProjection(baseParams({ mmrBefore: mmr }), { skipWhatIf: true }).demotionPossible) atRisk = mmr;
    }
    expect(atRisk).not.toBeNull();
    expect(computeProjection(baseParams({ mmrBefore: atRisk!, vacation: true }), { skipWhatIf: true }).demotionPossible).toBe(false);
  });

  it('what-if has no avoided penalty to count', () => {
    // 1 of 4 days = missed; the what-if day makes it 2 of 4 = partial, which
    // unshielded also prices in the smaller penalty. Shielded has none to shrink.
    const one = { workouts: [{ date: otherDay, durationMinutes: 45 }] };
    const normal = computeProjection(baseParams(one));
    const shielded = computeProjection(baseParams({ ...one, vacation: true }));
    expect(shielded.whatIf.workout).toBeGreaterThan(0);
    expect(shielded.whatIf.workout).toBeLessThan(normal.whatIf.workout);
  });
});

describe('subscribeMyMmrProjection shield inputs', () => {
  function drive(user: Record<string, unknown>, weekly: Record<string, unknown> | null = null): MmrProjection | null {
    const cbs = new Map<string, (snap: any) => void>();
    (onSnapshot as jest.Mock).mockImplementation((ref: any, cb: any) => {
      cbs.set(ref?.path, cb);
      return () => {};
    });
    let last: MmrProjection | null = null;
    const unsub = subscribeMyMmrProjection('u1', (p) => (last = p));
    const snap = (data: Record<string, unknown> | null) => ({ exists: () => data != null, data: () => data });
    cbs.get(`users/u1/weekly/${weekId}`)!(snap(weekly));
    cbs.get('users/u1')!(snap({ mmr: 2000, mp: 0, ...user }));
    unsub();
    return last;
  }

  it('no shield by default', () => {
    expect(drive({})?.onVacation).toBe(false);
  });

  it('a hibernation range containing the week shields it', () => {
    const hib = { fromWeekId: prevIsoWeekId(weekId), untilWeekId: nextIsoWeekId(weekId), graceWeekId: 'zz' };
    expect(drive({ hibernation: hib })?.onVacation).toBe(true);
  });

  it('the grace week shields it', () => {
    const hib = { fromWeekId: '2026-W01', untilWeekId: prevIsoWeekId(weekId), graceWeekId: weekId, awake: true };
    expect(drive({ hibernation: hib })?.onVacation).toBe(true);
  });

  it('a past hibernation range does not', () => {
    const hib = { fromWeekId: '2026-W01', untilWeekId: '2026-W02', graceWeekId: '2026-W03', awake: true };
    expect(drive({ hibernation: hib })?.onVacation).toBe(false);
  });

  it('the anchored weekly.hibernationShield shields it', () => {
    expect(drive({}, { hibernationShield: true })?.onVacation).toBe(true);
  });
});
