import { useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeLatestMmrWeeklySummary } from '../../services/mmrWeekly';
import { DEFAULT_TZ, isoWeekIdInTz, prevIsoWeekId } from '../../mmr/time';

const SEEN_KEY_PREFIX = 'weekReviewSeen';

/**
 * Auto-opens the "Your Week" story ONCE per week: the first time the user
 * launches the app after the week rolls over (shown Mon-Wed so a skipped
 * Monday still gets it, but a Saturday open doesn't surface a stale recap).
 * Renders nothing.
 */
export default function WeekReviewLauncher() {
  const { user } = useContext(AuthContext);
  const nav = useNavigation<any>();
  const firedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    return subscribeLatestMmrWeeklySummary(uid, (summary) => {
      if (!summary || firedRef.current) return;

      const now = new Date();
      const dow = now.getDay(); // 0=Sun … 6=Sat (device-local; a soft nicety, not a scoring boundary)
      const inWindow = dow >= 1 && dow <= 3; // Mon-Wed
      if (!inWindow) return;

      // Only the week that JUST ended qualifies — no stale recaps.
      const lastWeekId = prevIsoWeekId(isoWeekIdInTz(now, DEFAULT_TZ), DEFAULT_TZ);
      if (summary.weekId !== lastWeekId) return;

      const seenKey = `${SEEN_KEY_PREFIX}:${uid}`;
      AsyncStorage.getItem(seenKey)
        .then(async (seen) => {
          if (seen === summary.weekId || firedRef.current) return;
          firedRef.current = true;
          // Mark seen immediately: skipping the story counts as seen.
          await AsyncStorage.setItem(seenKey, summary.weekId).catch(() => {});
          nav.navigate('WeekReview', { weekId: summary.weekId });
        })
        .catch(() => {});
    });
  }, [user?.uid, nav]);

  return null;
}
