jest.mock('../src/firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), setDoc: jest.fn(), serverTimestamp: jest.fn() }));

import { reminderBody, REMINDER_MESSAGES } from '../src/services/reminderStyle';

describe('reminderBody', () => {
  it('friendly opens with a greeting that fits the hour', () => {
    expect(reminderBody('friendly', '', 9, 0)).toBe('Good morning ☀️ Log today and keep your streak going!');
    expect(reminderBody('friendly', '', 12, 0)).toMatch(/^Afternoon check-in/);
    expect(reminderBody('friendly', '', 21, 0)).toMatch(/^Evening/);
  });
  it('friendly steps to a new line each day and wraps', () => {
    const a = reminderBody('friendly', '', 9, 0);
    const b = reminderBody('friendly', '', 9, 1);
    const c = reminderBody('friendly', '', 9, 2);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(reminderBody('friendly', '', 9, 3)).toBe(a);
  });
  it('direct and savage have no greeting', () => {
    expect(reminderBody('direct', 'Log today.', 9)).toBe('Log today.');
    expect(reminderBody('savage', 'Log today.', 21)).toBe('Log today.');
  });
  it('no em dashes in any reminder', () => {
    for (const pool of Object.values(REMINDER_MESSAGES)) for (const m of pool) expect(m).not.toContain('—');
  });
});
