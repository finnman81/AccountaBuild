import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, TouchableOpacity, View } from 'react-native';
import { Icon, Modal, Portal } from 'react-native-paper';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import Screen from '../components/layout/Screen';
import EmptyState from '../components/state/EmptyState';
import TrendLineChart from '../components/charts/TrendLineChart';
import ComplianceBars from '../components/progress/ComplianceBars';
import CrewWeekCard, { type CrewWeekStats } from '../components/progress/CrewWeekCard';
import ConsistencyMatrix, { type MatrixRow } from '../components/progress/ConsistencyMatrix';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { subscribePublicUsers } from '../services/publicUsers';
import { getHydrated, setHydrated } from '../services/hydrationCache';
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
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = React.useContext(AuthContext);
  const { activeGroupId, groups, isReady, setActiveGroupId } = useActiveGroup();
  const [metric, setMetric] = useState<'weight' | 'workout' | 'calories'>('weight');
  // Trend canvas width, measured by onLayout (never estimated — see chart row).
  const [chartBoxW, setChartBoxW] = useState(0);
  const units = useMyUnits();

  const [photoLogs, setPhotoLogs] = useState<GroupLog[]>([]);
  const [groupLogs, setGroupLogs] = useState<GroupLog[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // Seed the roster from the shared hydration cache (same keys Today/Leaderboard/
  // GroupChat maintain) so this tab paints known members instantly instead of
  // waiting on the chained members -> canSee -> publicUsers round-trips.
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
    setCanSee(new Set(getHydrated<string[]>(`canSee:${user.uid}`) ?? []));
    return subscribeMyCanSeeUids(user.uid, (uids) => {
      const set = new Set(uids);
      setCanSee(set);
      setHydrated(`canSee:${user.uid}`, Array.from(set));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const visible = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    if (visible.length === 0) { setPublicUsers({}); return; }
    return subscribePublicUsers(visible, (map) => {
      setPublicUsers(map);
      if (activeGroupId) setHydrated(`publicUsers:${activeGroupId}`, map);
    });
  }, [canSee, memberUids, user, activeGroupId]);

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

  /**
   * Crew totals + records. TOTALS, not averages: totals scale with effort and
   * feel collective, and averaging calories across cutters and bulkers (the
   * old table) described nobody.
   */
  const crewWeek = useMemo<CrewWeekStats>(() => {
    const weekStart = weekStartMondayLocal();
    const prevStart = new Date(weekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Same-point comparison: this week is partial until Sunday, so last week
    // must be cut at the same moment (now minus 7 days) or the delta reads
    // ▼ all week and ▲ means nothing (Jake, 2026-08-12). Logs without a
    // usable ts count as end-of-day — erring toward including them keeps the
    // baseline honest rather than flattering.
    const prevCutoffMs = Date.now() - 7 * 24 * 3600 * 1000;

    let workouts = 0, minutes = 0, prevWorkouts = 0, prevMinutes = 0;
    let longest: { name: string; minutes: number } | null = null;
    const minsByDow: Record<number, number> = {};
    const daysByUid: Record<string, Set<string>> = {};
    const weightByUid: Record<string, { first: number; last: number }> = {};

    const nameOf = (uid: string) => friendlyNameFromDisplayName(publicUsers[uid]?.displayName ?? null, uid);

    for (const l of groupLogs) {
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < prevStart) continue;
      const thisWeek = dt >= weekStart;
      if (l.type === 'workout') {
        const mins = Number((l.payload as any)?.durationMinutes) || 0;
        if (thisWeek) {
          workouts += 1;
          minutes += mins;
          minsByDow[dt.getDay()] = (minsByDow[dt.getDay()] ?? 0) + mins;
          if (mins > 0 && (!longest || mins > longest.minutes)) longest = { name: nameOf(l.uid), minutes: Math.round(mins) };
        } else {
          const atMs = toMillis(l.ts ?? null) ?? dt.getTime() + 86399_000;
          if (atMs <= prevCutoffMs) {
            prevWorkouts += 1;
            prevMinutes += mins;
          }
        }
      }
      if (thisWeek) (daysByUid[l.uid] = daysByUid[l.uid] ?? new Set()).add(l.date);
      if (thisWeek && l.type === 'weight') {
        const w = Number((l.payload as any)?.weight);
        if (Number.isFinite(w) && w > 0) {
          if (!weightByUid[l.uid]) weightByUid[l.uid] = { first: w, last: w };
          else weightByUid[l.uid].last = w;
        }
      }
    }

    let lbDropped = 0;
    for (const e of Object.values(weightByUid)) lbDropped += Math.max(0, e.first - e.last);

    let biggestDay: CrewWeekStats['biggestDay'] = null;
    for (const [dow, m] of Object.entries(minsByDow)) {
      if (!biggestDay || m > biggestDay.minutes) {
        biggestDay = { label: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(dow)] ?? '', minutes: m };
      }
    }
    let mostConsistent: CrewWeekStats['mostConsistent'] = null;
    for (const [uid, days] of Object.entries(daysByUid)) {
      if (!mostConsistent || days.size > mostConsistent.days) mostConsistent = { name: nameOf(uid), days: days.size };
    }

    return {
      workouts, minutes, lbDropped, longestSession: longest, biggestDay, mostConsistent,
      deltas: {
        workouts: prevWorkouts > 0 ? workouts - prevWorkouts : null,
        minutes: prevMinutes > 0 ? minutes - prevMinutes : null,
      },
    };
  }, [groupLogs, publicUsers]);

  /** 7xN dot grid: who logged which day (visible members only). */
  const matrix = useMemo(() => {
    const visible = memberUids.filter((uid) => uid === user?.uid || canSee.has(uid));
    const byUid: Record<string, Set<string>> = {};
    const weekStart = weekStartMondayLocal();
    for (const l of groupLogs) {
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      if (!['workout', 'calories', 'weight', 'photo'].includes(l.type)) continue;
      (byUid[l.uid] = byUid[l.uid] ?? new Set()).add(l.date);
    }
    const rows: MatrixRow[] = visible.map((uid) => ({
      uid,
      name: friendlyNameFromDisplayName(publicUsers[uid]?.displayName ?? null, uid),
      days: weekDates.map((d) => byUid[uid]?.has(d) ?? false),
    }));
    rows.sort((a, b) => b.days.filter(Boolean).length - a.days.filter(Boolean).length || a.name.localeCompare(b.name));
    const todayStr = formatYYYYMMDD(new Date());
    return { rows, todayIndex: Math.max(0, weekDates.indexOf(todayStr)) };
  }, [groupLogs, memberUids, canSee, publicUsers, user?.uid, weekDates]);

  /**
   * Per-day series for the trend, aligned to weekDates.
   *  - crew minutes: average per member (the old metric, kept as the muted line)
   *  - MY minutes:   the primary line — comparison is the point
   *  - weight:       % lost since first weigh-in of the week, mine vs crew avg
   *  - calories:     REDEFINED. Averaged kcal across cutters and bulkers was
   *    meaningless; now it's "% of that day's calorie-loggers within their OWN
   *    budget" (<=120% of dailyCalorieGoal, mirroring the scoring band).
   */
  const aggregates = useMemo(() => {
    const weekStart = weekStartMondayLocal();
    const memberCount = memberUids.length || groupMeta?.memberCount || 0;
    const divisor = Math.max(1, memberCount);
    const myUid = user?.uid ?? '';

    const crewMinsByDate: Record<string, number> = {};
    const myMinsByDate: Record<string, number> = {};
    const calsByDateByUid: Record<string, Record<string, number>> = {};
    const weightByDateByUid: Record<string, Record<string, { w: number; tsMs: number }>> = {};

    for (const l of groupLogs) {
      const dt = parseYYYYMMDDLocal(l.date);
      if (Number.isNaN(dt.valueOf()) || dt < weekStart) continue;
      if (l.type === 'workout') {
        const mins = Number((l.payload as any)?.durationMinutes);
        if (!Number.isFinite(mins) || mins <= 0) continue;
        crewMinsByDate[l.date] = (crewMinsByDate[l.date] ?? 0) + mins;
        if (l.uid === myUid) myMinsByDate[l.date] = (myMinsByDate[l.date] ?? 0) + mins;
      }
      if (l.type === 'calories') {
        const c = Number((l.payload as any)?.calories);
        if (!Number.isFinite(c) || c <= 0) continue;
        (calsByDateByUid[l.date] = calsByDateByUid[l.date] ?? {})[l.uid] =
          (calsByDateByUid[l.date]?.[l.uid] ?? 0) + c;
      }
      if (l.type === 'weight') {
        const w = Number((l.payload as any)?.weight);
        if (!Number.isFinite(w) || w <= 0) continue;
        const ms = toMillis(l.ts ?? null) ?? 0;
        weightByDateByUid[l.date] = weightByDateByUid[l.date] ?? {};
        const prev = weightByDateByUid[l.date][l.uid];
        if (!prev || ms >= prev.tsMs) weightByDateByUid[l.date][l.uid] = { w, tsMs: ms };
      }
    }

    // Weight: % lost vs each member's FIRST weigh-in of the week.
    const baselineByUid: Record<string, number> = {};
    for (const d of Object.keys(weightByDateByUid).sort()) {
      for (const [uid, entry] of Object.entries(weightByDateByUid[d])) {
        if (baselineByUid[uid] == null) baselineByUid[uid] = entry.w;
      }
    }
    const crewPct: Array<number | null> = [];
    const myPct: Array<number | null> = [];
    for (const d of weekDates) {
      const day = weightByDateByUid[d] ?? {};
      const vals: number[] = [];
      let mine: number | null = null;
      for (const [uid, entry] of Object.entries(day)) {
        const base = baselineByUid[uid];
        if (!Number.isFinite(base) || base <= 0) continue;
        const pct = Math.round(((base - entry.w) / base) * 10000) / 100;
        vals.push(pct);
        if (uid === myUid) mine = pct;
      }
      crewPct.push(vals.length ? Math.round((vals.reduce((x, y) => x + y, 0) / vals.length) * 100) / 100 : null);
      myPct.push(mine);
    }

    // Calories: % of that day's loggers within their own budget.
    const onBudgetPct: Array<number | null> = [];
    let myOnBudgetDays = 0;
    let myLoggedDays = 0;
    const myBudget = Number(publicUsers[myUid]?.dailyCalorieGoal) || null;
    for (const d of weekDates) {
      const day = calsByDateByUid[d] ?? {};
      let ok = 0;
      let counted = 0;
      for (const [uid, total] of Object.entries(day)) {
        const budget = Number(publicUsers[uid]?.dailyCalorieGoal) || null;
        if (!budget) continue; // no budget -> can't judge, don't punish
        counted += 1;
        if (total <= budget * 1.2) ok += 1; // mirrors the scoring band's ceiling
      }
      onBudgetPct.push(counted ? Math.round((ok / counted) * 100) : null);
      if (day[myUid] != null && myBudget) {
        myLoggedDays += 1;
        if (day[myUid] <= myBudget * 1.2) myOnBudgetDays += 1;
      }
    }

    const crewMins = weekDates.map((d) => Math.round(((crewMinsByDate[d] ?? 0) / divisor) * 10) / 10);
    const myMins = weekDates.map((d) => myMinsByDate[d] ?? 0);
    return { crewMins, myMins, crewPct, myPct, onBudgetPct, myOnBudgetDays, myLoggedDays };
  }, [groupLogs, groupMeta?.memberCount, memberUids.length, publicUsers, user?.uid, weekDates]);

  /**
   * Chart model per metric. Elapsed days only (the line ends at today, no fake
   * zero-cliff). Primary = YOU where a personal series exists; crew rides as
   * the muted secondary — comparison is what makes the number interesting.
   */
  const chart = useMemo(() => {
    const todayStr = formatYYYYMMDD(new Date());
    const n = weekDates.filter((d) => d <= todayStr).length;
    const carry = (arr: Array<number | null>) => {
      let last = arr.find((v) => v != null) ?? 0;
      return arr.slice(0, n).map((v) => {
        if (v != null) last = v;
        return last as number;
      });
    };

    let series: number[];
    let secondary: number[] | undefined;
    let realCount: number;
    let title: string;
    let subtitle: string;

    if (metric === 'workout') {
      const mine = aggregates.myMins.slice(0, n);
      const crew = aggregates.crewMins.slice(0, n);
      const iLogged = mine.some((v) => v > 0);
      series = iLogged ? mine : crew;
      secondary = iLogged ? crew : undefined;
      realCount = series.filter((v) => v > 0).length;
      title = iLogged ? 'Minutes: you vs group avg' : 'Minutes: group avg';
      subtitle = iLogged ? 'Blue is you; grey is the group average' : 'Log a workout to see your own line';
    } else if (metric === 'weight') {
      const mineHas = aggregates.myPct.slice(0, n).some((v) => v != null);
      series = carry(mineHas ? aggregates.myPct : aggregates.crewPct);
      secondary = mineHas ? carry(aggregates.crewPct) : undefined;
      realCount = (mineHas ? aggregates.myPct : aggregates.crewPct).slice(0, n).filter((v) => v != null).length;
      title = mineHas ? '% lost this week: you vs group' : '% lost this week: group avg';
      subtitle = 'Change vs first weigh-in of the week';
    } else {
      series = aggregates.onBudgetPct.slice(0, n).map((v) => v ?? 0);
      secondary = undefined;
      realCount = aggregates.onBudgetPct.slice(0, n).filter((v) => v != null).length;
      title = 'Group on budget';
      subtitle = "% of the day's calorie-loggers within their own budget";
    }

    let yMin: number;
    let yMax: number;
    if (metric === 'weight') {
      const all = [...series, ...(secondary ?? [])];
      yMin = Math.min(...all);
      yMax = Math.max(...all);
      if (yMin === yMax) { yMin -= 1; yMax += 1; } else { const pad = (yMax - yMin) * 0.15; yMin -= pad; yMax += pad; }
    } else if (metric === 'calories') {
      yMin = 0; yMax = 100;
    } else {
      yMin = 0;
      yMax = Math.max(1, ...series, ...(secondary ?? [])) * 1.1;
    }
    return { series, secondary, yMin, yMax, realCount, title, subtitle, dates: weekDates.slice(0, n) };
  }, [aggregates, metric, weekDates]);

  const yTicks = useMemo(() => {
    if (chart.realCount === 0) return { top: '—', mid: '—', bot: '—' };
    const mid = (chart.yMin + chart.yMax) / 2;
    const fmt = (n: number) => (metric === 'weight' ? `${Math.round(n * 10) / 10}%` : `${Math.round(n)}`);
    return { top: fmt(chart.yMax), mid: fmt(mid), bot: fmt(chart.yMin) };
  }, [chart, metric]);

  const formatPointLabel = useMemo(() => {
    // Zero-days get no label (a row of "0"s was pure clutter). Labels apply to
    // the PRIMARY line only — the muted crew line stays unlabeled by design.
    if (metric === 'weight') return (v: number) => `${Math.round(v * 100) / 100}%`;
    if (metric === 'workout') return (v: number) => (v > 0 ? `${Math.round(v)}m` : '');
    return (v: number) => (v > 0 ? `${Math.round(v)}%` : '');
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

  // Header context: which week, how deep into it, framed as time left rather
  // than time spent — pressure is the register.
  const dayNum = matrix.todayIndex + 1;
  const headerRange = (() => {
    const fmt = (s: string) => {
      const d = parseYYYYMMDDLocal(s);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    return `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;
  })();

  return (
    <Screen scroll safeTop={false}>
      <Card>
        <AppText variant="eyebrow" color="muted">{headerRange}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <AppText variant="pageTitle" color="primary">Progress</AppText>
          {activeGroupName ? (
            <AppText variant="rowSubtitle" color="secondary" style={{ marginBottom: 4 }}>{activeGroupName}</AppText>
          ) : null}
        </View>
        {/* The week as a fuse: elapsed days fill, today burns, the rest waits. */}
        <View style={{ flexDirection: 'row', gap: 5, marginTop: spacing.md }}>
          {weekDates.map((d, i) => (
            <View
              key={d}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 3,
                backgroundColor: i < dayNum ? colors.primary : colors.surface2,
                opacity: i === matrix.todayIndex ? 1 : i < dayNum ? 0.55 : 1,
              }}
            />
          ))}
        </View>
        <AppText variant="label" color="muted" style={{ marginTop: spacing.sm }}>
          Day {dayNum} of 7 · {7 - dayNum} {7 - dayNum === 1 ? 'day' : 'days'} left to earn it
        </AppText>
        {groups.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.md }}>
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
        ) : null}
      </Card>

      <View style={{ height: spacing.base }} />

      {/* The group's week up top — who's showing up is the page's headline. */}
      <ConsistencyMatrix rows={matrix.rows} todayIndex={matrix.todayIndex} />

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

      <CrewWeekCard stats={crewWeek} />

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
              {chart.title}
            </AppText>
            <AppText variant="rowSubtitle" color="secondary">{chart.subtitle}</AppText>

            {/* Legend — only when two lines are actually drawn. */}
            {chart.secondary ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.base, marginTop: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: colors.primary }} />
                  <AppText variant="label" color="secondary">You</AppText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 16, height: 2, borderRadius: 2, backgroundColor: `${colors.textMuted}88` }} />
                  <AppText variant="label" color="muted">Group avg</AppText>
                </View>
              </View>
            ) : null}

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
                <View style={{ width: 48, justifyContent: 'space-between', height: 160, paddingVertical: 20 }}>
                  <AppText variant="label" color="muted" style={{ textAlign: 'right' }}>{yTicks.top}</AppText>
                  <AppText variant="label" color="muted" style={{ textAlign: 'right' }}>{yTicks.mid}</AppText>
                  <AppText variant="label" color="muted" style={{ textAlign: 'right' }}>{yTicks.bot}</AppText>
                </View>
                {/* MEASURED width, not estimated: the old width-minus-paddings
                    guess ran wider than the flex box, and overflow:hidden ate
                    the last point label + x tick (prod shots, 2026-08-12). */}
                <View
                  style={{ flex: 1, overflow: 'hidden' }}
                  onLayout={(e) => {
                    const w = Math.round(e.nativeEvent.layout.width);
                    if (w > 0 && w !== chartBoxW) setChartBoxW(w);
                  }}
                >
                  {chartBoxW > 0 ? (
                    <>
                      <TrendLineChart
                        values={chart.series}
                        secondaryValues={chart.secondary}
                        height={160}
                        width={chartBoxW}
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
                    </>
                  ) : (
                    <View style={{ height: 160 }} />
                  )}
                </View>
              </View>
            )}
          </View>
        {metric === 'calories' && aggregates.myLoggedDays > 0 ? (
          <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            You: {aggregates.myOnBudgetDays}/{aggregates.myLoggedDays} logged days on budget
          </AppText>
        ) : null}
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

