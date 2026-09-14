// healthKitService imports the native HealthKit module at load; stub it so
// mapWorkoutSample (pure) can run under jest.
jest.mock('@kingstinct/react-native-healthkit', () => ({ UpdateFrequency: {} }));

import { mapHealthKitWorkoutType } from '../../src/services/health/workoutMapper';
import { mapWorkoutSample } from '../../src/services/health/healthKitService';

describe('health/workoutMapper: mapHealthKitWorkoutType', () => {
  it('maps Apple numeric values through the table', () => {
    expect(mapHealthKitWorkoutType(50)).toBe('weightLifting'); // traditionalStrengthTraining
    expect(mapHealthKitWorkoutType(63)).toBe('hiit');
    expect(mapHealthKitWorkoutType(35)).toBe('rowing');
    expect(mapHealthKitWorkoutType(52)).toBe('walking');
    expect(mapHealthKitWorkoutType('52')).toBe('walking');
  });

  it('unmapped numbers become other, never the OLD wrong string-fallback guesses', () => {
    // 17 equestrian (was rowing), 60 cross-country skiing (was tai chi),
    // 61 downhill skiing (was stretching).
    for (const n of [17, 60, 61]) {
      expect(mapHealthKitWorkoutType(n)).toBe('other');
      expect(mapHealthKitWorkoutType(String(n))).toBe('other');
    }
    // Other numbers the string fallback used to test.
    for (const n of [24, 13, 46, 16, 57, 59, 62, 64, 58, 53]) {
      expect(mapHealthKitWorkoutType(String(n))).toBe(mapHealthKitWorkoutType(n));
    }
  });

  it("'other' (3000) stays other, never manualLabor", () => {
    expect(mapHealthKitWorkoutType(3000)).toBe('other');
    expect(mapHealthKitWorkoutType('3000')).toBe('other');
    expect(mapHealthKitWorkoutType('other')).toBe('other');
  });

  it('still maps names', () => {
    expect(mapHealthKitWorkoutType('TraditionalStrengthTraining')).toBe('weightLifting');
    expect(mapHealthKitWorkoutType('rowing')).toBe('rowing');
    expect(mapHealthKitWorkoutType('Manual Labor')).toBe('manualLabor');
  });
});

describe('health/healthKitService: mapWorkoutSample', () => {
  const base = { startDate: new Date('2026-09-14T09:00:00'), endDate: new Date('2026-09-14T09:45:00'), duration: 2700 };

  it('52 is walking, even from a gym/strength-named source', () => {
    for (const name of ['Gym App', 'Strong', 'WeightWatchers']) {
      expect(mapWorkoutSample({ ...base, workoutActivityType: 52, source: { name } })?.workoutType).toBe('walking');
    }
  });

  it('52 with distance stays walking', () => {
    expect(mapWorkoutSample({ ...base, workoutActivityType: 52, totalDistance: 3000 })?.workoutType).toBe('walking');
  });

  it('records the raw type on unmapped numbers', () => {
    const w = mapWorkoutSample({ ...base, workoutActivityType: 17 });
    expect(w?.workoutType).toBe('other');
    expect(w?.rawActivityType).toBe('17');
  });
});
