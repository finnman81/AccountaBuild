import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { Icon, useTheme } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { RootStackParamList } from '../navigation/types';
import { subscribePublicUsers, subscribeWeeklyPublic, type PublicUser, type WeeklyPublic } from '../services/publicUsers';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';
import { computeGoalStreak } from '../viewmodels/today';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import { DEFAULT_TZ, isoWeekDatesInTz, isoWeekIdInTz, yyyyMmDdInTz } from '../mmr/time';
import TrendLineChart from '../components/charts/TrendLineChart';
import AppText from '../components/ui/AppText';
import Avatar from '../components/ui/Avatar';
import Card from '../components/ui/Card';
import RankEmblem from '../components/ui/RankEmblem';
import StatTile from '../components/ui/StatTile';
import { colors, radius, spacing } from '../theme';
import type { Tier } from '../mmr/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MemberProfile'>;

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];
const asTier = (x: unknown): Tier | null => ((TIERS as string[]).includes(String(x ?? '').trim()) ? (String(x).trim() as Tier) : null);

const WORKOUT_LABELS: Record<string, string> = {
  weightLifting: 'Lifting',
  running: 'Running',
  walking: 'Walking',
  bike: 'Cycling',
  swim: 'Swimming',
  hiit: 'HIIT',
  rowing: 'Rowing',
  yoga: 'Yoga',
  elliptical: 'Elliptical',
  stairMaster: 'Stairs',
};

function daysAgoYYYYMMDD(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return yyyyMmDdInTz(d, DEFAULT_TZ);
}

function weekLabel(weekId: string) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekId).trim());
  return m ? `W${m[2]}` : weekId;
}

/**
 * Full teammate profile: training KPIs, consistency & compliance, rank & FP
 * history. Built from group logs (visible to members), the public profile,
 * and the weeklyPublic FP mirror. Deliberately NO body-weight stats — weight
 * is private.
 */
export default function MemberProfileScreen({ route, navigation }: Props) {
  const { groupId, uid } = route.params;
  const { user } = useContext(AuthContext);
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();

  const [pub, setPub] = useState<PublicUser | null>(null);
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [weeks, setWeeks] = useState<WeeklyPublic[]>([]);
  const [group, setGroup] = useState<{ streakRule?: 'workout' | 'any' } | null>(null);

  useEffect(() => subscribePublicUsers([uid], (m) => setPub(m[uid] ?? null)), [uid]);
  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 800), [groupId]);
  useEffect(() => subscribeWeeklyPublic(uid, 26, setWeeks, () => setWeeks([])), [uid]);
  useEffect(() => onSnapshot(doc(db, 'groups', groupId), (s) => setGroup(s.exists() ? ((s.data() as any) ?? null) : null)), [groupId]);

  const isMe = uid === user?.uid;
  const name = friendlyNameFromDisplayName(pub?.displayName ?? null, uid);
  const tier = asTier(pub?.rankTierPublic);
  const division = typeof pub?.rankDivisionPublic === 'number' ? pub.rankDivisionPublic : null;
  const fp = typeof pub?.mmrPublic === 'number' ? Math.round(pub.mmrPublic) : null;

  const kpis = useMemo(() => {
    const today = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
    const start28 = daysAgoYYYYMMDD(27);
    const weekDates = isoWeekDatesInTz(isoWeekIdInTz(new Date(), DEFAULT_TZ), DEFAULT_TZ);
    const elapsedWeek = weekDates.filter((d) => d <= today);

    const mine = logs.filter((l) => l.uid === uid);
    const last28 = mine.filter((l) => l.date >= start28 && l.date <= today);

    // ---- Training ----
    const workouts28 = last28.filter((l) => l.type === 'workout');
    const minutes28 = workouts28.reduce((a, l) => a + (Number(l.payload?.durationMinutes) || 0), 0);
    const typeCounts = new Map<string, number>();
    for (const w of workouts28) {
      const t = String(w.payload?.workoutType ?? '');
      if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const weekWorkouts = mine.filter((l) => l.type === 'workout' && weekDates.includes(l.date)).length;

    // ---- Consistency & compliance ----
    const rule = (group?.streakRule ?? 'any') as 'workout' | 'any';
    const streak = computeGoalStreak({
      logs: mine,
      uid,
      today,
      streakRule: rule,
      targets: {
        workout: Number(pub?.workoutsPerWeek ?? 0),
        calories: Number(pub?.logCaloriesDaysPerWeek ?? 0),
        weight: Number(pub?.logWeightDaysPerWeek ?? 0),
      },
    });
    const logDays28 = new Set(last28.map((l) => l.date)).size;
    const calorieDaysWeek = new Set(mine.filter((l) => l.type === 'calories' && weekDates.includes(l.date)).map((l) => l.date)).size;
    const loggedDaysThisWeek = new Set(mine.filter((l) => weekDates.includes(l.date)).map((l) => l.date)).size;
    const weekCompliance = elapsedWeek.length ? Math.round((loggedDaysThisWeek / elapsedWeek.length) * 100) : 0;

    const workoutTarget = Number(pub?.workoutsPerWeek ?? 0) || null;

    return {
      workouts28: workouts28.length,
      workoutsPerWeekAvg: Math.round((workouts28.length / 4) * 10) / 10,
      minutes28,
      avgSession: workouts28.length ? Math.round(minutes28 / workouts28.length) : 0,
      topType: topType ? WORKOUT_LABELS[topType] ?? topType : null,
      weekWorkouts,
      workoutTarget,
      streak,
      logDays28,
      weekCompliance,
      calorieDaysWeek,
    };
  }, [logs, uid, group?.streakRule, pub?.workoutsPerWeek, pub?.logCaloriesDaysPerWeek, pub?.logWeightDaysPerWeek]);

  const fpSeries = useMemo(() => weeks.map((w) => w.mmrAfter), [weeks]);
  const fpLabels = useMemo(() => weeks.map((w) => weekLabel(w.weekId)), [weeks]);
  const completedWeeks = useMemo(() => weeks.filter((w) => w.completedWeek).length, [weeks]);
  const bestWeek = useMemo(() => {
    const deltas = weeks.map((w) => Math.round(w.deltaMMR)).filter((n) => Number.isFinite(n));
    return deltas.length ? Math.max(...deltas) : null;
  }, [weeks]);

  const yAxis = useMemo(() => {
    const vals = fpSeries.filter((n) => Number.isFinite(n));
    if (!vals.length) return { yMin: undefined as number | undefined, yMax: undefined as number | undefined };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max(50, Math.round((max - min) * 0.15));
    return { yMin: Math.max(0, min - pad), yMax: max + pad };
  }, [fpSeries]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>{isMe ? 'My stats' : 'Profile'}</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Avatar photoURL={pub?.photoURL ?? null} name={name} size={72} status={kpis.streak >= 7 ? 'streakLeader' : undefined} />
          <AppText variant="pageTitle" color="primary" style={styles.heroName}>{name}</AppText>
          <View style={styles.tierRow}>
            {tier ? <RankEmblem tier={tier} inline size={16} /> : null}
            <AppText variant="rowTitle" color="secondary">
              {tier ? `${tier}${division ? ` ${ROMAN[division]}` : ''}` : 'Unranked'}
            </AppText>
            {fp != null ? <AppText variant="rowTitle" color="muted"> · {fp.toLocaleString()} FP</AppText> : null}
          </View>
        </View>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Training (last 4 weeks)</AppText>
        <View style={styles.tiles}>
          <StatTile label="Workouts" value={kpis.workouts28} unit={`~${kpis.workoutsPerWeekAvg}/wk`} style={styles.tile} />
          <StatTile label="Minutes" value={kpis.minutes28} unit={kpis.avgSession ? `${kpis.avgSession}m avg` : ''} style={styles.tile} />
          <StatTile label="Favorite" value={kpis.topType ?? '—'} style={styles.tile} />
        </View>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Consistency & compliance</AppText>
        <View style={styles.tiles}>
          <StatTile label="Streak" value={kpis.streak} unit="d" style={styles.tile} />
          <StatTile label="This week" value={kpis.weekCompliance} unit="% days" style={styles.tile} />
          <StatTile label="Active days" value={kpis.logDays28} unit="of 28" style={styles.tile} />
        </View>
        <Card style={styles.weekCard}>
          <View style={styles.weekRow}>
            <AppText variant="rowTitle" color="primary">This week's workouts</AppText>
            <AppText variant="rowTitle" color={kpis.workoutTarget && kpis.weekWorkouts >= kpis.workoutTarget ? 'success' : 'secondary'}>
              {kpis.weekWorkouts}{kpis.workoutTarget ? ` / ${kpis.workoutTarget}` : ''}
            </AppText>
          </View>
          <View style={styles.weekRow}>
            <AppText variant="rowTitle" color="primary">Calorie log days</AppText>
            <AppText variant="rowTitle" color="secondary">{kpis.calorieDaysWeek}</AppText>
          </View>
        </Card>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Rank & achievements</AppText>
        <View style={styles.tiles}>
          <StatTile label="Rank" value={tier ? `${tier[0]}${division ?? ''}` : '—'} style={styles.tile} />
          <StatTile label="Weeks done" value={completedWeeks} unit={`of ${weeks.length || '—'}`} style={styles.tile} />
          <StatTile label="Best week" value={bestWeek != null ? `+${bestWeek}` : '—'} unit={bestWeek != null ? 'FP' : ''} style={styles.tile} />
        </View>
        {pub?.badgesPublic && pub.badgesPublic.length > 0 ? (
          <View style={styles.badgeRow}>
            {pub.badgesPublic.slice(0, 8).map((b) => (
              <View key={b.id} style={styles.badgeChip}>
                <AppText variant="label" style={styles.badgeChipText}>🏅 {b.label}</AppText>
              </View>
            ))}
          </View>
        ) : null}

        <Card style={styles.chartCard}>
          <AppText variant="cardLabel" color="primary">FP history</AppText>
          {fpSeries.length < 2 ? (
            <AppText variant="rowSubtitle" color="muted" style={{ marginTop: spacing.md }}>
              Not enough scored weeks yet — history appears after a couple of completed weeks.
            </AppText>
          ) : (
            <>
              <TrendLineChart
                values={fpSeries}
                height={140}
                width={Math.max(240, windowWidth - spacing.lg * 2 - spacing.base * 2)}
                showPointLabels={fpSeries.length <= 8}
                formatPointLabel={(v) => `${Math.round(v)}`}
                labelColor={theme.colors.onSurface}
                color={colors.primary}
                yMin={yAxis.yMin}
                yMax={yAxis.yMax}
              />
              <View style={styles.axisRow}>
                {fpLabels.slice(Math.max(0, fpLabels.length - 5)).map((l, i) => (
                  <AppText key={`${l}-${i}`} variant="rowSubtitle" color="muted">{l}</AppText>
                ))}
              </View>
            </>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', marginTop: spacing.sm },
  heroName: { marginTop: spacing.md },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1 },
  weekCard: { marginTop: spacing.md },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  badgeChip: {
    backgroundColor: 'rgba(233,181,66,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233,181,66,0.35)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeChipText: { color: colors.rankGold, fontWeight: '700' },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  chartCard: { marginTop: spacing.md, borderRadius: radius.card },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingHorizontal: spacing.xs },
});
