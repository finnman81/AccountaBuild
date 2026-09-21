import { nextStreakMilestone, streakWeekStates } from '../../src/viewmodels/today';

const log = (date: string, type: string) => ({ id: `${date}-${type}`, uid: 'me', date, type } as any);
// Week of Mon 2026-09-14 .. Sun 2026-09-20
const base = { uid: 'me', streakRule: 'workout' as const, targets: { workout: 4, calories: 0, weight: 0 } };

describe('streakWeekStates', () => {
  it('marks logged, rest, today and ahead', () => {
    const w = streakWeekStates({ ...base, today: '2026-09-17', logs: [log('2026-09-14', 'workout'), log('2026-09-16', 'workout')] });
    expect(w.map((d) => d.state)).toEqual(['logged', 'rest', 'logged', 'today', 'ahead', 'ahead', 'ahead']);
    expect(w[0]!.label).toBe('Mon');
    expect(w[6]!.date).toBe('2026-09-20');
  });
  it('a day off is only a rest day while the target is still reachable', () => {
    // target 6: nothing Mon, nothing Tue -> after Tue only 5 days remain -> missed
    const w = streakWeekStates({ ...base, targets: { workout: 6, calories: 0, weight: 0 }, today: '2026-09-17', logs: [log('2026-09-16', 'workout')] });
    expect(w.slice(0, 3).map((d) => d.state)).toEqual(['rest', 'missed', 'logged']);
  });
  it('a shielded week never shows a miss', () => {
    const w = streakWeekStates({ ...base, targets: { workout: 7, calories: 0, weight: 0 }, today: '2026-09-17', logs: [], shieldedWeeks: new Set(['2026-W38']) });
    expect(w.slice(0, 3).map((d) => d.state)).toEqual(['rest', 'rest', 'rest']);
  });
  it("'any' rule: one reachable category keeps the day safe", () => {
    const w = streakWeekStates({ uid: 'me', streakRule: 'any', targets: { workout: 7, calories: 3, weight: 0 }, today: '2026-09-16', logs: [] });
    expect(w[0]!.state).toBe('rest'); // workouts are out of reach, calories are not
  });
  it("ignores other people's logs", () => {
    const w = streakWeekStates({ ...base, today: '2026-09-15', logs: [{ ...log('2026-09-14', 'workout'), uid: 'you' }] });
    expect(w[0]!.state).toBe('rest');
  });
});

describe('nextStreakMilestone', () => {
  it('finds the next rung and the progress along the leg', () => {
    expect(nextStreakMilestone(1)).toEqual({ next: 7, prev: 0, progress: 1 / 7 });
    expect(nextStreakMilestone(7)).toMatchObject({ next: 14, prev: 7, progress: 0.5 });
    expect(nextStreakMilestone(72)).toMatchObject({ next: 100, prev: 50, progress: 0.72 }); // "28 to 100" reads 72% full
    expect(nextStreakMilestone(101).progress).toBeCloseTo(101 / 150, 5); // passing 100 never empties the ring
    expect(nextStreakMilestone(400).next).toBe(500);
  });
});

import { highestMilestoneAtOrBelow, milestoneToCelebrate, streakMilestoneCopy } from '../../src/viewmodels/today';

describe('streak milestones', () => {
  it('celebrates a milestone once, on or after the day it lands', () => {
    expect(milestoneToCelebrate(7, 0)).toBe(7);
    expect(milestoneToCelebrate(7, 7)).toBeNull();
    expect(milestoneToCelebrate(31, 14)).toBe(30); // synced user opened a day late
    expect(milestoneToCelebrate(6, 0)).toBeNull();
  });
  it('an existing long streak is seeded, not celebrated retroactively', () => {
    // first run at day 65: seed = highest at or below 64 = 50, so nothing fires until 100
    const seed = highestMilestoneAtOrBelow(65 - 1);
    expect(seed).toBe(50);
    expect(milestoneToCelebrate(65, seed)).toBeNull();
    expect(milestoneToCelebrate(100, seed)).toBe(100);
  });
  it('first run ON a milestone day still celebrates it', () => {
    expect(milestoneToCelebrate(30, highestMilestoneAtOrBelow(29))).toBe(30);
  });
  it('has house-voice copy for every milestone, no em dashes', () => {
    for (const m of [7, 14, 30, 50, 100, 150, 200, 365]) {
      const c = streakMilestoneCopy(m);
      expect(c.title.length).toBeGreaterThan(3);
      expect(`${c.title}${c.line}`).not.toMatch(/—/);
    }
  });
});
