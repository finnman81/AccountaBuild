jest.mock('../src/firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), setDoc: jest.fn(), serverTimestamp: jest.fn() }));

import { reminderBody, REMINDER_MESSAGES } from '../src/services/reminderStyle';

describe('reminderBody', () => {
  it('friendly opens with a greeting that fits the hour', () => {
    expect(reminderBody('friendly', 9, 0)).toBe('Good morning ☀️ Remember to log today, you got this!');
    expect(reminderBody('friendly', 12, 0)).toMatch(/^Afternoon check-in/);
    expect(reminderBody('friendly', 21, 0)).toMatch(/^Evening/);
  });
  it('friendly steps to a new line each day and wraps', () => {
    const a = reminderBody('friendly', 9, 0);
    const b = reminderBody('friendly', 9, 1);
    const c = reminderBody('friendly', 9, 2);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(reminderBody('friendly', 9, 3)).toBe(a);
  });
  it('savage has no greeting and its own lines per period', () => {
    expect(reminderBody('savage', 9, 0)).toBe("Excuses don't count. Move.");
    expect(reminderBody('savage', 21, 2)).toBe("Streak's on the line tonight. Log or lose it.");
  });
  it('no em dashes in any reminder', () => {
    for (const pool of Object.values(REMINDER_MESSAGES)) for (const m of pool) expect(m).not.toContain('—');
  });
});
