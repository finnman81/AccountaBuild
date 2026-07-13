import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Icon, Modal, Portal } from 'react-native-paper';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import Screen from '../components/layout/Screen';
import EmptyState from '../components/state/EmptyState';
import TrendLineChart from '../components/charts/TrendLineChart';
import ComplianceBars from '../components/progress/ComplianceBars';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribePublicUsers } from '../services/publicUsers';
import Card from '../components/ui/Card';
import AppText from '../components/ui/AppText';
import PrimaryButton from '../components/ui/PrimaryButton';
import SegmentedControl from '../components/ui/SegmentedControl';
import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { db } from '../firebase/firebase';
import { subscribeGroupLogs, subscribeGroupPhotoLogs, type GroupLog } from '../services/logs';
import { formatMinutesHM, formatDeltaForUnits } from '../utils/formatters';
import { useMyUnits } from '../hooks/useMyUnits';
import { colors, spacing, radius } from '../theme';
import type { ProgressStackParamList } from '../navigation/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ProgressStackParamList, 'Progress'>;

function parseYYYYMMDDLocal(dateYYYYMMDD: string) {
  return new Date(`${dateYYYYMMDD}T00:00:00`);
}

function weekStartMondayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const offset = (day + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d;
}

function toMillis(t: any | null) {
  if (!t) return null;
  try {
    if (typeof t?.toMillis === 'function') return t.toMillis();
  } catch {}
  const d = t instanceof Date ? t : null;
  return d ? d.getTime() : null;
}

function formatYYYYMMDD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayShort(idx: number) {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][idx] ?? '';
}

export default function ProgressScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = React.useContext(AuthContext);
  const { activeGroupId, groups, isReady, setActiveGroupId } = useActiveGroup();
  const [metric, setMetric] = useState<'weight' | 'workout' | 'calories'>('weight');
  const units = useMyUnits();

  const [photoLogs, setPhotoLogs] = useState<GroupLog[]>([]);
  const [groupLogs, setGroupLogs] = useState<GroupLog[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [groupMeta, setGroupMeta] = useState<{ name?: string | null; memberCount?: number | null } | null>(null);
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [publicUsers, setPublicUsers] = useState<Record<string, any>>({});

  const activeGroupName = useMemo(() => {
    if (!activeGroupId) return null;
    return groups.find((g) => g.groupId === activeGroupId)?.name ?? 'Group';
  }, [activeGroupId, groups]);

  useEffect(() => {
    if (!activeGroupId) {
      setPhotoLogs([]);
      return;
    }
    return subscribeGroupPhotoLogs(
      activeGroupId,
      (items) => setPhotoLogs(items),
      undefined,
      60,
    );
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setGroupLogs([]);
      return;
    }
    return subscribeGroupLogs(
      activeGroupId,
      (items) => setGroupLogs(items),
      undefined,
      250,
    );
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setMemberUids([]);
      return;
    }
    return onSnapshot(collection(db, 'groups', activeGroupId, 'members'), (snap) => {
      const uids = snap.docs.map((d) => String((d.data() as any)?.uid ?? d.id)).filter(Boolean);
      setMemberUids(uids);
    });
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) {
      setGroupMeta(null);
      return;
    }
    return onSnapshot(doc(db, 'groups', activeGroupId), (snap) => {
      if (!snap.exists()) {
        setGroupMeta(null);
        return;
      }
      const data = snap.data() as any;
      setGroupMeta({
        name: data?.name ?? null,
        memberCount: typeof data?.memberCount === 'number' ? data.memberCount : null,
      });
    });
  }, [activeGroupId]);

  useEffect(() => {
    if (!user) return;
    return subscribeMyCanSeeUids(user.uid, (uids) => setCanSee(new Set(uids)));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const visible = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    if (visible.length === 0) { setPublicUsers({}); return; }
    return subscribePublicUsers(visible, setPublicUsers);
  }, [canSee, memberUids, user]);

  const photoStrip = useMemo(() => photoLogs.slice(0, 12), [photoLogs]);

  // Group compliance toward weekly goals (merged in from the old Charts screen).
  const complianceBars = useMemo(() => {
    const weekStart = weekStartMondayLocal();
    const workoutsCount: Record<string, number> = {};
    const caloriesDays: Record<string, Set<string>> = {};
    const weightDays: Record<string, Set<string>> = {};
    for (const l of groupLogs) {
      const d = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(d.valueOf()) || d < weekStart) continue;
      if (l.type === 'workout') workoutsCount[l.uid] = (workoutsCount[l.uid] ?? 0) + 1;
      if (l.type === 'calories') (caloriesDays[l.uid] = caloriesDays[l.uid] ?? new Set()).add(l.date);
      if (l.type === 'weight') (weightDays[l.uid] = weightDays[l.uid] ?? new Set()).add(l.date);
    }
    let membersWithGoals = 0;
    let wDone = 0, wGoal = 0, cDone = 0, cGoal = 0, oDone = 0, oGoal = 0;
    for (const uid of memberUids) {
      const g = publicUsers[uid];
      if (!g) continue;
      const weightGoal = Math.max(0, Number(g.logWeightDaysPerWeek ?? 0));
      const caloriesGoal = Math.max(0, Number(g.logCaloriesDaysPerWeek ?? 0));
      const workoutsGoal = Math.max(0, Number(g.workoutsPerWeek ?? 0));
      if (weightGoal > 0 || caloriesGoal > 0 || workoutsGoal > 0) membersWithGoals += 1;
      if (weightGoal > 0) { wGoal += weightGoal; wDone += Math.min(weightDays[uid]?.size ?? 0, weightGoal); }
      if (caloriesGoal > 0) { cGoal += caloriesGoal; cDone += Math.min(caloriesDays[uid]?.size ?? 0, caloriesGoal); }
      if (workoutsGoal > 0) { oGoal += workoutsGoal; oDone += Math.min(workoutsCount[uid] ?? 0, workoutsGoal); }
    }
    const pct = (done: number, goal: number) => (goal > 0 ? Math.round((done / goal) * 100) : 0);
    const ratio = (done: number, goal: number) => (goal > 0 ? `${done}/${goal}` : '—');
    return {
      membersWithGoals,
      totalMembers: memberUids.length,
      hasAny: wGoal + cGoal + oGoal > 0,
      bars: [
        { label: 'Weight', pct: pct(wDone, wGoal), ratio: ratio(wDone, wGoal) },
        { label: 'Calories', pct: pct(cDone, cGoal), ratio: ratio(cDone, cGoal) },
        { label: 'Workouts', pct: pct(oDone, oGoal), ratio: ratio(oDone, oGoal) },
      ],
    };
  }, [groupLogs, memberUids, publicUsers]);

  const weekDates = useMemo(() => {
    const start = weekStartMondayLocal();
    const out: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(formatYYYYMMDD(d));
    }
    return out;
  }, []);

  // Calculate new metrics: Total Group Weight Change, Total Training Minutes, Logging Consistency %
  const weeklyMetrics = useMemo(() => {
    if (!activeGroupId) {
      return {
        totalWeightChange: null as number | null,
        totalTrainingMinutes: 0,
        loggingConsistency: 0,
        totalWeightChangeDelta: null as number | null,
        totalTrainingMinutesDelta: null as number | null,
        loggingConsistencyDelta: null as number | null,
      };
    }
    const weekStart = weekStartMondayLocal();
    const memberCount = memberUids.length || groupMeta?.memberCount || 0;
    
    // Calculate total training minutes this week
    let totalMins = 0;
    for (const l of groupLogs) {
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      if (l.type === 'workout') {
        const mins = Number((l.payload as any)?.durationMinutes);
        if (Number.isFinite(mins) && mins > 0) totalMins += mins;
      }
    }
    
    // Calculate total weight change (first weight vs last weight this week)
    const weightByUid: Record<string, { first: number | null; last: number | null }> = {};
    for (const l of groupLogs) {
      if (l.type !== 'weight') continue;
      const w = Number((l.payload as any)?.weight);
      if (!Number.isFinite(w) || w <= 0) continue;
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      if (!weightByUid[l.uid]) weightByUid[l.uid] = { first: null, last: null };
      if (weightByUid[l.uid].first == null) weightByUid[l.uid].first = w;
      weightByUid[l.uid].last = w;
    }
    let totalWeightChange = 0;
    for (const uid of Object.keys(weightByUid)) {
      const entry = weightByUid[uid];
      if (entry.first != null && entry.last != null) {
        totalWeightChange += entry.last - entry.first;
      }
    }
    
    // Calculate logging consistency (members who logged at least once this week / total members)
    const membersWhoLogged = new Set<string>();
    for (const l of groupLogs) {
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      if (['workout', 'calories', 'weight'].includes(l.type)) {
        membersWhoLogged.add(l.uid);
      }
    }
    const consistency = memberCount > 0 ? Math.round((membersWhoLogged.size / memberCount) * 100) : 0;
    
    // Calculate deltas vs previous week (simplified - compare to week before)
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    let prevWeekMins = 0;
    const prevWeekWeightByUid: Record<string, { first: number | null; last: number | null }> = {};
    const prevWeekLogged = new Set<string>();
    
    for (const l of groupLogs) {
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < prevWeekStart || dt >= weekStart) continue;
      if (l.type === 'workout') {
        const mins = Number((l.payload as any)?.durationMinutes);
        if (Number.isFinite(mins) && mins > 0) prevWeekMins += mins;
      }
      if (l.type === 'weight') {
        const w = Number((l.payload as any)?.weight);
        if (Number.isFinite(w) && w > 0) {
          if (!prevWeekWeightByUid[l.uid]) prevWeekWeightByUid[l.uid] = { first: null, last: null };
          if (prevWeekWeightByUid[l.uid].first == null) prevWeekWeightByUid[l.uid].first = w;
          prevWeekWeightByUid[l.uid].last = w;
        }
      }
      if (['workout', 'calories', 'weight'].includes(l.type)) {
        prevWeekLogged.add(l.uid);
      }
    }
    
    let prevWeekWeightChange = 0;
    for (const uid of Object.keys(prevWeekWeightByUid)) {
      const entry = prevWeekWeightByUid[uid];
      if (entry.first != null && entry.last != null) {
        prevWeekWeightChange += entry.last - entry.first;
      }
    }
    const prevWeekConsistency = memberCount > 0 ? Math.round((prevWeekLogged.size / memberCount) * 100) : 0;
    
    return {
      totalWeightChange: totalWeightChange !== 0 ? totalWeightChange : null,
      totalTrainingMinutes: totalMins,
      loggingConsistency: consistency,
      totalWeightChangeDelta: totalWeightChange !== 0 && prevWeekWeightChange !== 0 ? totalWeightChange - prevWeekWeightChange : null,
      totalTrainingMinutesDelta: prevWeekMins > 0 ? totalMins - prevWeekMins : null,
      loggingConsistencyDelta: prevWeekConsistency > 0 ? consistency - prevWeekConsistency : null,
    };
  }, [activeGroupId, groupLogs, memberUids.length, groupMeta?.memberCount]);

  const aggregates = useMemo(() => {
    if (!activeGroupId) return { series: [] as number[], history: [] as any[], yLabel: '', title: '' };
    const weekStart = weekStartMondayLocal();
    const memberCount = memberUids.length || groupMeta?.memberCount || 0;
    const divisor = Math.max(1, memberCount);

    const workoutMinsByDate: Record<string, number> = {};
    const caloriesByDate: Record<string, number> = {};

    for (const l of groupLogs) {
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      if (l.type === 'workout') {
        const mins = Number((l.payload as any)?.durationMinutes);
        if (!Number.isFinite(mins) || mins <= 0) continue;
        workoutMinsByDate[l.date] = (workoutMinsByDate[l.date] ?? 0) + mins;
      }
      if (l.type === 'calories') {
        const c = Number((l.payload as any)?.calories);
        if (!Number.isFinite(c) || c <= 0) continue;
        caloriesByDate[l.date] = (caloriesByDate[l.date] ?? 0) + c;
      }
    }

    const weightByDateByUid: Record<string, Record<string, { w: number; tsMs: number }>> = {};
    for (const l of groupLogs) {
      if (l.type !== 'weight') continue;
      const w = Number((l.payload as any)?.weight);
      if (!Number.isFinite(w) || w <= 0) continue;
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      const ms = toMillis(l.ts ?? null) ?? 0;
      weightByDateByUid[l.date] = weightByDateByUid[l.date] ?? {};
      const prev = weightByDateByUid[l.date][l.uid];
      if (!prev || ms >= prev.tsMs) weightByDateByUid[l.date][l.uid] = { w, tsMs: ms };
    }
    const baselineByUid: Record<string, number> = {};
    for (const d of Object.keys(weightByDateByUid).sort()) {
      for (const [uid, entry] of Object.entries(weightByDateByUid[d])) {
        if (baselineByUid[uid] == null) baselineByUid[uid] = entry.w;
      }
    }

    const avgPercentLossByDate: Record<string, number | null> = {};
    for (const d of weekDates) {
      const day = weightByDateByUid[d] ?? {};
      const vals: number[] = [];
      for (const [uid, entry] of Object.entries(day)) {
        const base = baselineByUid[uid];
        if (!Number.isFinite(base) || base <= 0) continue;
        const pct = ((base - entry.w) / base) * 100;
        if (Number.isFinite(pct)) vals.push(pct);
      }
      avgPercentLossByDate[d] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    }

    const history = weekDates.map((d) => {
      const avgMins = Math.round(((workoutMinsByDate[d] ?? 0) / divisor) * 10) / 10;
      const avgCals = Math.round(((caloriesByDate[d] ?? 0) / divisor) * 10) / 10;
      const avgPct = avgPercentLossByDate[d];
      return { date: d, avgPct, avgMins, avgCals };
    });

    if (metric === 'workout') {
      return { title: 'Workout (Avg minutes)', yLabel: 'Minutes', series: history.map((h) => h.avgMins), history };
    }
    if (metric === 'calories') {
      // NOTE: the data here is average calories LOGGED per member per day —
      // the old "Calories under goal" title misdescribed it.
      return { title: 'Calories logged (avg)', yLabel: 'Calories', series: history.map((h) => h.avgCals), history };
    }
    // weight
    return {
      title: 'Weight trend (Avg Percent Loss)',
      yLabel: 'Percent',
      series: history.map((h) => (h.avgPct == null ? 0 : h.avgPct)),
      history,
    };
  }, [activeGroupId, groupLogs, groupMeta?.memberCount, memberUids.length, metric, weekDates]);

  // Build a clean chart model per metric so all three trends are consistent:
  // - ONLY ELAPSED days are plotted: the line ends at today instead of diving
  //   to a fake zero-cliff across the not-yet-happened rest of the week.
  // - weight: missing days are carried forward (0% would be a false plunge),
  //   axis is tight around the real values.
  // - workout/calories: a missing PAST day genuinely IS zero, so the axis is
  //   anchored at 0 and topped by the week's max.
  const chart = useMemo(() => {
    const todayStr = formatYYYYMMDD(new Date());
    const elapsed = aggregates.history.filter((h: any) => h.date <= todayStr);
    const raw = elapsed.map((h: any) => {
      if (metric === 'weight') return { v: h.avgPct as number | null, has: h.avgPct != null };
      if (metric === 'workout') return { v: h.avgMins as number, has: h.avgMins > 0 };
      return { v: h.avgCals as number, has: h.avgCals > 0 };
    });
    const realCount = raw.filter((r) => r.has).length;

    let series: number[];
    if (metric === 'weight') {
      const firstReal = raw.find((r) => r.has)?.v ?? 0;
      let last = firstReal as number;
      series = raw.map((r) => {
        if (r.has) last = r.v as number;
        return last;
      });
    } else {
      series = raw.map((r) => (r.has ? (r.v as number) : 0));
    }

    let yMin: number;
    let yMax: number;
    if (metric === 'weight') {
      yMin = Math.min(...series);
      yMax = Math.max(...series);
      if (yMin === yMax) { yMin -= 1; yMax += 1; } else { const pad = (yMax - yMin) * 0.15; yMin -= pad; yMax += pad; }
    } else {
      yMin = 0;
      yMax = Math.max(1, ...series) * 1.1;
    }
    return { series, yMin, yMax, realCount, dates: elapsed.map((h: any) => h.date as string) };
  }, [aggregates.history, metric]);

  const yTicks = useMemo(() => {
    if (chart.realCount === 0) return { top: '—', mid: '—', bot: '—' };
    const mid = (chart.yMin + chart.yMax) / 2;
    const fmt = (n: number) => (metric === 'weight' ? `${Math.round(n * 10) / 10}%` : `${Math.round(n)}`);
    return { top: fmt(chart.yMax), mid: fmt(mid), bot: fmt(chart.yMin) };
  }, [chart, metric]);

  const formatPointLabel = useMemo(() => {
    // Zero-days get no label (a row of "0"s was pure clutter).
    if (metric === 'weight') return (v: number) => `${Math.round(v * 100) / 100}%`;
    if (metric === 'workout') return (v: number) => (v > 0 ? `${Math.round(v)}m` : '');
    return (v: number) => (v > 0 ? `${Math.round(v)}` : '');
  }, [metric]);

  if (!user) {
    return (
      <Screen>
        <AppText variant="body" color="primary">You must be signed in.</AppText>
      </Screen>
    );
  }

  if (!isReady) {
    return (
      <Screen>
        <AppText variant="body" color="secondary">Loading…</AppText>
      </Screen>
    );
  }

  if (!activeGroupId) {
    return (
      <Screen>
        <EmptyState
          title="Pick a group"
          message="Create or join a group to unlock group progress and photo history."
          ctaLabel="Go to Groups"
          onCta={() => rootNav.navigate('MainTabs', { screen: 'GroupsTab' } as any)}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll safeTop={false}>
      <Card>
        <AppText variant="pageTitle" color="primary">Progress</AppText>
        {activeGroupName ? (
          <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>{activeGroupName}</AppText>
        ) : null}
        <AppText variant="eyebrow" color="muted" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
          Group
        </AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {groups.map((g) => {
            const active = g.groupId === activeGroupId;
            return (
              <TouchableOpacity
                key={g.groupId}
                onPress={() => void setActiveGroupId(g.groupId)}
                activeOpacity={0.85}
                style={{
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.base,
                  paddingVertical: spacing.sm,
                  backgroundColor: active ? colors.primary : 'transparent',
                  borderWidth: active ? 0 : 1,
                  borderColor: colors.divider,
                }}
              >
                <AppText variant="rowSubtitle" style={{ color: active ? '#FFFFFF' : colors.textSecondary, fontWeight: '600' }}>
                  {g.name}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Card>

      <View style={{ height: spacing.base }} />

      {/* History entry — browse past days & weeks */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('History')}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ width: 38, height: 38, borderRadius: radius.tile, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon source="calendar-month" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="rowTitle" color="primary">History</AppText>
              <AppText variant="rowSubtitle" color="muted">Browse past days & weekly FP results</AppText>
            </View>
            <Icon source="chevron-right" size={20} color={colors.textMuted} />
          </View>
        </Card>
      </TouchableOpacity>

      <View style={{ height: spacing.base }} />

      {/* Weekly Metrics Summary */}
      <Card>
        <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.md }}>This Week</AppText>
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            flexWrap: 'wrap',
          }}
        >
          {/* Total Group Weight Change */}
          <View style={{ flex: 1, minWidth: 120 }}>
            <AppText variant="label" color="secondary" style={{ marginBottom: spacing.xs }}>
              Total Weight Change
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
              <AppText variant="numberMd" color="primary">
                {weeklyMetrics.totalWeightChange != null
                  ? formatDeltaForUnits(weeklyMetrics.totalWeightChange, units)
                  : '—'}
              </AppText>
              {weeklyMetrics.totalWeightChangeDelta != null && (
                <AppText
                  variant="label"
                  style={{
                    color:
                      weeklyMetrics.totalWeightChangeDelta > 0
                        ? colors.success
                        : weeklyMetrics.totalWeightChangeDelta < 0
                          ? colors.danger
                          : colors.textMuted,
                  }}
                >
                  {weeklyMetrics.totalWeightChangeDelta > 0 ? '↑' : weeklyMetrics.totalWeightChangeDelta < 0 ? '↓' : '→'}
                </AppText>
              )}
            </View>
          </View>

          {/* Total Training Minutes */}
          <View style={{ flex: 1, minWidth: 120 }}>
            <AppText variant="label" color="secondary" style={{ marginBottom: spacing.xs }}>
              Total Training Minutes
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
              <AppText variant="numberMd" color="primary">
                {formatMinutesHM(weeklyMetrics.totalTrainingMinutes)}
              </AppText>
              {weeklyMetrics.totalTrainingMinutesDelta != null && (
                <AppText
                  variant="label"
                  style={{
                    color:
                      weeklyMetrics.totalTrainingMinutesDelta > 0
                        ? colors.success
                        : weeklyMetrics.totalTrainingMinutesDelta < 0
                          ? colors.danger
                          : colors.textMuted,
                  }}
                >
                  {weeklyMetrics.totalTrainingMinutesDelta > 0 ? '↑' : weeklyMetrics.totalTrainingMinutesDelta < 0 ? '↓' : '→'}
                </AppText>
              )}
            </View>
          </View>

          {/* Logging Consistency */}
          <View style={{ flex: 1, minWidth: 120 }}>
            <AppText variant="label" color="secondary" style={{ marginBottom: spacing.xs }}>
              Logging Consistency
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
              <AppText variant="numberMd" color="primary">
                {weeklyMetrics.loggingConsistency}%
              </AppText>
              {weeklyMetrics.loggingConsistencyDelta != null && (
                <AppText
                  variant="label"
                  style={{
                    color:
                      weeklyMetrics.loggingConsistencyDelta > 0
                        ? colors.success
                        : weeklyMetrics.loggingConsistencyDelta < 0
                          ? colors.danger
                          : colors.textMuted,
                  }}
                >
                  {weeklyMetrics.loggingConsistencyDelta > 0 ? '↑' : weeklyMetrics.loggingConsistencyDelta < 0 ? '↓' : '→'}
                </AppText>
              )}
            </View>
          </View>
        </View>
      </Card>

      <View style={{ height: spacing.base }} />

      {/* Group compliance (merged from the old Charts screen) */}
      <Card>
        <AppText variant="rowTitle" color="primary">Group compliance</AppText>
        <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>
          {complianceBars.totalMembers
            ? `${complianceBars.membersWithGoals}/${complianceBars.totalMembers} members set goals · this week`
            : 'No members yet'}
        </AppText>
        {complianceBars.hasAny ? (
          <View style={{ marginTop: spacing.md }}>
            <ComplianceBars bars={complianceBars.bars} />
          </View>
        ) : (
          <AppText variant="body" color="muted" style={{ marginTop: spacing.md }}>
            No goals set yet — members can set weekly targets in Goals.
          </AppText>
        )}
      </Card>

      <View style={{ height: spacing.base }} />

      {/* Weekly Insight Summary */}
      <Card>
        <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.md }}>Weekly Insight</AppText>
        <View
          style={{
            borderRadius: radius.card,
            padding: spacing.md,
            backgroundColor: colors.surface2,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.04)',
          }}
        >
          <AppText variant="body" color="primary" style={{ lineHeight: 20 }}>
            {(() => {
                const insights: string[] = [];
                if (weeklyMetrics.totalWeightChange != null && weeklyMetrics.totalWeightChange < 0) {
                  insights.push(`Group lost ${formatDeltaForUnits(Math.abs(weeklyMetrics.totalWeightChange), units)} total`);
                }
                if (weeklyMetrics.totalTrainingMinutes > 0) {
                  insights.push(`${formatMinutesHM(weeklyMetrics.totalTrainingMinutes)} total training time`);
                }
                if (weeklyMetrics.loggingConsistency >= 80) {
                  insights.push(`${weeklyMetrics.loggingConsistency}% logging consistency`);
                } else if (weeklyMetrics.loggingConsistency < 50) {
                  insights.push(`Only ${weeklyMetrics.loggingConsistency}% logged this week`);
                }
                return insights.length > 0 ? insights.join(' • ') : 'Start logging to see insights.';
              })()}
          </AppText>
        </View>
      </Card>

      <View style={{ height: spacing.base }} />

      <Card>
        <AppText variant="rowTitle" color="primary">Trend</AppText>
        <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2, marginBottom: spacing.md }}>Group averages</AppText>
        <SegmentedControl
          value={metric}
          onChange={(v) => setMetric(v)}
          variant="surface"
          options={[
            { value: 'workout', label: 'Workout' },
            { value: 'calories', label: 'Calories' },
            { value: 'weight', label: 'Weight' },
          ]}
        />

        <View style={{ height: spacing.md }} />

          <View
            style={{
              borderRadius: radius.card,
              padding: spacing.md,
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.04)',
            }}
          >
            <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.xs }}>
              {aggregates.title}
            </AppText>
            <AppText variant="rowSubtitle" color="secondary">
              {metric === 'weight'
                ? 'This week vs first weigh-in this week'
                : `This week • averaged across ${Math.max(1, memberUids.length || groupMeta?.memberCount || 0)} members`}
            </AppText>

            <View style={{ height: spacing.md }} />
            {chart.realCount < 2 ? (
              <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
                <Icon source="chart-line-variant" size={28} color={colors.textMuted} />
                <AppText variant="rowSubtitle" color="muted" style={{ textAlign: 'center', marginTop: spacing.sm }}>
                  Not enough data yet — log a few days to see the trend.
                </AppText>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {(() => {
                  const yAxisW = 48;
                  const estimatedCardPadding = 32;
                  const chartW = Math.max(240, width - 32 - estimatedCardPadding - yAxisW);
                  return (
                    <>
                      <View style={{ width: yAxisW, justifyContent: 'space-between', height: 160, paddingVertical: 20 }}>
                        <AppText variant="label" color="muted" style={{ textAlign: 'right' }}>{yTicks.top}</AppText>
                        <AppText variant="label" color="muted" style={{ textAlign: 'right' }}>{yTicks.mid}</AppText>
                        <AppText variant="label" color="muted" style={{ textAlign: 'right' }}>{yTicks.bot}</AppText>
                      </View>
                      <View style={{ flex: 1, overflow: 'hidden' }}>
                        <TrendLineChart
                          values={chart.series}
                          height={160}
                          width={chartW}
                          yMin={chart.yMin}
                          yMax={chart.yMax}
                          color={colors.primary}
                          showPointLabels
                          formatPointLabel={formatPointLabel}
                          labelColor={colors.textPrimary}
                        />
                        {/* X labels must match the plotted (elapsed-only) days,
                            or they'd misalign with the truncated series. */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
                          {chart.dates.map((d, i) => {
                            const idx = parseYYYYMMDDLocal(d).getDay();
                            return (
                              <AppText key={`${d}-${i}`} variant="label" color="muted">
                                {weekdayShort(idx)}
                              </AppText>
                            );
                          })}
                        </View>
                      </View>
                    </>
                  );
                })()}
              </View>
            )}
          </View>
      </Card>

      <View style={{ height: spacing.base }} />

      <Card>
        <AppText variant="rowTitle" color="primary">History</AppText>
        <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2, marginBottom: spacing.md }}>
          Daily group averages this week
        </AppText>
        {aggregates.history.length === 0 ? (
          <View style={{ paddingVertical: spacing.md }}>
            <AppText variant="body" color="muted">No data yet.</AppText>
          </View>
        ) : (
          <>
            {/* Header */}
            <View style={{ flexDirection: 'row', paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
              <AppText variant="label" color="muted" style={{ flex: 1.4 }}>DAY</AppText>
              <AppText variant="label" color="muted" style={{ flex: 1, textAlign: 'right' }}>WT %</AppText>
              <AppText variant="label" color="muted" style={{ flex: 1, textAlign: 'right' }}>MIN</AppText>
              <AppText variant="label" color="muted" style={{ flex: 1, textAlign: 'right' }}>CAL</AppText>
            </View>
            {aggregates.history.map((h: any, i: number) => {
              const dow = parseYYYYMMDDLocal(h.date);
              const dayLabel = dow.toLocaleDateString(undefined, { weekday: 'short' });
              const num = (v: number) => (v > 0 ? String(Math.round(v)) : '—');
              return (
                <View
                  key={`${h.date}-${i}`}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.divider }}
                >
                  <AppText variant="rowSubtitle" color="primary" style={{ flex: 1.4 }}>{dayLabel}</AppText>
                  <AppText variant="rowSubtitle" color="secondary" style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                    {h.avgPct == null ? '—' : `${h.avgPct > 0 ? '' : ''}${h.avgPct}`}
                  </AppText>
                  <AppText variant="rowSubtitle" color="secondary" style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{num(h.avgMins)}</AppText>
                  <AppText variant="rowSubtitle" color="secondary" style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{num(h.avgCals)}</AppText>
                </View>
              );
            })}
          </>
        )}
      </Card>

      <View style={{ height: spacing.base }} />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
          <AppText variant="rowTitle" color="primary">Progress pictures</AppText>
          <TouchableOpacity
            onPress={() =>
              rootNav.navigate(
                'MainTabs',
                {
                  screen: 'HomeTab',
                  params: { screen: 'ViewPhotos', initial: false, params: { groupId: activeGroupId } },
                } as any,
              )
            }
            activeOpacity={0.7}
          >
            <AppText variant="rowSubtitle" color="accent">See all</AppText>
          </TouchableOpacity>
        </View>
        {photoStrip.length === 0 ? (
          <AppText variant="body" color="muted">No photos yet.</AppText>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {photoStrip.map((l) => {
              const uri = String((l.payload as any)?.url ?? '').trim();
              if (!uri) return null;
              return (
                <View key={l.id} style={{ width: 92, height: 92, borderRadius: 16, overflow: 'hidden' }}>
                  <TouchableOpacity
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      zIndex: 2,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: '#00000066',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={() => setViewerUri(uri)}
                  >
                    <Icon source="magnify-plus-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                  <Image source={{ uri }} style={{ width: 92, height: 92 }} />
                </View>
              );
            })}
          </ScrollView>
        )}
      </Card>

      <Portal>
        <Modal
          visible={Boolean(viewerUri)}
          onDismiss={() => setViewerUri(null)}
          contentContainerStyle={{ margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface }}
        >
          {viewerUri ? <Image source={{ uri: viewerUri }} style={{ width: '100%', height: 420 }} /> : null}
        </Modal>
      </Portal>
    </Screen>
  );
}

