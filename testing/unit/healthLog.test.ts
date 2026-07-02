import { healthLogDocId, healthLogFallbackId, resolveHealthLogId, sanitizeId } from '../../src/services/health/healthLog';

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
});
