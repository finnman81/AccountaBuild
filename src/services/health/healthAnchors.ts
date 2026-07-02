import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-user HealthKit anchor storage.
 *
 * An "anchor" is an opaque token from HealthKit's anchored-object queries that
 * marks how far we've read a given data type. Persisting it lets each sync fetch
 * only the samples that were added/changed/deleted since last time (a delta),
 * instead of re-reading everything every sync.
 *
 * Anchors are device-local (tied to this device's HealthKit database) and
 * user-local, so we key them by uid. They are intentionally NOT keyed by group:
 * an anchor means "we've already consumed these samples", and each sample is
 * imported once into whichever group is active when it's first seen — matching
 * the existing sync behavior.
 */
export type AnchorKind = 'workouts' | 'calories';

function anchorKey(uid: string, kind: AnchorKind): string {
  return `health:anchor:${kind}:${uid}`;
}

export async function getAnchor(uid: string, kind: AnchorKind): Promise<string | undefined> {
  try {
    const v = await AsyncStorage.getItem(anchorKey(uid, kind));
    return v ?? undefined;
  } catch (e) {
    console.warn('[HealthAnchors] getAnchor failed', kind, e);
    return undefined;
  }
}

export async function setAnchor(uid: string, kind: AnchorKind, anchor: string): Promise<void> {
  try {
    if (anchor) await AsyncStorage.setItem(anchorKey(uid, kind), anchor);
  } catch (e) {
    console.warn('[HealthAnchors] setAnchor failed', kind, e);
  }
}

/** Reset a user's anchors (e.g. to force a clean re-scan on the next sync). */
export async function clearAnchors(uid: string): Promise<void> {
  try {
    await AsyncStorage.multiRemove([anchorKey(uid, 'workouts'), anchorKey(uid, 'calories')]);
  } catch (e) {
    console.warn('[HealthAnchors] clearAnchors failed', e);
  }
}
