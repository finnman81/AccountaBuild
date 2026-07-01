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
        if (snap.exists()) {
          const data = snap.data();
          const onboarding = (data.onboarding as OnboardingData | undefined) ?? { completed: false };
          setIsCompleted(onboarding.completed === true);
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
