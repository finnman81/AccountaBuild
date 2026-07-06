import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';

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

    // Subscribe to real-time updates
    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        // A cache-first snapshot can briefly claim the user doc doesn't exist
        // before the server responds, which flashed the onboarding welcome at
        // returning users. Stay in "loading" until we have real data.
        if (!snap.exists() && snap.metadata.fromCache) return;
        if (snap.exists()) {
          const data = snap.data();
          const onboarding = (data.onboarding as OnboardingData | undefined) ?? { completed: false };
          const seenCurrentVersion = (onboarding.version ?? 1) >= CURRENT_ONBOARDING_VERSION;
          setIsCompleted(onboarding.completed === true && seenCurrentVersion);
        } else {
          setIsCompleted(false);
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('[Onboarding] Error checking status:', error);
        setIsCompleted(false);
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [uid]);

  return { isCompleted, isLoading };
}
