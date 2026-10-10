import { useEffect, useMemo, useState } from 'react';

import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeMemberLogsSince, type GroupLog } from '../services/logs';
import { DEFAULT_TZ, yyyyMmDdInTz } from '../mmr/time';

export type MyLog = GroupLog & { groupId: string };

/**
 * MY logs from EVERY group I'm in, deduped by log id (health-synced logs keep
 * the same id in each group they land in). Personal views (today's checklist,
 * the vacation prompt, "tracks this?" checks) read this, not the active
 * group's feed: a log is yours whichever group it was saved in. Before this, a
 * brand-new second group read as "nothing logged all week".
 *
 * The active group's copy wins a duplicate, so edits/deletes go there first.
 */
export function useMyLogsAllGroups(uid: string | null | undefined, lookbackDays = 14): MyLog[] {
  const { groups, activeGroupId } = useActiveGroup();
  const groupIds = useMemo(() => groups.map((g) => g.groupId).filter(Boolean).sort(), [groups]);
  const key = groupIds.join(',');
  const [byGroup, setByGroup] = useState<Record<string, GroupLog[]>>({});

  useEffect(() => {
    if (!uid || !groupIds.length) {
      setByGroup({});
      return;
    }
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);
    const sinceDate = yyyyMmDdInTz(since, DEFAULT_TZ);
    setByGroup({});
    const unsubs = groupIds.map((gid) =>
      subscribeMemberLogsSince(gid, uid, sinceDate, (logs) => setByGroup((prev) => ({ ...prev, [gid]: logs }))),
    );
    return () => unsubs.forEach((u) => u());
    // key stands in for groupIds (stable string)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key, lookbackDays]);

  return useMemo(() => {
    const out = new Map<string, MyLog>();
    const order = activeGroupId ? [activeGroupId, ...Object.keys(byGroup).filter((g) => g !== activeGroupId)] : Object.keys(byGroup);
    for (const gid of order) {
      for (const l of byGroup[gid] ?? []) if (!out.has(l.id)) out.set(l.id, { ...l, groupId: gid });
    }
    return [...out.values()];
  }, [byGroup, activeGroupId]);
}
