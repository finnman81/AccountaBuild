import React, { useContext, useEffect, useMemo, useState } from 'react';
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

function weekStartSundayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
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

  const rankLabelFor = (uid: string) => {
    const p = publicUsers[uid] as any;
    const tier = String(p?.rankTierPublic ?? '').trim();
    const div = p?.rankDivisionPublic;
    const mp = p?.mpPublic ?? p?.lpPublic; // Backward compat
    if (!tier) return '—';
    const roman = div === 1 ? 'I' : div === 2 ? 'II' : div === 3 ? 'III' : div === 4 ? 'IV' : '';
    const mpTxt = typeof mp === 'number' ? `${Math.round(mp)} MP` : null;
    return [div ? `${tier} ${roman}` : tier, mpTxt].filter(Boolean).join(' • ');
  };

  const streakDaysThisWeekByUid = useMemo(() => {
    const weekStart = weekStartSundayLocal();
    const rule = (group?.streakRule ?? 'workout') as 'workout' | 'any';
    const allowedTypes = rule === 'any' ? new Set(['workout', 'calories', 'weight', 'photo']) : new Set(['workout']);

    const datesByUid: Record<string, Set<string>> = {};
    for (const l of logs) {
      if (!allowedTypes.has(l.type)) continue;
      const d = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(d.valueOf()) || d < weekStart) continue;
      datesByUid[l.uid] = datesByUid[l.uid] ?? new Set<string>();
      datesByUid[l.uid].add(l.date);
    }
    const out: Record<string, number> = {};
    for (const [uid, set] of Object.entries(datesByUid)) out[uid] = set.size;
    return out;
  }, [group?.streakRule, logs]);

  const rows = useMemo(() => {
    if (!user?.uid) return [];
    const allowed = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    const items = allowed.map((uid) => {
      const p = publicUsers[uid];
      const name = friendlyNameFromDisplayName(p?.displayName ?? null, uid);
      const mmr = typeof (p as any)?.mmrPublic === 'number' ? Number((p as any).mmrPublic) : null;
      const tier = asTier((p as any)?.rankTierPublic);
      const streakDays = streakDaysThisWeekByUid[uid] ?? 0;
      return { uid, name, mmr, tier, rankLabel: rankLabelFor(uid), photoURL: p?.photoURL ?? null, streakDays };
    });

    items.sort((a, b) => {
      const am = a.mmr ?? -1;
      const bm = b.mmr ?? -1;
      if (bm !== am) return bm - am;
      return a.name.localeCompare(b.name);
    });

    return items;
  }, [canSee, memberUids, publicUsers, streakDaysThisWeekByUid, user?.uid]);

  const UserAvatar = ({ uid, url, size = 40 }: { uid: string; url: string | null; size?: number }) => {
    if (url) {
      return (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: 12, backgroundColor: theme.colors.surfaceVariant }}
          resizeMode="cover"
        />
      );
    }
    const initials = friendlyNameFromDisplayName(publicUsers[uid]?.displayName ?? null, uid)
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
  };

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
          rows.map((r, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
            const streakLabel = r.streakDays > 0 ? `🔥 ${r.streakDays}-day streak` : `😢 ${r.streakDays}-day streak`;
            return (
              <List.Item
                key={r.uid}
                title={`${idx + 1}. ${medal ? `${medal} ` : ''}${r.name}${r.uid === user.uid ? ' (Me)' : ''}`}
                description={[
                  `Rank: ${r.rankLabel}`,
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

