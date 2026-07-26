import { useContext, useEffect, useRef } from 'react';

import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { subscribeLogsChanged } from '../../services/fpEvents';
import { computeAndMirrorMyStreak } from '../../services/streakMirror';

/**
 * Keeps publicUsers.streakDaysPublic (the accurate self-streak) fresh: once on
 * app open, then after any log change. Same debounce/serialize shape as
 * MmrLiveSettler. Display-only mirror — failures are silently dropped.
 */
const DEBOUNCE_MS = 5000;

export default function StreakMirror() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    if (!user?.uid || !activeGroupId) return;
    const uid = user.uid;
    const groupId = activeGroupId;

    const run = async () => {
      if (running.current) {
        pending.current = true;
        return;
      }
      running.current = true;
      await computeAndMirrorMyStreak(uid, groupId);
      running.current = false;
      if (pending.current) {
        pending.current = false;
        void run();
      }
    };

    void run(); // app open / group switch

    const unsub = subscribeLogsChanged(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user?.uid, activeGroupId]);

  return null;
}
