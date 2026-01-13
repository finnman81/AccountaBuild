import { buildMemberSummaries } from '../../src/viewmodels/memberSummary';

describe('memberSummary', () => {
  test('buildMemberSummaries aggregates calories and workouts for today', () => {
    const today = '2026-01-13';
    const weekStart = new Date('2026-01-12T00:00:00');

    const out = buildMemberSummaries({
      members: [{ uid: 'u1', displayName: 'Jake' }],
      goals: [{ uid: 'u1', dailyCalorieGoal: 2000 } as any],
      logs: [
        { id: '1', uid: 'u1', type: 'calories', date: today, payload: { calories: 500 }, ts: new Date() } as any,
        { id: '2', uid: 'u1', type: 'calories', date: today, payload: { calories: 200 }, ts: new Date() } as any,
        { id: '3', uid: 'u1', type: 'workout', date: today, payload: { durationMinutes: 30, workoutType: 'running' }, ts: new Date() } as any,
      ],
      todayYYYYMMDD: today,
      weekStart,
      workoutLabel: (t) => String(t),
    });

    expect(out).toHaveLength(1);
    expect(out[0].caloriesLoggedToday).toBe(700);
    expect(out[0].caloriesRemaining).toBe(1300);
    expect(out[0].workoutMinutesToday).toBe(30);
    expect(out[0].loggedToday).toBe(true);
  });
});

