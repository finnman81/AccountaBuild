/**
 * Deterministic Firestore log doc IDs for synced health samples.
 *
 * Writing a synced sample to a stable, content-derived doc id (then setDoc/merge)
 * makes health sync idempotent: re-importing the same HealthKit / Health Connect
 * sample overwrites itself instead of creating a duplicate, and needs zero dedup
 * reads. This is the core fix for the "duplicates + slow" sync.
 */

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Firestore doc ids can't contain '/', so strip to a safe charset. */
export function sanitizeId(s: string): string {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 200);
}

/** Stable id for a sample that carries a HealthKit/Health Connect UUID. */
export function healthLogDocId(uuid: string): string {
  const clean = sanitizeId(uuid);
  return clean ? `hk_${clean}` : '';
}

/**
 * Stable fallback id for samples without a usable UUID (e.g. food correlations or
 * daily-statistics totals). Derived from the log's content so the same logical
 * entry maps to the same id across syncs.
 */
export function healthLogFallbackId(parts: { type: string; date: string; value: number; meal?: string; source?: string }): string {
  const key = `${parts.type}|${parts.date}|${parts.value}|${parts.meal ?? ''}|${parts.source ?? ''}`;
  return `hkc_${sanitizeId(parts.type)}_${parts.date.replace(/-/g, '')}_${djb2(key)}`;
}

/** Prefer a UUID-based id; fall back to a content-hash id when no UUID is present. */
export function resolveHealthLogId(
  uuid: string | undefined | null,
  fallback: { type: string; date: string; value: number; meal?: string; source?: string },
): string {
  const byUuid = uuid ? healthLogDocId(uuid) : '';
  return byUuid || healthLogFallbackId(fallback);
}
