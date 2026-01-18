import { useContext, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { AuthContext } from '../store/AuthContext';
import { db } from '../firebase/firebase';
import { yyyyMmDdInTz } from '../mmr/time';
import { getNotificationPreferences } from '../services/notificationPreferences';
import { setBadgeCount, clearBadge } from '../services/notifications';

function parseTime(timeStr: string): { hour: number; minute: number } {
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour: hour ?? 9, minute: minute ?? 0 };
}

function hasFirstNotificationPassed(firstTime: string): boolean {
  const { hour, minute } = parseTime(firstTime);
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  if (currentHour > hour) return true;
  if (currentHour === hour && currentMinute >= minute) return true;
  return false;
}

async function checkIfUserLoggedToday(uid: string): Promise<boolean> {
  try {
    const today = yyyyMmDdInTz(new Date());
    const workoutsRef = collection(db, 'users', uid, 'workouts');
    const q = query(workoutsRef, where('date', '==', today));
    const snapshot = await getDocs(q);
    return snapshot.size > 0;
  } catch (e) {
    console.error('Failed to check if user logged today:', e);
    return false;
  }
}

async function updateBadgeIfNeeded(uid: string) {
  try {
    const prefs = await getNotificationPreferences();
    if (!prefs.enabled || prefs.times.length === 0) {
      await clearBadge();
      return;
    }

    const firstTime = prefs.times[0];
    if (!firstTime) {
      await clearBadge();
      return;
    }

    // Check if first notification time has passed
    if (!hasFirstNotificationPassed(firstTime)) {
      // Too early, don't set badge yet
      await clearBadge();
      return;
    }

    // Check if user logged today
    const hasLogged = await checkIfUserLoggedToday(uid);
    if (hasLogged) {
      await clearBadge();
    } else {
      // User hasn't logged and first notification passed - set badge
      await setBadgeCount(1);
    }
  } catch (e) {
    console.error('Failed to update badge:', e);
  }
}

export function useNotificationBadge() {
  const { user } = useContext(AuthContext);

  useEffect(() => {
    if (!user?.uid) {
      void clearBadge();
      return;
    }

    // Check on mount
    void updateBadgeIfNeeded(user.uid);

    // Check when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && user?.uid) {
        void updateBadgeIfNeeded(user.uid);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user?.uid]);
}
