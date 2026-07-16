import { useContext, useEffect, useRef } from 'react';

import { AuthContext } from '../../store/AuthContext';
import { subscribeLogsChanged } from '../../services/fpEvents';
import { updateGlobalMmrForWeek } from '../../services/mmrUpdate';
import { DEFAULT_TZ, isoWeekIdInTz } from '../../mmr/time';

/**
 * Live leaderboard settle: re-run the current week's (idempotent, anchored)
 * scorer a few seconds after any log change, so YOUR banked FP / leaderboard
 * row moves within seconds of logging instead of waiting for the 6-hour
 * scheduled compute. The server run stays as the safety net (health-sync
 * imports with the app closed, offline saves, week close).
 *
 * Debounced so a burst of logs settles once; serialized so runs never overlap
 * (a save landing mid-run queues exactly one trailing re-run).
 */
const DEBOUNCE_MS = 4000;

export default function MmrLiveSettler() {
  const { user } = useContext(AuthContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    const settle = async () => {
      if (running.current) {
        pending.current = true;
        return;
      }
      running.current = true;
      try {
        await updateGlobalMmrForWeek({ uid, weekId: isoWeekIdInTz(new Date(), DEFAULT_TZ) });
      } catch {
        // Offline or racing the scheduled compute — the 6h run settles it.
      }
      running.current = false;
      if (pending.current) {
        pending.current = false;
        void settle();
      }
    };

    const unsub = subscribeLogsChanged(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void settle();
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user?.uid]);

  return null;
}
