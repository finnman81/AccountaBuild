import { useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMmrWeeklyHistory } from '../../services/mmrWeekly';
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

    // Look up the week that JUST ENDED by id — NOT "the latest weekly doc".
    // The current week's doc is created as soon as the new week is scored
    // (every-6h compute, or the live settler on the first log), so "latest"
    // is almost always the in-progress week. The old code compared that to
    // last week's id and bailed every time: the story never once auto-opened
    // in production. Verified across all members 2026-07-20.
    return subscribeMmrWeeklyHistory(uid, 4, (weeks) => {
      if (!weeks || firedRef.current) return;

      const now = new Date();
      const dow = now.getDay(); // 0=Sun … 6=Sat (device-local; a soft nicety, not a scoring boundary)
      const inWindow = dow >= 1 && dow <= 3; // Mon-Wed
      if (!inWindow) return;

      const lastWeekId = prevIsoWeekId(isoWeekIdInTz(now, DEFAULT_TZ), DEFAULT_TZ);
      const summary = weeks.find((w) => w.weekId === lastWeekId);
      if (!summary) return; // last week not scored yet — try again on the next snapshot

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
