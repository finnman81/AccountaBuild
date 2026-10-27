jest.mock('../src/firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), setDoc: jest.fn(), serverTimestamp: jest.fn() }));

import { reminderBody, REMINDER_MESSAGES } from '../src/services/reminderStyle';

describe('reminderBody', () => {
  it('friendly opens with a greeting that fits the hour', () => {
    expect(reminderBody('friendly', REMINDER_MESSAGES.friendly[0], 9)).toMatch(/^Good morning .* Log today and keep your streak going!$/);
    expect(reminderBody('friendly', 'x', 12)).toMatch(/^Afternoon check-in/);
    expect(reminderBody('friendly', 'x', 21)).toMatch(/^Evening/);
  });
  it('direct and savage have no greeting', () => {
    expect(reminderBody('direct', 'Log today.', 9)).toBe('Log today.');
    expect(reminderBody('savage', 'Log today.', 21)).toBe('Log today.');
  });
  it('no em dashes in any reminder', () => {
    for (const pool of Object.values(REMINDER_MESSAGES)) for (const m of pool) expect(m).not.toContain('—');
  });
});
