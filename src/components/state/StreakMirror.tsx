import { useContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { subscribeLogsChanged } from '../../services/fpEvents';
import { whenAppSettled } from '../../services/startupGate';
import { computeAndMirrorMyStreak } from '../../services/streakMirror';
import { subscribeMyProfile } from '../../services/profile';

/**
 * Keeps publicUsers.streakDaysPublic (the accurate self-streak) fresh: once on
 * app open, then after any log change, a weekly-goal change (goals feed the
 * streak), and whenever the app comes back to the front (iOS keeps the app in
 * memory for days: without this the mirror went stale and the streak fell
 * back to the 14-day feed count). Same debounce/serialize shape as
 * MmrLiveSettler. Display-only mirror — failures are silently dropped.
 */
const DEBOUNCE_MS = 5000;
const RESUME_MIN_GAP_MS = 10 * 60 * 1000;

export default function StreakMirror() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const pending = useRef(false);
  const lastRun = useRef(0);

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
      lastRun.current = Date.now();
      await computeAndMirrorMyStreak(uid, groupId);
      running.current = false;
      if (pending.current) {
        pending.current = false;
        void run();
      }
    };

    void whenAppSettled().then(() => run()); // app open / group switch, after Home's data

    const soon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, DEBOUNCE_MS);
    };
    const unsub = subscribeLogsChanged(soon);

    // Weekly goals changed: the same logs now count differently.
    let goals: string | null = null;
    const unsubProfile = subscribeMyProfile(uid, (p) => {
      const next = `${p?.workoutsPerWeek ?? ''}/${p?.logCaloriesDaysPerWeek ?? ''}/${p?.logWeightDaysPerWeek ?? ''}`;
      if (goals !== null && goals !== next) soon();
      goals = next;
    });

    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastRun.current > RESUME_MIN_GAP_MS) soon();
    });
    return () => {
      unsub();
      unsubProfile();
      appSub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user?.uid, activeGroupId]);

  return null;
}
