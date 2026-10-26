import { useEffect, useRef, useState } from 'react';
import { LayoutAnimation } from 'react-native';

import { getHydrated, setHydrated } from '../services/hydrationCache';
import type { GroupLog } from '../services/logs';

/**
 * Cache-then-ease, as two one-liners for any screen.
 *
 * useCachedSubscription: paint the last-known value synchronously (hydration
 * cache, primed during the splash), then subscribe and keep the cache fresh.
 * useEased: when the data behind a view changes, ease the layout instead of
 * snapping. Together they're what makes a screen feel like it was already
 * loaded (Strava/WHOOP-style), without a disk cache in the Firebase SDK.
 */
export type Subscribe<T> = (onChange: (value: T) => void) => () => void;

export function useCachedSubscription<T>(
  key: string | null,
  subscribe: Subscribe<T> | null,
  opts?: { toCache?: (value: T) => unknown },
): { value: T | undefined; live: boolean } {
  const [value, setValue] = useState<T | undefined>(() => (key ? getHydrated<T>(key) : undefined));
  const [live, setLive] = useState(false);
  // Callers pass fresh closures every render; only the key decides re-subscribing.
  const subRef = useRef(subscribe);
  subRef.current = subscribe;
  const toCacheRef = useRef(opts?.toCache);
  toCacheRef.current = opts?.toCache;

  useEffect(() => {
    setValue(key ? getHydrated<T>(key) : undefined);
    setLive(false);
    if (!key || !subRef.current) return;
    return subRef.current((v) => {
      setValue(v);
      setLive(true);
      setHydrated(key, toCacheRef.current ? toCacheRef.current(v) : v);
    });
  }, [key]);

  return { value, live };
}

/** Ease the next layout pass whenever `signature` changes (skips the first render). */
export function useEased(signature: string): void {
  const prev = useRef(signature);
  useEffect(() => {
    if (prev.current !== signature) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    prev.current = signature;
  }, [signature]);
}

/** Logs trimmed to what screens read, so a cached feed stays small. */
export function slimLogs(items: GroupLog[]): unknown {
  return items.map((l: any) => ({
    id: l.id,
    uid: l.uid,
    type: l.type,
    date: l.date,
    ts: l.ts && typeof l.ts.seconds === 'number' ? { seconds: l.ts.seconds } : null,
    source: l.source ?? null,
    payload: {
      workoutType: l.payload?.workoutType ?? null,
      durationMinutes: l.payload?.durationMinutes ?? null,
      calories: l.payload?.calories ?? null,
      meal: l.payload?.meal ?? null,
      weight: l.payload?.weight ?? null,
    },
  }));
}
