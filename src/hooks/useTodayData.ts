import { useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeGroupMemberUids } from '../services/leaderboard';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';
import { getHydrated, setHydrated } from '../services/hydrationCache';

export type TodayGroup = { name?: string; logoURL?: string | null; streakRule?: 'workout' | 'any' } | null;
export type TodayProfile = { displayName?: string | null; dailyCalorieGoal?: number | null } | null;

/**
 * All subscriptions the Today screen needs, scoped to the active group.
 *
 * Cache-then-network (2026-07-21): every piece except the raw logs seeds its
 * initial state SYNCHRONOUSLY from the hydration cache and writes each live
 * update back. So the screen paints last-known name/group/roster/ranks
 * immediately instead of blocking ~6s on the network, then refreshes in place.
 * Logs are intentionally uncached (Firestore Timestamps don't round-trip and
 * volume is unbounded); they stream in a beat after the shell is already up.
 */
export function useTodayData() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const uid = user?.uid ?? '';

  const [group, setGroup] = useState<TodayGroup>(() => (activeGroupId ? getHydrated<TodayGroup>(`group:${activeGroupId}`) ?? null : null));
  const [memberUids, setMemberUids] = useState<string[]>(() => (activeGroupId ? getHydrated<string[]>(`members:${activeGroupId}`) ?? [] : []));
  const [canSee, setCanSee] = useState<Set<string>>(() => new Set(uid ? getHydrated<string[]>(`canSee:${uid}`) ?? [] : []));
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>(() => (activeGroupId ? getHydrated<Record<string, PublicUser>>(`publicUsers:${activeGroupId}`) ?? {} : {}));
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [myProfile, setMyProfile] = useState<TodayProfile>(() => (uid ? getHydrated<TodayProfile>(`profile:${uid}`) ?? null : null));

  useEffect(() => {
    if (!activeGroupId) {
      setGroup(null);
      return;
    }
    // Re-seed from cache on group switch so the header never flashes empty.
    setGroup(getHydrated<TodayGroup>(`group:${activeGroupId}`) ?? null);
    return onSnapshot(doc(db, 'groups', activeGroupId), (snap) => {
      if (!snap.exists()) {
        setGroup(null);
        return;
      }
      const data = (snap.data() as any) ?? {};
      // Group docs store `logoUrl`; normalize to the `logoURL` this hook exposes.
      const g = { ...data, logoURL: data.logoURL ?? data.logoUrl ?? null };
      setGroup(g);
      setHydrated(`group:${activeGroupId}`, g);
    });
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setMemberUids([]);
      return;
    }
    setMemberUids(getHydrated<string[]>(`members:${activeGroupId}`) ?? []);
    return subscribeGroupMemberUids(activeGroupId, (uids) => {
      setMemberUids(uids);
      setHydrated(`members:${activeGroupId}`, uids);
    });
  }, [activeGroupId]);

  useEffect(() => {
    if (!user?.uid) return;
    setCanSee(new Set(getHydrated<string[]>(`canSee:${user.uid}`) ?? []));
    return subscribeMyCanSeeUids(user.uid, (s) => {
      setCanSee(s);
      setHydrated(`canSee:${user.uid}`, Array.from(s));
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !activeGroupId) return;
    const allowed = memberUids.filter((m) => m === user.uid || canSee.has(m));
    return subscribePublicUsers(allowed, (map) => {
      setPublicUsers(map);
      setHydrated(`publicUsers:${activeGroupId}`, map);
    });
  }, [memberUids, canSee, user?.uid, activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setLogs([]);
      return;
    }
    return subscribeGroupLogs(activeGroupId, setLogs, undefined, 300);
  }, [activeGroupId]);

  useEffect(() => {
    if (!user?.uid) {
      setMyProfile(null);
      return;
    }
    setMyProfile(getHydrated<TodayProfile>(`profile:${user.uid}`) ?? null);
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const p = snap.exists() ? ((snap.data() as any) ?? null) : null;
      setMyProfile(p);
      if (p) setHydrated(`profile:${user.uid}`, { displayName: p.displayName ?? null, dailyCalorieGoal: p.dailyCalorieGoal ?? null });
    });
  }, [user?.uid]);

  return { user, activeGroupId, group, memberUids, canSee, publicUsers, logs, myProfile };
}
