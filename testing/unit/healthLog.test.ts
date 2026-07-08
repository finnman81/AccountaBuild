import { healthLogDocId, healthLogFallbackId, resolveHealthLogId, sanitizeId, isRecentImportDate } from '../../src/services/health/healthLog';

describe('health/healthLog', () => {
  it('derives a stable, idempotent id from a sample UUID', () => {
    const uuid = 'A1B2C3D4-1111-2222-3333-444455556666';
    expect(healthLogDocId(uuid)).toBe(healthLogDocId(uuid)); // idempotent
    expect(healthLogDocId(uuid).startsWith('hk_')).toBe(true);
    expect(healthLogDocId('X').split('_')[1]).not.toBe(healthLogDocId('Y').split('_')[1]);
  });

  it('sanitizes ids to a Firestore-safe charset (no slashes)', () => {
    expect(sanitizeId('a/b.c d')).toBe('abcd');
    expect(healthLogDocId('has/slash')).toBe('hk_hasslash');
    expect(healthLogDocId('')).toBe('');
  });

  it('fallback id is stable for the same content and differs for different content', () => {
    const a = healthLogFallbackId({ type: 'calories', date: '2026-07-02', value: 640, meal: 'lunch', source: 'MyFitnessPal' });
    const b = healthLogFallbackId({ type: 'calories', date: '2026-07-02', value: 640, meal: 'lunch', source: 'MyFitnessPal' });
    const c = healthLogFallbackId({ type: 'calories', date: '2026-07-02', value: 641, meal: 'lunch', source: 'MyFitnessPal' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('hkc_')).toBe(true);
  });

  it('prefers the UUID id and falls back to content when absent', () => {
    const fb = { type: 'weight', date: '2026-07-02', value: 182.4 };
    expect(resolveHealthLogId('UUID-1', fb)).toBe(healthLogDocId('UUID-1'));
    expect(resolveHealthLogId(null, fb)).toBe(healthLogFallbackId(fb));
    expect(resolveHealthLogId('', fb)).toBe(healthLogFallbackId(fb));
  });

  describe('isRecentImportDate (bounds anchored-sync backfill)', () => {
    const today = '2026-07-02';

    it('accepts today and yesterday with the default 1-day window', () => {
      expect(isRecentImportDate('2026-07-02', today)).toBe(true);
      expect(isRecentImportDate('2026-07-01', today)).toBe(true);
    });

    it('rejects anything older than the window', () => {
      expect(isRecentImportDate('2026-06-30', today)).toBe(false);
      expect(isRecentImportDate('2025-07-02', today)).toBe(false);
    });

    it('never imports future-dated samples', () => {
      expect(isRecentImportDate('2026-07-03', today)).toBe(false);
    });

    it('handles month/year boundaries', () => {
      expect(isRecentImportDate('2025-12-31', '2026-01-01')).toBe(true); // yesterday across year
      expect(isRecentImportDate('2026-02-28', '2026-03-01')).toBe(true); // yesterday across month
      expect(isRecentImportDate('2026-02-27', '2026-03-01')).toBe(false);
    });

    it('respects a custom daysBack window', () => {
      expect(isRecentImportDate('2026-06-25', today, 7)).toBe(true);
      expect(isRecentImportDate('2026-06-24', today, 7)).toBe(false);
    });

    it('rejects malformed dates', () => {
      expect(isRecentImportDate('not-a-date', today)).toBe(false);
      expect(isRecentImportDate('2026-07-02', 'bad')).toBe(false);
    });
  });
});
