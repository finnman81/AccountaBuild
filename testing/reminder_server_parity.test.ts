jest.mock('../src/firebase/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), setDoc: jest.fn(), serverTimestamp: jest.fn() }));

import { FRIENDLY_LINES, SAVAGE_LINES, reminderBody } from '../src/services/reminderStyle';

// The server sends the reminders now; the app keeps the copy for the Settings
// sample. Both must say the same thing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const server = require('../functions/reminders.js');

describe('reminder copy: app and server agree', () => {
  it('friendly and savage lines match line for line', () => {
    expect(server.FRIENDLY_LINES).toEqual(FRIENDLY_LINES);
    expect(server.SAVAGE_LINES).toEqual(SAVAGE_LINES);
  });

  it('bodies match for every period, style and day', () => {
    for (const style of ['friendly', 'savage'] as const) {
      for (const hour of [6, 9, 12, 16, 17, 21]) {
        for (const day of [0, 1, 2, 3]) {
          expect(server.reminderBodyFor(style, hour, day)).toBe(reminderBody(style, hour, day));
        }
      }
    }
  });

  it('reads the clock in the user time zone', () => {
    const at = new Date('2026-10-27T13:02:00Z');
    expect(server.localClock(at, 'America/New_York')).toMatchObject({ hour: 9, minute: 2, ymd: '2026-10-27' });
    expect(server.localClock(at, 'Europe/London')).toMatchObject({ hour: 13, minute: 2 });
    expect(server.localClock(at, 'Not/AZone').tz).toBe('America/New_York');
  });
});
