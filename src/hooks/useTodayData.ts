import { useContext, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeGroupMemberUids } from '../services/leaderboard';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';

export type TodayGroup = { name?: string; logoURL?: string | null; streakRule?: 'workout' | 'any' } | null;
export type TodayProfile = { displayName?: string | null; dailyCalorieGoal?: number | null } | null;

/** All subscriptions the Today screen needs, scoped to the active group. */
export function useTodayData() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();

  const [group, setGroup] = useState<TodayGroup>(null);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [myProfile, setMyProfile] = useState<TodayProfile>(null);

  useEffect(() => {
    if (!activeGroupId) {
      setGroup(null);
      return;
    }
    return onSnapshot(doc(db, 'groups', activeGroupId), (snap) => setGroup(snap.exists() ? ((snap.data() as any) ?? null) : null));
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setMemberUids([]);
      return;
    }
    return subscribeGroupMemberUids(activeGroupId, setMemberUids);
  }, [activeGroupId]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyCanSeeUids(user.uid, setCanSee);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const allowed = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    return subscribePublicUsers(allowed, setPublicUsers);
  }, [memberUids, canSee, user?.uid]);

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
    return onSnapshot(doc(db, 'users', user.uid), (snap) => setMyProfile(snap.exists() ? ((snap.data() as any) ?? null) : null));
  }, [user?.uid]);

  return { user, activeGroupId, group, memberUids, canSee, publicUsers, logs, myProfile };
}
