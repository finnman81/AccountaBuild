/**
 * Anchored deletions only apply inside the window the same sync pass
 * re-imports, so a false HealthKit delete always self-heals.
 */
jest.mock('../../src/firebase/firebase', () => ({ db: {} }));
jest.mock('../../src/services/logs', () => ({
  upsertGroupLogById: jest.fn(async (_g: string, id: string) => id),
  deleteGroupLogById: jest.fn(async () => {}),
}));
jest.mock('../../src/services/logEdits', () => ({ upsertUserWeightHistoryFromGroupLog: jest.fn(async () => {}) }));
jest.mock('../../src/services/health/healthAnchors', () => ({
  getAnchor: jest.fn(async () => 'anchor-1'),
  setAnchor: jest.fn(async () => {}),
}));
jest.mock('../../src/services/health/healthService', () => ({
  checkHealthPermissions: jest.fn(async () => ({ workouts: true, calories: true, weight: false })),
  readRecentWorkouts: jest.fn(async () => []),
  readWorkoutsSinceAnchor: jest.fn(async () => ({ items: [], deletedUuids: [] })),
  readTodayCalorieEntries: jest.fn(async () => []),
  readCalorieEntriesSinceAnchor: jest.fn(async () => ({ items: [], deletedUuids: [] })),
  readRecentWeights: jest.fn(async () => []),
}));

import { syncHealthData } from '../../src/services/healthSync';
import { formatYYYYMMDDLocal } from '../../src/utils/dates';

const firestore = jest.requireMock('firebase/firestore');
const logs = jest.requireMock('../../src/services/logs');
const health = jest.requireMock('../../src/services/health/healthService');

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatYYYYMMDDLocal(d);
}

// Group log docs by id -> date. Anything else reads as missing.
let logDates: Record<string, string> = {};

beforeEach(() => {
  jest.clearAllMocks();
  logDates = {};
  firestore.doc.mockImplementation((_db: unknown, ...path: string[]) => ({ path: path.join('/') }));
  firestore.getDoc.mockImplementation(async (ref: { path: string }) => {
    const m = /^groups\/[^/]+\/logs\/(.+)$/.exec(ref.path);
    const date = m ? logDates[m[1]] : undefined;
    return { exists: () => date != null, data: () => (date != null ? { date } : {}) };
  });
});

const settings = { syncWorkouts: true, syncCalories: true, syncWeight: false };

describe('healthSync: anchored deletions stay inside the re-import window', () => {
  it('workouts: deletes inside the 7-day window, skips older logs and missing docs', async () => {
    logDates = { hk_inside: daysAgo(2), hk_outside: daysAgo(20) };
    health.readWorkoutsSinceAnchor.mockResolvedValueOnce({ items: [], deletedUuids: ['inside', 'outside', 'missing'] });

    const res = await syncHealthData('u1', 'g1', settings);

    const deleted = logs.deleteGroupLogById.mock.calls.map((c: any[]) => c[1]);
    expect(deleted).toEqual(['hk_inside']);
    expect(logs.deleteGroupLogById).toHaveBeenCalledWith('g1', 'hk_inside', { tombstone: false });
    expect(res.diagnostics?.workouts?.dataFromHealth.deleteSkippedOutsideWindow).toBe(1);
    expect(res.diagnostics?.workouts?.dataFromHealth.deletedCount).toBe(1);
  });

  it('workouts: a uuid imported this pass is never deleted', async () => {
    const start = new Date();
    start.setHours(9, 0, 0, 0);
    logDates = { hk_alive: formatYYYYMMDDLocal(start) };
    health.readRecentWorkouts.mockResolvedValueOnce([
      { uuid: 'alive', workoutType: 'walking', durationMinutes: 30, startDate: start, endDate: start },
    ]);
    health.readWorkoutsSinceAnchor.mockResolvedValueOnce({ items: [], deletedUuids: ['alive'] });

    await syncHealthData('u1', 'g1', settings);

    expect(logs.deleteGroupLogById).not.toHaveBeenCalled();
  });

  it('calories: only today (the today read) is in the window', async () => {
    logDates = { hk_ctoday: daysAgo(0), hk_cyday: daysAgo(1) };
    health.readCalorieEntriesSinceAnchor.mockResolvedValueOnce({ items: [], deletedUuids: ['ctoday', 'cyday'] });

    const res = await syncHealthData('u1', 'g1', settings);

    const deleted = logs.deleteGroupLogById.mock.calls.map((c: any[]) => c[1]);
    expect(deleted).toEqual(['hk_ctoday']);
    expect(res.diagnostics?.calories?.dataFromHealth.deleteSkippedOutsideWindow).toBe(1);
  });
});
