import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Generic "last-known value" cache for Firestore-backed screen data.
 *
 * WHY: the Firebase JS SDK has no disk cache on React Native, so data-heavy
 * screens block on the network before first paint — measured at ~6s for Today
 * and ~3.5s for Leaderboard (Sentry, 2026-07-21). This mirrors each key
 * snapshot to disk + memory so screens paint LAST-KNOWN data instantly and
 * refresh behind (cache-then-network, how Strava/MFP-class apps feel instant).
 *
 * In-memory-first is the point: an async disk read can't help the first synchronous
 * render. `primeHydrationCache()` loads disk → memory during the startup splash
 * (see App.tsx), so `getHydrated()` is a synchronous hit by the time any screen
 * mounts. Only serializable, bounded data belongs here — NOT raw logs (Firestore
 * Timestamps don't round-trip cleanly and log volume is unbounded).
 */
const PREFIX = 'hyd:';
const mem = new Map<string, unknown>();
let primed = false;

/** Load all cached keys disk → memory. Call once, awaited during startup. */
export async function primeHydrationCache(): Promise<void> {
  if (primed) return;
  primed = true;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (!keys.length) return;
    const pairs = await AsyncStorage.multiGet(keys);
    for (const [k, v] of pairs) {
      if (v == null) continue;
      try {
        mem.set(k.slice(PREFIX.length), JSON.parse(v));
      } catch {
        /* skip a corrupt entry */
      }
    }
  } catch {
    /* an unreadable cache must never block startup */
  }
}

/** Synchronous read of the last-known value (undefined if never cached). */
export function getHydrated<T>(key: string): T | undefined {
  return mem.has(key) ? (mem.get(key) as T) : undefined;
}

/** Store a value in memory + disk (fire-and-forget on the disk write). */
export function setHydrated(key: string, value: unknown): void {
  mem.set(key, value);
  void AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
}
