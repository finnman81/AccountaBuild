import { useEffect, useMemo, useState } from 'react';

import { subscribeGroupMemberUids } from '../services/leaderboard';
import { subscribeGroupLogsSince, daysAgoYYYYMMDD, type GroupLog } from '../services/logs';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { buildGroupOverview, type GroupOverview } from '../viewmodels/groups';
import { getHydrated, setHydrated } from '../services/hydrationCache';
import { slimLogs } from './useCached';
import { DEFAULT_TZ, isoWeekDatesInTz, isoWeekIdInTz, yyyyMmDdInTz } from '../mmr/time';

/**
 * Live overview (weekly compliance, today's logged count, my stake) for each of
 * the user's groups. Subscribes per group to members + recent logs, plus one
 * union subscription for public-user names/photos, then derives each card's
 * numbers. Note: streak/compliance treat any log type as a "log" (per-group
 * streakRule nuance is not read here).
 */
export function useGroupsOverview(groupIds: string[], myUid: string | undefined): Record<string, GroupOverview> {
  const [membersByGroup, setMembersByGroup] = useState<Record<string, string[]>>({});
  const [logsByGroup, setLogsByGroup] = useState<Record<string, GroupLog[]>>({});
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});

  const idsKey = groupIds.slice().sort().join(',');

  useEffect(() => {
    if (!groupIds.length) {
      setMembersByGroup({});
      setLogsByGroup({});
      return;
    }
    // Paint each card from its last-known members/logs, then go live.
    const seedM: Record<string, string[]> = {};
    const seedL: Record<string, GroupLog[]> = {};
    for (const gid of groupIds) {
      const m = getHydrated<string[]>(`ovMembers:${gid}`);
      const l = getHydrated<GroupLog[]>(`ovLogs:${gid}`);
      if (m) seedM[gid] = m;
      if (l) seedL[gid] = l;
    }
    setMembersByGroup(seedM);
    setLogsByGroup(seedL);
    const unsubs: Array<() => void> = [];
    for (const gid of groupIds) {
      unsubs.push(
        subscribeGroupMemberUids(gid, (uids) => {
          setMembersByGroup((prev) => ({ ...prev, [gid]: uids }));
          setHydrated(`ovMembers:${gid}`, uids);
        }),
      );
      unsubs.push(
        subscribeGroupLogsSince(gid, daysAgoYYYYMMDD(14), (l) => {
          setLogsByGroup((prev) => ({ ...prev, [gid]: l }));
          setHydrated(`ovLogs:${gid}`, slimLogs(l));
        }),
      );
    }
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const allUids = useMemo(() => {
    const s = new Set<string>();
    Object.values(membersByGroup).forEach((list) => list.forEach((u) => s.add(u)));
    if (myUid) s.add(myUid);
    return Array.from(s).sort();
  }, [membersByGroup, myUid]);
  const allKey = allUids.join(',');

  useEffect(() => {
    if (!allUids.length) {
      setPublicUsers({});
      return;
    }
    setPublicUsers(getHydrated<Record<string, PublicUser>>(`ovPub:${allKey}`) ?? {});
    return subscribePublicUsers(allUids, (map) => {
      setPublicUsers(map);
      setHydrated(`ovPub:${allKey}`, map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allKey]);

  return useMemo(() => {
    const today = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
    const weekDates = isoWeekDatesInTz(isoWeekIdInTz(new Date(), DEFAULT_TZ), DEFAULT_TZ);
    const elapsedDates = weekDates.filter((d) => d <= today);

    const out: Record<string, GroupOverview> = {};
    for (const gid of groupIds) {
      out[gid] = buildGroupOverview({
        logs: logsByGroup[gid] ?? [],
        memberUids: membersByGroup[gid] ?? [],
        publicUsers,
        myUid: myUid ?? '',
        today,
        elapsedDates,
        streakRule: 'any',
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, membersByGroup, logsByGroup, publicUsers, myUid]);
}
