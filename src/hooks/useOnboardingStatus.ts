import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase/firebase';

/** Per-user, per-version local "onboarding done" flag key. */
export const onboardingLocalKey = (uid: string) => `onboardingComplete:${uid}:v${CURRENT_ONBOARDING_VERSION}`;

export type OnboardingData = {
  version?: number;
  completed: boolean;
  startedAt?: any; // Timestamp
  completedAt?: any; // Timestamp
  lastStep?: number;
};

/**
 * Bump this whenever onboarding changes enough that EVERY user — new or
 * returning — should see it again (e.g. the Midnight Blue redesign + intent
 * picker). Users whose stored `onboarding.version` is below this are routed
 * back through onboarding on next launch; completing it re-stamps the current
 * version, so it only shows once per bump. No backend migration needed.
 */
export const CURRENT_ONBOARDING_VERSION = 2;

export function useOnboardingStatus(uid: string | null): { isCompleted: boolean; isLoading: boolean } {
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!uid || !db) {
      setIsCompleted(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const localKey = onboardingLocalKey(uid);

    // Optimistically trust a persisted local completion. Once a user finishes
    // onboarding on this device we never want a cold-start cache miss (a cached
    // user doc that predates the completion write) to flash the welcome screen
    // and re-trap them. The server snapshot below stays the source of truth.
    AsyncStorage.getItem(localKey)
      .then((v) => {
        if (!cancelled && v === 'true') {
          setIsCompleted(true);
          setIsLoading(false);
        }
      })
      .catch(() => {});

    // Subscribe to real-time updates
    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        // A cache-first snapshot can briefly claim the user doc doesn't exist
        // before the server responds, which flashed the onboarding welcome at
        // returning users. Stay in "loading" until we have real data.
        if (!snap.exists() && snap.metadata.fromCache) return;

        let completed = false;
        if (snap.exists()) {
          const data = snap.data();
          const onboarding = (data.onboarding as OnboardingData | undefined) ?? { completed: false };
          const seenCurrentVersion = (onboarding.version ?? 1) >= CURRENT_ONBOARDING_VERSION;
          completed = onboarding.completed === true && seenCurrentVersion;
        }

        if (completed) {
          setIsCompleted(true);
          AsyncStorage.setItem(localKey, 'true').catch(() => {});
        } else if (!snap.metadata.fromCache) {
          // Only a confirmed SERVER read may send a user (back) into onboarding —
          // a stale cache snapshot must never downgrade a completed user.
          setIsCompleted(false);
          AsyncStorage.removeItem(localKey).catch(() => {});
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('[Onboarding] Error checking status:', error);
        setIsLoading(false);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid]);

  return { isCompleted, isLoading };
}
