/**
 * Gating logic for server pushes (functions/push-helper.js).
 * prefEnabled: missing prefs = enabled (matches client defaults).
 * inQuietHours: 22:00–08:00 in the given TZ suppresses chat/activity pushes.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prefEnabled, inQuietHours, isExpoToken } = require('../../functions/push-helper');

describe('prefEnabled', () => {
  it('defaults to enabled when notifPrefs is missing', () => {
    expect(prefEnabled({}, 'chatMessages')).toBe(true);
    expect(prefEnabled(null, 'teamActivity')).toBe(true);
  });

  it('defaults to enabled when the specific key is missing', () => {
    expect(prefEnabled({ notifPrefs: {} }, 'chatMessages')).toBe(true);
    expect(prefEnabled({ notifPrefs: { teamActivity: false } }, 'chatMessages')).toBe(true);
  });

  it('disabled only on explicit false', () => {
    expect(prefEnabled({ notifPrefs: { chatMessages: false } }, 'chatMessages')).toBe(false);
    expect(prefEnabled({ notifPrefs: { chatMessages: true } }, 'chatMessages')).toBe(true);
  });
});

describe('inQuietHours (America/New_York)', () => {
  const tz = 'America/New_York';
  // July = EDT (UTC-4).
  it('is quiet at 22:00 and 03:00, loud at 08:00 and 21:59', () => {
    expect(inQuietHours(new Date('2026-07-12T02:00:00Z'), tz)).toBe(true); // 22:00 ET
    expect(inQuietHours(new Date('2026-07-12T07:00:00Z'), tz)).toBe(true); // 03:00 ET
    expect(inQuietHours(new Date('2026-07-12T12:00:00Z'), tz)).toBe(false); // 08:00 ET
    expect(inQuietHours(new Date('2026-07-13T01:59:00Z'), tz)).toBe(false); // 21:59 ET
  });
});

describe('isExpoToken', () => {
  it('accepts Expo tokens and rejects everything else', () => {
    expect(isExpoToken('ExponentPushToken[abc]')).toBe(true);
    expect(isExpoToken('fcm-raw-token')).toBe(false);
    expect(isExpoToken(null)).toBe(false);
    expect(isExpoToken(undefined)).toBe(false);
  });
});
