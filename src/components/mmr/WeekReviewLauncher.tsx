import { useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMmrWeeklyHistory } from '../../services/mmrWeekly';
import { navigateToWeekReview } from '../../navigation/navigationRef';
import { DEFAULT_TZ, isoWeekIdInTz, prevIsoWeekId } from '../../mmr/time';

/**
 * Written by WeekReviewScreen when the report actually RENDERS — the launcher
 * only trusts that. Its old private "seen" marker was written optimistically
 * BEFORE navigating, so one silently-failed navigate blocked the report for
 * the whole week with no way back (suspected on-device 2026-07-20).
 */
export const SHOWN_KEY_PREFIX = 'weekReviewShown';

/**
 * Auto-opens the weekly report ONCE per week: the first time the user
 * launches the app after the week rolls over (Mon-Wed window, so a skipped
 * Monday still gets it but a Saturday open doesn't surface a stale recap).
 *
 * Navigation goes through navigationRef's ready-queue (same path as push
 * taps) — NOT a component-hook navigate, which can no-op during startup.
 * If the report never renders, nothing is marked and the next open retries.
 * Renders nothing.
 */
export default function WeekReviewLauncher() {
  const { user } = useContext(AuthContext);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    // Look the just-ended week up BY ID — never "the latest weekly doc"; the
    // in-progress week's doc exists as soon as the new week is scored, which
    // is what kept this from ever firing before 2026-07-20.
    return subscribeMmrWeeklyHistory(uid, 4, (weeks) => {
      if (!weeks || firedRef.current) return;

      const now = new Date();
      const dow = now.getDay(); // 0=Sun … 6=Sat (device-local; a soft nicety, not a scoring boundary)
      const inWindow = dow >= 1 && dow <= 3; // Mon-Wed
      if (!inWindow) return;

      const lastWeekId = prevIsoWeekId(isoWeekIdInTz(now, DEFAULT_TZ), DEFAULT_TZ);
      const summary = weeks.find((w) => w.weekId === lastWeekId);
      if (!summary) return; // last week not scored yet — retry on the next snapshot

      AsyncStorage.getItem(`${SHOWN_KEY_PREFIX}:${uid}`)
        .then((shown) => {
          if (shown === summary.weekId || firedRef.current) return;
          firedRef.current = true; // once per session; the SCREEN marks per-week
          navigateToWeekReview(summary.weekId);
        })
        .catch(() => {});
    });
  }, [user?.uid]);

  return null;
}
