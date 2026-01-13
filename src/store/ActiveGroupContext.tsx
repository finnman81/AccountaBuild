import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AuthContext } from './AuthContext';
import { subscribeMyGroups, type UserGroupListItem } from '../services/groups';

type ActiveGroupContextValue = {
  activeGroupId: string | null;
  setActiveGroupId: (groupId: string | null) => Promise<void>;
  groups: UserGroupListItem[];
  isReady: boolean;
};

const ActiveGroupContext = createContext<ActiveGroupContextValue>({} as ActiveGroupContextValue);

function storageKeyFor(uid: string) {
  return `activeGroupId:${uid}`;
}

export function ActiveGroupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useContext(AuthContext);
  const [groups, setGroups] = useState<UserGroupListItem[]>([]);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setGroups([]);
    setActiveGroupIdState(null);
    setIsReady(false);
  }, [user?.uid]);

  // Subscribe to groups and reconcile activeGroupId.
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyGroups(user.uid, (items) => setGroups(items));
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    void (async () => {
      try {
        const stored = (await AsyncStorage.getItem(storageKeyFor(user.uid))) ?? null;
        setActiveGroupIdState(stored);
      } finally {
        setIsReady(true);
      }
    })();
  }, [user?.uid]);

  // Ensure activeGroupId is valid (fallback to first group if needed).
  useEffect(() => {
    if (!user?.uid || !isReady) return;
    const exists = activeGroupId && groups.some((g) => g.groupId === activeGroupId);
    if (exists) return;
    const next = groups[0]?.groupId ?? null;
    if (next === activeGroupId) return;
    void (async () => {
      setActiveGroupIdState(next);
      if (next) await AsyncStorage.setItem(storageKeyFor(user.uid), next);
      else await AsyncStorage.removeItem(storageKeyFor(user.uid));
    })();
  }, [activeGroupId, groups, isReady, user?.uid]);

  const setActiveGroupId = useCallback(
    async (groupId: string | null) => {
      if (!user?.uid) return;
      setActiveGroupIdState(groupId);
      if (groupId) await AsyncStorage.setItem(storageKeyFor(user.uid), groupId);
      else await AsyncStorage.removeItem(storageKeyFor(user.uid));
    },
    [user?.uid],
  );

  const value = useMemo<ActiveGroupContextValue>(
    () => ({ activeGroupId, setActiveGroupId, groups, isReady }),
    [activeGroupId, groups, isReady, setActiveGroupId],
  );

  return <ActiveGroupContext.Provider value={value}>{children}</ActiveGroupContext.Provider>;
}

export function useActiveGroup() {
  return useContext(ActiveGroupContext);
}

