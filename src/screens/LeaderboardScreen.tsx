import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
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

function PodiumColumn({ row, place, onPress }: { row?: LeaderboardRow; place: 1 | 2 | 3; onPress: () => void }) {
  const height = place === 1 ? 78 : place === 2 ? 54 : 40;
  const avatarSize = place === 1 ? 64 : 56;
  if (!row) return <View style={styles.podiumCol} />;
  return (
    <TouchableOpacity style={styles.podiumCol} activeOpacity={0.85} onPress={onPress}>
      <Avatar photoURL={row.photoURL} name={row.name} size={avatarSize} status={place === 1 ? 'streakLeader' : undefined} />
      <AppText variant="rowSubtitle" color="primary" numberOfLines={1} style={styles.podiumName}>{row.name}</AppText>
      <View style={styles.podiumMmr}>
        {row.tier ? <RankEmblem tier={row.tier} inline size={12} /> : null}
        <AppText variant="rowSubtitle" color="secondary">{mmrText(row.mmr)}</AppText>
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

  const [group, setGroup] = useState<{ name?: string; streakRule?: 'workout' | 'any' } | null>(null);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<GroupLog[]>([]);

  useEffect(() => onSnapshot(doc(db, 'groups', groupId), (s) => setGroup(s.exists() ? ((s.data() as any) ?? null) : null)), [groupId]);
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
  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 400), [groupId]);

  const { rows, gapToTop } = useMemo(() => {
    if (!user?.uid) return { rows: [] as LeaderboardRow[], gapToTop: null };
    return buildLeaderboard({
      memberUids,
      publicUsers,
      canSee,
      myUid: user.uid,
      logs,
      today: todayYYYYMMDD(),
      streakRule: (group?.streakRule ?? 'workout') as 'workout' | 'any',
      pastCutoff: new Date().getHours() >= 18,
    });
  }, [memberUids, publicUsers, canSee, user?.uid, logs, group?.streakRule]);

  const podium = rows.slice(0, 3);
  const listRows = rows.slice(3);
  const strongWeeks = gapToTop != null ? Math.max(1, Math.ceil(gapToTop / 80)) : null;

  const openMember = (uid: string) => nav.navigate('MemberDetail' as any, { groupId, uid } as any);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>Leaderboard</AppText>
        <AppText variant="eyebrow" color="muted" numberOfLines={1} style={styles.headerRight}>{group?.name ?? ''}</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <AppText variant="body" color="secondary" style={{ textAlign: 'center', marginTop: spacing.xxl }}>No ranked members yet.</AppText>
        ) : (
          <>
            <View style={styles.podium}>
              <PodiumColumn row={podium[1]} place={2} onPress={() => podium[1] && openMember(podium[1].uid)} />
              <PodiumColumn row={podium[0]} place={1} onPress={() => podium[0] && openMember(podium[0].uid)} />
              <PodiumColumn row={podium[2]} place={3} onPress={() => podium[2] && openMember(podium[2].uid)} />
            </View>

            {listRows.length > 0 && (
              <View style={styles.list}>
                {listRows.map((r) => (
                  <TouchableOpacity key={r.uid} style={[styles.row, r.isMe && styles.rowMe]} activeOpacity={0.85} onPress={() => openMember(r.uid)}>
                    <AppText variant="rowSubtitle" color="muted" style={styles.rank}>{r.isTied ? `T-${r.rank}` : r.rank}</AppText>
                    <Avatar photoURL={r.photoURL} name={r.name} size={34} />
                    <View style={styles.rowInfo}>
                      <AppText variant="rowTitle" color={r.isMe ? 'accent' : 'primary'} numberOfLines={1}>{r.name}</AppText>
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
                    <AppText variant="rowTitle" color="primary" style={styles.rowMmr}>{mmrText(r.mmr)}</AppText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {gapToTop != null && (
              <View style={styles.coachCard}>
                <View style={{ flex: 1 }}>
                  <AppText variant="eyebrow" color="accent">Your gap to #1</AppText>
                  <AppText variant="rowTitle" color="primary" style={{ marginTop: 2 }}>
                    {gapToTop.toLocaleString()} MMR · ~{strongWeeks} strong week{strongWeeks === 1 ? '' : 's'}
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
