// mmrProjection imports the firebase singleton for its subscription plumbing;
// computeProjection itself is pure — stub the module boundary out.
jest.mock('../../src/firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  documentId: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

import { computeProjection } from '../../src/services/mmrProjection';
import { DEFAULT_TZ, isoWeekIdInTz, isoWeekRangeInTz } from '../../src/mmr/time';

/**
 * Regression for the "+2 if I logged everything" bug (2026-07-16): what-if
 * marginals were diffed in the pace-capped NOW frame, where an on-pace user's
 * next log moves today's projection by ~0 even though it moves the week's
 * final score a lot. Marginals must be measured in the weekEnd frame.
 */
const weekId = isoWeekIdInTz(new Date(), DEFAULT_TZ);
const { start } = isoWeekRangeInTz(weekId, DEFAULT_TZ);

function baseParams(overrides: Partial<Parameters<typeof computeProjection>[0]> = {}) {
  return {
    weekId,
    seasonId: '2026-Q3',
    mmrBefore: 2000,
    mpBefore: 0,
    streakWeeks: 0,
    tierShieldWeeksRemaining: 0,
    goals: {
      workouts: { type: 'workouts', status: 'active', targetWorkoutsPerWeek: 4 },
      calorieDays: { type: 'calorieDays', status: 'active', targetDaysPerWeek: 5 },
    } as Record<string, any>,
    workouts: [{ date: start, durationMinutes: 45 }],
    weights: [],
    calorieDaysMet: new Set<string>([start]),
    ...overrides,
  };
}

describe('projection what-if marginals (weekEnd frame)', () => {
  it('an under-target next workout is worth meaningful FP even when on pace today', () => {
    // 1 of 4 workouts done on the week's first day — pace-capped "now" frame
    // would call an extra workout nearly worthless; the weekEnd frame must not.
    const p = computeProjection(baseParams());
    expect(p.whatIf.workout).toBeGreaterThanOrEqual(5);
  });

  it('a workout beyond the met target is worth 0', () => {
    const p = computeProjection(
      baseParams({
        workouts: [
          { date: start, durationMinutes: 45 },
          { date: start, durationMinutes: 45 },
          { date: start, durationMinutes: 45 },
          { date: start, durationMinutes: 45 },
        ],
      }),
    );
    expect(p.whatIf.workout).toBe(0);
  });

  it('weigh-in is worth 0 with no weight goal', () => {
    const p = computeProjection(baseParams());
    expect(p.whatIf.weighIn).toBe(0);
  });

  it('marginals never go negative', () => {
    const p = computeProjection(baseParams());
    expect(p.whatIf.workout).toBeGreaterThanOrEqual(0);
    expect(p.whatIf.calorieDay).toBeGreaterThanOrEqual(0);
    expect(p.whatIf.weighIn).toBeGreaterThanOrEqual(0);
  });
});
