import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { Card, Divider, List, Text, useTheme } from 'react-native-paper';
import { doc, onSnapshot } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import Screen from '../components/layout/Screen';
import { AuthContext } from '../store/AuthContext';
import { db } from '../firebase/firebase';
import { subscribeGroupMemberUids } from '../services/leaderboard';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import type { HomeStackParamList } from '../navigation/types';
import type { Tier } from '../mmr/types';
import RankBadge from '../components/mmr/RankBadge';

type Props = NativeStackScreenProps<HomeStackParamList, 'Leaderboard'>;

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseYYYYMMDDLocal(dateYYYYMMDD: string) {
  return new Date(`${dateYYYYMMDD}T00:00:00`);
}

function formatYYYYMMDD(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function weekStartMondayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const offset = (day + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

type GroupDoc = { name?: string; streakRule?: 'workout' | 'any' };

const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];
function asTier(x: unknown): Tier | null {
  const s = String(x ?? '').trim();
  return (TIERS as string[]).includes(s) ? (s as Tier) : null;
}

export default function LeaderboardScreen({ route }: Props) {
  const theme = useTheme();
  const { groupId } = route.params;
  const { user } = useContext(AuthContext);

  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<GroupLog[]>([]);

  useEffect(() => onSnapshot(doc(db, 'groups', groupId), (snap) => setGroup(snap.exists() ? ((snap.data() as any) ?? null) : null)), [groupId]);
  useEffect(() => subscribeGroupMemberUids(groupId, setMemberUids), [groupId]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyCanSeeUids(user.uid, setCanSee);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const allowed = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    return subscribePublicUsers(allowed, setPublicUsers);
  }, [canSee, memberUids, user?.uid]);

  useEffect(() => {
    return subscribeGroupLogs(groupId, setLogs, undefined, 400);
  }, [groupId]);

  const rankLabelFor = useCallback(
    (uid: string) => {
      const p = publicUsers[uid] as any;
      if (!p) return '—';
      const tier = String(p?.rankTierPublic ?? '').trim();
      const div = p?.rankDivisionPublic;
      const mp = p?.mpPublic ?? p?.lpPublic; // Backward compat
      if (!tier) return '—';
      const roman = div === 1 ? 'I' : div === 2 ? 'II' : div === 3 ? 'III' : div === 4 ? 'IV' : '';
      const mpTxt = typeof mp === 'number' ? `${Math.round(mp)} MP` : null;
      return [div ? `${tier} ${roman}` : tier, mpTxt].filter(Boolean).join(' • ');
    },
    [publicUsers],
  );

  // Calculate continuous streak days (not resetting at week boundary)
  const streakDaysByUid = useMemo(() => {
    try {
      const today = formatYYYYMMDD(new Date());
      const todayDate = parseYYYYMMDDLocal(today);
      if (Number.isNaN(todayDate.valueOf())) {
        console.error('[LeaderboardScreen] Invalid today date');
        return {};
      }
      const rule = (group?.streakRule ?? 'workout') as 'workout' | 'any';
      const allowedTypes = rule === 'any' ? new Set(['workout', 'calories', 'weight', 'photo']) : new Set(['workout']);

      // Collect all dates with logs for each user
      const datesByUid: Record<string, Set<string>> = {};
      for (const l of logs) {
        if (!l || !l.uid || !l.date || !l.type) continue;
        if (!allowedTypes.has(l.type)) continue;
        try {
          const d = parseYYYYMMDDLocal(l.date);
          if (Number.isNaN(d.valueOf())) continue;
          datesByUid[l.uid] = datesByUid[l.uid] ?? new Set<string>();
          datesByUid[l.uid].add(l.date);
        } catch (err) {
          console.error('[LeaderboardScreen] Error parsing log date:', err, l);
          continue;
        }
      }

      // Calculate continuous streak going backwards from today
      const out: Record<string, number> = {};
      for (const [uid, dateSet] of Object.entries(datesByUid)) {
        if (!uid || !dateSet) continue;
        try {
          let streak = 0;
          let currentDate = new Date(todayDate);
          
          // Count backwards day by day until we hit a gap (limit to prevent infinite loops)
          let maxDays = 365; // Safety limit
          while (maxDays > 0) {
            const dateStr = formatYYYYMMDD(currentDate);
            if (dateSet.has(dateStr)) {
              streak++;
              // Move to previous day
              currentDate.setDate(currentDate.getDate() - 1);
              maxDays--;
            } else {
              // Found a gap, streak ends
              break;
            }
          }
          
          out[uid] = streak;
        } catch (err) {
          console.error('[LeaderboardScreen] Error calculating streak for uid:', uid, err);
          out[uid] = 0;
        }
      }
      
      return out;
    } catch (err) {
      console.error('[LeaderboardScreen] Error calculating streakDaysByUid:', err);
      return {};
    }
  }, [group?.streakRule, logs]);

  const rows = useMemo(() => {
    if (!user?.uid) return [];
    const allowed = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    const items = allowed
      .map((uid) => {
        const p = publicUsers[uid];
        // Skip if user data is not available yet
        if (!p) return null;
        const name = friendlyNameFromDisplayName(p?.displayName ?? null, uid);
        const mmr = typeof (p as any)?.mmrPublic === 'number' ? Number((p as any).mmrPublic) : null;
        const tier = asTier((p as any)?.rankTierPublic);
        const streakDays = streakDaysByUid[uid] ?? 0;
        return { uid, name, mmr, tier, rankLabel: rankLabelFor(uid), photoURL: p?.photoURL ?? null, streakDays };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    items.sort((a, b) => {
      const am = a.mmr ?? -1;
      const bm = b.mmr ?? -1;
      if (bm !== am) return bm - am;
      return a.name.localeCompare(b.name);
    });

    return items;
  }, [canSee, memberUids, publicUsers, streakDaysByUid, user?.uid, rankLabelFor]);

  const UserAvatar = useCallback(
    ({ uid, url, size = 40 }: { uid: string; url: string | null; size?: number }) => {
      if (url) {
        return (
          <Image
            source={{ uri: url }}
            style={{ width: size, height: size, borderRadius: 12, backgroundColor: theme.colors.surfaceVariant }}
            resizeMode="cover"
          />
        );
      }
      const p = publicUsers[uid];
      const initials = friendlyNameFromDisplayName(p?.displayName ?? null, uid)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase();
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: 12,
            backgroundColor: theme.colors.surfaceVariant,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text variant="titleMedium">{(initials || 'U').slice(0, 2)}</Text>
        </View>
      );
    },
    [publicUsers, theme.colors.surfaceVariant],
  );

  if (!user) {
    return (
      <Screen>
        <Text>You must be signed in.</Text>
      </Screen>
    );
  }

  const groupName = group?.name ?? 'Group';
  const rule = (group?.streakRule ?? 'workout') as 'workout' | 'any';

  return (
    <Screen>
      <Card>
        <Card.Title title="Leaderboard" subtitle={groupName} />
        <Card.Content>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Sorted by MMR (global). Streak days are based on this group ({rule === 'any' ? 'any log' : 'workouts only'}).
          </Text>
        </Card.Content>
        <Divider />
        {rows.length === 0 ? (
          <Card.Content>
            <Text>No members yet.</Text>
          </Card.Content>
        ) : (
          rows
            .filter((r) => r && r.uid && r.name) // Safety filter
            .map((r, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
              const streakDays = typeof r.streakDays === 'number' ? r.streakDays : 0;
              const streakLabel = streakDays > 0 ? `🔥 ${streakDays}-day streak` : `😢 ${streakDays}-day streak`;
              return (
                <List.Item
                  key={r.uid}
                  title={`${idx + 1}. ${medal ? `${medal} ` : ''}${r.name}${r.uid === user.uid ? ' (Me)' : ''}`}
                  description={[
                    `Rank: ${r.rankLabel || '—'}`,
                    `MMR: ${r.mmr == null ? '—' : Math.round(r.mmr)}`,
                    streakLabel,
                  ].join('\n')}
                  left={() => (
                    <View style={{ marginLeft: 8, justifyContent: 'center' }}>
                      <UserAvatar uid={r.uid} url={r.photoURL} size={36} />
                    </View>
                  )}
                  right={() => (r.tier ? <RankBadge tier={r.tier} size={54} /> : null)}
                />
              );
            })
        )}
      </Card>
    </Screen>
  );
}

