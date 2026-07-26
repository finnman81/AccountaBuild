import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';
import { doc, onSnapshot } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../store/AuthContext';
import { db } from '../firebase/firebase';
import { subscribeGroupMemberUids } from '../services/leaderboard';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';
import { buildLeaderboard, type LeaderboardRow } from '../viewmodels/leaderboard';
import { DEFAULT_TZ, isoWeekIdInTz } from '../mmr/time';
import { recomputeMyMmr } from '../services/mmrRecompute';
import { fetchGroupWeekDeltas } from '../services/publicUsers';
import { getHydrated, setHydrated } from '../services/hydrationCache';
import SegmentedControl from '../components/ui/SegmentedControl';
import { todayYYYYMMDD } from '../utils/dates';
import AppText from '../components/ui/AppText';
import Avatar from '../components/ui/Avatar';
import RankEmblem from '../components/ui/RankEmblem';
import type { HomeStackParamList, RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'Leaderboard'>;

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

function mmrText(mmr: number | null): string {
  return mmr == null ? '—' : Math.round(mmr).toLocaleString();
}

function PodiumColumn({ row, place, onPress, valueLabel }: { row?: LeaderboardRow; place: 1 | 2 | 3; onPress: () => void; valueLabel?: string }) {
  const height = place === 1 ? 78 : place === 2 ? 54 : 40;
  const avatarSize = place === 1 ? 64 : 56;
  if (!row) return <View style={styles.podiumCol} />;
  return (
    <TouchableOpacity style={styles.podiumCol} activeOpacity={0.85} onPress={onPress}>
      <Avatar photoURL={row.photoURL} name={row.name} size={avatarSize} status={place === 1 ? 'streakLeader' : undefined} />
      <AppText variant="rowSubtitle" color="primary" numberOfLines={1} style={styles.podiumName}>{row.name}</AppText>
      <View style={styles.podiumMmr}>
        {row.tier ? <RankEmblem tier={row.tier} inline size={12} /> : null}
        <AppText variant="rowSubtitle" color="secondary">{valueLabel ?? mmrText(row.mmr)}</AppText>
      </View>
      <View style={[styles.pedestal, { height }, place === 1 && styles.pedestalGold]}>
        <AppText
          variant="statBig"
          style={[styles.pedestalNum, place === 1 && styles.pedestalNumGold, row.isTied && styles.pedestalNumTied]}
        >
          {row.isTied ? `T-${row.rank}` : row.rank}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

export default function LeaderboardScreen({ route }: Props) {
  const { groupId } = route.params;
  const { user } = useContext(AuthContext);
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParamList & RootStackParamList>>();

  // Seed from the same hydration cache Today writes — the podium/rows paint
  // last-known ranks instantly instead of blocking ~3.5s on the network.
  const [group, setGroup] = useState<{ name?: string; streakRule?: 'workout' | 'any' } | null>(() => getHydrated(`group:${groupId}`) ?? null);
  const [memberUids, setMemberUids] = useState<string[]>(() => getHydrated<string[]>(`members:${groupId}`) ?? []);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>(() => getHydrated<Record<string, PublicUser>>(`publicUsers:${groupId}`) ?? {});
  const [canSee, setCanSee] = useState<Set<string>>(() => new Set(user?.uid ? getHydrated<string[]>(`canSee:${user.uid}`) ?? [] : []));
  const [logs, setLogs] = useState<GroupLog[]>([]);

  useEffect(() => onSnapshot(doc(db, 'groups', groupId), (s) => {
    if (!s.exists()) { setGroup(null); return; }
    const g = (s.data() as any) ?? null;
    setGroup(g);
    if (g) setHydrated(`group:${groupId}`, { ...g, logoURL: g.logoURL ?? g.logoUrl ?? null });
  }), [groupId]);
  useEffect(() => subscribeGroupMemberUids(groupId, (uids) => { setMemberUids(uids); setHydrated(`members:${groupId}`, uids); }), [groupId]);
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyCanSeeUids(user.uid, (s) => { setCanSee(s); setHydrated(`canSee:${user.uid}`, Array.from(s)); });
  }, [user?.uid]);
  useEffect(() => {
    if (!user?.uid) return;
    const allowed = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    return subscribePublicUsers(allowed, (map) => { setPublicUsers(map); setHydrated(`publicUsers:${groupId}`, map); });
  }, [canSee, memberUids, user?.uid, groupId]);
  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 400), [groupId]);

  const { rows, gapToTop, rival, chaser } = useMemo(() => {
    if (!user?.uid) return { rows: [] as LeaderboardRow[], gapToTop: null, rival: null, chaser: null };
    return buildLeaderboard({
      memberUids,
      publicUsers,
      canSee,
      myUid: user.uid,
      logs,
      today: todayYYYYMMDD(),
      streakRule: (group?.streakRule ?? 'workout') as 'workout' | 'any',
      pastCutoff: new Date().getHours() >= 18,
      currentWeekId: isoWeekIdInTz(new Date(), DEFAULT_TZ),
    });
  }, [memberUids, publicUsers, canSee, user?.uid, logs, group?.streakRule]);

  // WEEKLY-FIRST (2026-07-21): the default board is this week's FP race —
  // everyone re-enters at 0 each Monday, so late joiners compete immediately
  // instead of staring up at months of tenure. All-time stays one tap away.
  const [board, setBoard] = useState<'week' | 'alltime'>('week');
  const weekId = isoWeekIdInTz(new Date(), DEFAULT_TZ);
  const [weekDeltas, setWeekDeltas] = useState<Record<string, number>>(
    () => getHydrated<Record<string, number>>(`weekDeltas:${groupId}:${weekId}`) ?? {},
  );
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetchGroupWeekDeltas(groupId, weekId)
        .then((rws) => {
          if (cancelled) return;
          const map = Object.fromEntries(rws.map((r) => [r.uid, r.delta]));
          setWeekDeltas(map);
          setHydrated(`weekDeltas:${groupId}:${weekId}`, map);
        })
        .catch(() => {});
    }, 1200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [groupId, weekId, logs.length]);

  const displayRows = useMemo(() => {
    if (board !== 'week') return rows;
    // Re-rank the all-time rows (they carry avatar/streak/vacation state) by
    // this week's earned FP, standard competition ranking, ties broken by name.
    const keyed = rows.map((r) => ({ ...r, weekDelta: Math.round(weekDeltas[r.uid] ?? 0) }));
    keyed.sort((a, b) => b.weekDelta - a.weekDelta || a.name.localeCompare(b.name));
    const ranks: number[] = keyed.map((r, i) => (i > 0 && r.weekDelta === keyed[i - 1]!.weekDelta ? -1 : i + 1));
    for (let i = 0; i < ranks.length; i += 1) if (ranks[i] === -1) ranks[i] = ranks[i - 1]!;
    return keyed.map((r, i) => ({
      ...r,
      rank: ranks[i]!,
      isTied: (i > 0 && ranks[i] === ranks[i - 1]) || (i < ranks.length - 1 && ranks[i] === ranks[i + 1]),
      movement: null, // week-over-week arrows are an all-time concept
    }));
  }, [rows, board, weekDeltas]);

  const valueText = (r: LeaderboardRow & { weekDelta?: number }) =>
    board === 'week' ? `+${r.weekDelta ?? 0} FP` : mmrText(r.mmr);

  const podium = displayRows.slice(0, 3);
  const listRows = displayRows.slice(3);
  // Coach card: chase the person directly ahead (actionable) rather than #1.
  // Fall back to gap-to-#1, then to "hold your lead" when I'm on top.
  const coach: { eyebrow: string; title: string } | null = rival
    ? { eyebrow: `Catch ${rival.name}`, title: `${rival.gap.toLocaleString()} FP to overtake` }
    : chaser
      ? { eyebrow: 'You lead the pack', title: chaser.lead > 0 ? `+${chaser.lead.toLocaleString()} FP over ${chaser.name}` : `Neck-and-neck with ${chaser.name}` }
      : gapToTop != null
        ? { eyebrow: 'Your gap to #1', title: `${gapToTop.toLocaleString()} FP · ~${Math.max(1, Math.ceil(gapToTop / 80))} strong week${Math.max(1, Math.ceil(gapToTop / 80)) === 1 ? '' : 's'}` }
        : null;

  const openMember = (uid: string) => nav.navigate('MemberDetail' as any, { groupId, uid } as any);

  // Pull-to-refresh: resettle my FP + refetch the one-shot week deltas (the
  // roster/rank listeners are already live). Same recipe as Today.
  const [refreshing, setRefreshing] = useState(false);
  const onPullRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await recomputeMyMmr('week').catch(() => {});
      const rws = await fetchGroupWeekDeltas(groupId, weekId);
      const map = Object.fromEntries(rws.map((r) => [r.uid, r.delta]));
      setWeekDeltas(map);
      setHydrated(`weekDeltas:${groupId}:${weekId}`, map);
    } catch {
      /* live listeners keep the board honest */
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>Leaderboard</AppText>
        <AppText variant="eyebrow" color="muted" numberOfLines={1} style={styles.headerRight}>{group?.name ?? ''}</AppText>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onPullRefresh()} tintColor={colors.textSecondary} />}
      >
        {rows.length === 0 ? (
          <AppText variant="body" color="secondary" style={{ textAlign: 'center', marginTop: spacing.xxl }}>No ranked members yet.</AppText>
        ) : (
          <>
            <SegmentedControl
              value={board}
              onChange={(v) => setBoard(v as 'week' | 'alltime')}
              options={[
                { value: 'week', label: 'This Week' },
                { value: 'alltime', label: 'All-Time' },
              ]}
              style={{ marginBottom: 16 }}
            />
            <View style={styles.podium}>
              <PodiumColumn row={podium[1]} place={2} onPress={() => podium[1] && openMember(podium[1].uid)} valueLabel={podium[1] ? valueText(podium[1]) : undefined} />
              <PodiumColumn row={podium[0]} place={1} onPress={() => podium[0] && openMember(podium[0].uid)} valueLabel={podium[0] ? valueText(podium[0]) : undefined} />
              <PodiumColumn row={podium[2]} place={3} onPress={() => podium[2] && openMember(podium[2].uid)} valueLabel={podium[2] ? valueText(podium[2]) : undefined} />
            </View>

            {listRows.length > 0 && (
              <View style={styles.list}>
                {listRows.map((r) => (
                  <TouchableOpacity key={r.uid} style={[styles.row, r.isMe && styles.rowMe]} activeOpacity={0.85} onPress={() => openMember(r.uid)}>
                    <AppText variant="rowSubtitle" color="muted" style={styles.rank}>{r.isTied ? `T-${r.rank}` : r.rank}</AppText>
                    <Avatar photoURL={r.photoURL} name={r.name} size={34} />
                    <View style={styles.rowInfo}>
                      <AppText variant="rowTitle" color={r.isMe ? 'accent' : 'primary'} numberOfLines={1}>{r.onVacation ? `${r.name} 🏖️` : r.name}</AppText>
                      <AppText variant="rowSubtitle" color="muted">
                        {r.tier ? `${r.tier}${r.division ? ` ${ROMAN[r.division]}` : ''}` : 'Unranked'}
                        {r.streakDays > 0 ? ` · ${r.streakDays}d` : ''}
                      </AppText>
                    </View>
                    {r.atRisk ? (
                      <View style={styles.riskTag}><AppText variant="eyebrow" style={styles.riskText}>AT RISK</AppText></View>
                    ) : null}
                    {r.movement && r.movement !== 'same' ? (
                      <Icon source={r.movement === 'up' ? 'arrow-up' : 'arrow-down'} size={16} color={r.movement === 'up' ? colors.success : colors.danger} />
                    ) : null}
                    <AppText variant="rowTitle" color="primary" style={styles.rowMmr}>{valueText(r)}</AppText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {coach && board === 'alltime' && (
              <View style={styles.coachCard}>
                <View style={{ flex: 1 }}>
                  <AppText variant="eyebrow" color="accent">{coach.eyebrow}</AppText>
                  <AppText variant="rowTitle" color="primary" style={{ marginTop: 2 }}>
                    {coach.title}
                  </AppText>
                </View>
                <TouchableOpacity style={styles.planPill} activeOpacity={0.85} onPress={() => nav.navigate('MMRGoals' as any)}>
                  <AppText variant="rowSubtitle" color="primary">Plan it</AppText>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', flex: 1 },
  headerRight: { maxWidth: 120, textAlign: 'right' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xl },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumName: { marginTop: spacing.sm, maxWidth: '100%' },
  podiumMmr: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, marginBottom: spacing.sm },
  pedestal: { alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  pedestalGold: { backgroundColor: 'rgba(233,181,66,0.14)', borderWidth: 1, borderColor: 'rgba(233,181,66,0.4)' },
  pedestalNum: { color: colors.textSecondary },
  pedestalNumGold: { color: colors.rankGold },
  pedestalNumTied: { fontSize: 22 },

  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.borderCard,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  rowMe: { borderColor: 'rgba(62,139,255,0.35)' },
  rank: { width: 26, textAlign: 'center' },
  rowInfo: { flex: 1, gap: 2 },
  rowMmr: { minWidth: 48, textAlign: 'right' },
  riskTag: { backgroundColor: colors.dangerTint, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  riskText: { color: colors.danger, fontSize: 9 },

  coachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(62,139,255,0.35)',
    padding: spacing.base,
  },
  planPill: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
});
