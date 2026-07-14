import { useContext, useEffect } from 'react';

import { AuthContext } from '../store/AuthContext';
import { subscribeUnreadActivityCount } from '../services/activity';
import { setBadgeCount, clearBadge } from '../services/notifications';

/**
 * The home-screen badge mirrors the UNREAD ACTIVITY count (cheers, nudges,
 * rank changes) — the same number as the in-app bell. Opening Activity marks
 * items read, which drops the badge to 0.
 *
 * The old version set a hardcoded "1" after the first reminder time if it
 * couldn't find a log in users/{uid}/workouts — a subcollection manual logs
 * never write to — so iPhones showed a phantom "1" almost permanently.
 */
export function useNotificationBadge() {
  const { user } = useContext(AuthContext);

  useEffect(() => {
    if (!user?.uid) {
      void clearBadge();
      return;
    }
    return subscribeUnreadActivityCount(user.uid, (count) => {
      void setBadgeCount(count).catch(() => {});
    });
  }, [user?.uid]);
}
