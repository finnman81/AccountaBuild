import React, { useContext, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { useMyUnits } from '../hooks/useMyUnits';
import { fetchMyLogsInRange, type GroupLog } from '../services/logs';
import { subscribeMyProfile } from '../services/profile';
import { subscribeMyMmrGoals } from '../services/mmrGoals';
import { getHydrated, setHydrated } from '../services/hydrationCache';
import { formatDeltaForUnits, formatMinutesHM, formatWeightForUnits } from '../utils/formatters';
import { todayYYYYMMDD } from '../utils/dates';
import { prettyWorkout } from '../viewmodels/today';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import SegmentedControl from '../components/ui/SegmentedControl';
import TrendLineChart from '../components/charts/TrendLineChart';
import { colors, radius, spacing } from '../theme';
import { useEased } from '../hooks/useCached';
import type { ProgressStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ProgressStackParamList, 'MyStats'>;
type Metric = 'weight' | 'workout' | 'calories';
type Range = '4w' | '12w' | '6m' | 'all';

const RANGE_DAYS: Record<Range, number> = { '4w': 28, '12w': 84, '6m': 182, all: 365 };
const RANGE_LABEL: Record<Range, string> = { '4w': '4 weeks', '12w': '12 weeks', '6m': '6 months', all: 'Past year' };
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * My stats: the personal view the app never had. Progress is the GROUP's
 * week and History is one day at a time; nothing showed your own weight
 * curve, training volume or calorie habit over time. One screen, three
 * tabs, one date-ranged read of your own logs (every group holds the same
 * copies since logs fan out, so the active group is enough).
 */

function ymdMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function shortDate(s: string): string {
  return parseYmd(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Monday of the ISO week holding `ymd`, as YYYY-MM-DD (local). */
function weekStartOf(ymd: string): string {
  const d = parseYmd(ymd);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tsMs(l: GroupLog): number {
  const t: any = l.ts;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (t && typeof t.seconds === 'number') return t.seconds * 1000;
  return parseYmd(l.date).getTime();
}

/** Keep a line readable: at most `max` evenly spaced points. */
function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i += 1) out.push(items[Math.round(i * step)]!);
  return out;
}

function Stat({ label, value, sub, tint }: { label: string; value: string; sub?: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="label" color="muted">{label}</AppText>
      <AppText variant="numberMd" style={{ color: tint ?? colors.textPrimary, marginTop: 2 }}>{value}</AppText>
      {sub ? <AppText variant="label" color="secondary" style={{ marginTop: 2 }}>{sub}</AppText> : null}
    </View>
  );
}

/** Bars by week, newest on the right. */
function WeekBars({ weeks, max, tint, format }: { weeks: Array<{ start: string; value: number }>; max: number; tint: string; format: (v: number) => string }) {
  const shown = weeks.slice(-16);
  return (
    <View>
      <View style={styles.bars}>
        {shown.map((w) => {
          const h = max > 0 ? Math.max(w.value > 0 ? 4 : 0, Math.round((w.value / max) * 96)) : 0;
          return (
            <View key={w.start} style={styles.barCol}>
              {w.value > 0 ? <AppText variant="label" color="secondary" style={styles.barLabel}>{format(w.value)}</AppText> : null}
              <View style={[styles.bar, { height: h, backgroundColor: w.value > 0 ? tint : colors.surface2 }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.barAxis}>
        <AppText variant="label" color="muted">{shown[0] ? shortDate(shown[0].start) : ''}</AppText>
        <AppText variant="label" color="muted">{shown.length > 1 ? shortDate(shown[shown.length - 1]!.start) : ''}</AppText>
      </View>
    </View>
  );
}

export default function MyStatsScreen({ navigation, route }: Props) {
  const { user } = useContext(AuthContext);
  const { activeGroupId, groups } = useActiveGroup();
  const units = useMyUnits();
  const uid = user?.uid ?? '';
  const groupId = activeGroupId ?? groups[0]?.groupId ?? null;

  const [metric, setMetric] = useState<Metric>(route.params?.metric ?? 'weight');
  const [range, setRange] = useState<Range>('12w');
  const [chartW, setChartW] = useState(0);
  const [profile, setProfile] = useState<{ weightGoal: number | null; dailyCalorieGoal: number | null }>({ weightGoal: null, dailyCalorieGoal: null });
  const [goals, setGoals] = useState<Record<string, any>>({});

  const today = todayYYYYMMDD();
  const start = ymdMinus(RANGE_DAYS[range]);
  const cacheKey = uid ? `myStats:${uid}:${range}` : '';
  const [logs, setLogs] = useState<GroupLog[]>(() => (cacheKey ? getHydrated<GroupLog[]>(cacheKey) ?? [] : []));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid || !groupId) return;
    let cancelled = false;
    const cached = getHydrated<GroupLog[]>(cacheKey);
    if (cached) setLogs(cached);
    setLoading(!cached);
    fetchMyLogsInRange({ groupId, uid, startDate: start, endDate: today })
      .then((rows) => {
        if (cancelled) return;
        setLogs(rows);
        setHydrated(cacheKey, rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, groupId, start, today, cacheKey]);

  useEffect(() => {
    if (!uid) return;
    return subscribeMyProfile(uid, (p) => {
      if (p) setProfile({ weightGoal: p.weightGoal ?? null, dailyCalorieGoal: p.dailyCalorieGoal ?? null });
    });
  }, [uid]);
  useEffect(() => (uid ? subscribeMyMmrGoals(uid, setGoals) : undefined), [uid]);

  // ---- Weight -------------------------------------------------------------
  const weight = useMemo(() => {
    const byDay = new Map<string, { lb: number; at: number }>();
    for (const l of logs) {
      if (l.type !== 'weight') continue;
      const lb = Number((l.payload as any)?.weight);
      if (!Number.isFinite(lb) || lb <= 0) continue;
      const at = tsMs(l);
      const prev = byDay.get(l.date);
      if (!prev || at > prev.at) byDay.set(l.date, { lb, at });
    }
    const days = [...byDay.entries()].map(([date, v]) => ({ date, lb: v.lb })).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!days.length) return null;
    const first = days[0]!.lb;
    const last = days[days.length - 1]!.lb;
    const lbs = days.map((d) => d.lb);
    const lo = Math.min(...lbs);
    const hi = Math.max(...lbs);
    const weeks = new Set(days.map((d) => weekStartOf(d.date))).size;
    const goal = goals.weightLoss?.status === 'active' || goals.weightGain?.status === 'active' ? profile.weightGoal : null;
    const series = thin(days, 40);
    return {
      days,
      first,
      last,
      change: last - first,
      lo,
      hi,
      perWeek: weeks ? Math.round((days.length / weeks) * 10) / 10 : 0,
      goal,
      series: series.map((d) => d.lb),
      goalLine: goal != null ? series.map(() => goal) : undefined,
      yMin: Math.floor(Math.min(lo, goal ?? lo) - 2),
      yMax: Math.ceil(Math.max(hi, goal ?? hi) + 2),
      firstDate: days[0]!.date,
      lastDate: days[days.length - 1]!.date,
    };
  }, [logs, profile.weightGoal, goals]);

  // ---- Workouts -----------------------------------------------------------
  const workouts = useMemo(() => {
    const items = logs.filter((l) => l.type === 'workout');
    const dates = new Set(items.map((l) => l.date));
    let minutes = 0;
    const byType = new Map<string, { n: number; mins: number }>();
    const byWeek = new Map<string, Set<string>>();
    for (const l of items) {
      const mins = Number((l.payload as any)?.durationMinutes) || 0;
      minutes += mins;
      const t = String((l.payload as any)?.workoutType || 'other');
      const e = byType.get(t) ?? { n: 0, mins: 0 };
      e.n += 1;
      e.mins += mins;
      byType.set(t, e);
      const ws = weekStartOf(l.date);
      (byWeek.get(ws) ?? byWeek.set(ws, new Set()).get(ws)!).add(l.date);
    }
    // Every week in range, zero-filled, so a quiet week shows as a gap.
    const weeks: Array<{ start: string; value: number }> = [];
    for (let s = weekStartOf(start); s <= today; s = (() => { const d = parseYmd(s); d.setDate(d.getDate() + 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()) {
      weeks.push({ start: s, value: byWeek.get(s)?.size ?? 0 });
    }
    const target = goals.workouts?.status === 'active' ? Number(goals.workouts?.targetWorkoutsPerWeek) || null : null;
    const types = [...byType.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
    const recent = [...items].sort((a, b) => tsMs(b) - tsMs(a)).slice(0, 8);
    return { count: items.length, days: dates.size, minutes, weeks, target, types, recent, max: Math.max(7, ...weeks.map((w) => w.value)) };
  }, [logs, goals, start, today]);

  // ---- Calories -----------------------------------------------------------
  const calories = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const l of logs) {
      if (l.type !== 'calories') continue;
      const kcal = Number((l.payload as any)?.calories) || 0;
      byDay.set(l.date, (byDay.get(l.date) ?? 0) + kcal);
    }
    const days = [...byDay.entries()].map(([date, kcal]) => ({ date, kcal })).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!days.length) return null;
    const goal = profile.dailyCalorieGoal;
    const total = days.reduce((s, d) => s + d.kcal, 0);
    const avg = Math.round(total / days.length);
    const onBudget = goal ? days.filter((d) => d.kcal <= goal).length : null;
    const series = thin(days, 40);
    const vals = series.map((d) => d.kcal);
    const lo = Math.min(...vals, goal ?? Infinity);
    const hi = Math.max(...vals, goal ?? 0);
    const recent = [...days].reverse().slice(0, 8);
    return {
      days,
      avg,
      goal,
      onBudget,
      series: vals,
      goalLine: goal ? series.map(() => goal) : undefined,
      yMin: Math.max(0, Math.floor((lo - 200) / 100) * 100),
      yMax: Math.ceil((hi + 200) / 100) * 100,
      firstDate: days[0]!.date,
      lastDate: days[days.length - 1]!.date,
      recent,
    };
  }, [logs, profile.dailyCalorieGoal]);
  useEased(`${metric}|${range}|${logs.length}`);

  const empty = (what: string) => (
    <View style={styles.empty}>
      <Icon source="chart-line-variant" size={28} color={colors.textMuted} />
      <AppText variant="rowSubtitle" color="muted" style={{ textAlign: 'center', marginTop: spacing.sm }}>
        {loading ? 'Loading…' : `No ${what} logged in the last ${RANGE_LABEL[range].toLowerCase()}.`}
      </AppText>
    </View>
  );

  const chart = (series: number[], goalLine: number[] | undefined, yMin: number, yMax: number, firstDate: string, lastDate: string, fmt: (v: number) => string) => (
    <View onLayout={(e) => setChartW(Math.round(e.nativeEvent.layout.width))} style={{ overflow: 'hidden' }}>
      {chartW > 0 && series.length >= 2 ? (
        <TrendLineChart values={series} secondaryValues={goalLine} height={170} width={chartW} yMin={yMin} yMax={yMax} color={colors.primary} showPointLabels={series.length <= 12} formatPointLabel={fmt} labelColor={colors.textPrimary} />
      ) : (
        <View style={{ height: 170, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="rowSubtitle" color="muted">Log a few more days to see the trend.</AppText>
        </View>
      )}
      <View style={styles.axis}>
        <AppText variant="label" color="muted">{shortDate(firstDate)}</AppText>
        {goalLine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, height: 2, backgroundColor: `${colors.textMuted}88` }} />
            <AppText variant="label" color="muted">Goal</AppText>
          </View>
        ) : null}
        <AppText variant="label" color="muted">{shortDate(lastDate)}</AppText>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={8} accessibilityLabel="Back">
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>My stats</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SegmentedControl
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          variant="surface"
          options={[
            { value: 'weight', label: 'Weight' },
            { value: 'workout', label: 'Workouts' },
            { value: 'calories', label: 'Calories' },
          ]}
        />
        <View style={styles.ranges}>
          {(Object.keys(RANGE_DAYS) as Range[]).map((r) => {
            const on = r === range;
            return (
              <TouchableOpacity key={r} onPress={() => setRange(r)} style={[styles.rangeChip, on && styles.rangeChipOn]} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <AppText variant="label" color={on ? 'accent' : 'secondary'} style={{ fontWeight: '700' }}>{r.toUpperCase()}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {metric === 'weight' ? (
          !weight ? (
            <Card>{empty('weigh-ins')}</Card>
          ) : (
            <>
              <Card>
                <View style={styles.statRow}>
                  <Stat label="Current" value={formatWeightForUnits(weight.last, units)} sub={shortDate(weight.lastDate)} />
                  <Stat
                    label={RANGE_LABEL[range]}
                    value={`${weight.change > 0 ? '+' : ''}${formatDeltaForUnits(weight.change, units)}`}
                    sub={`from ${formatWeightForUnits(weight.first, units)}`}
                    tint={weight.change < 0 ? colors.success : weight.change > 0 ? colors.rankGold : colors.textPrimary}
                  />
                  {weight.goal != null ? (
                    <Stat label="Goal" value={formatWeightForUnits(weight.goal, units)} sub={`${formatDeltaForUnits(Math.abs(weight.last - weight.goal), units)} to go`} />
                  ) : (
                    <Stat label="Weigh-ins" value={`${weight.days.length}`} sub={`${weight.perWeek}/week`} />
                  )}
                </View>
                <View style={{ height: spacing.base }} />
                {chart(weight.series, weight.goalLine, weight.yMin, weight.yMax, weight.firstDate, weight.lastDate, (v) => formatWeightForUnits(v, units).replace(/ (lb|kg)$/, ''))}
              </Card>
              <View style={{ height: spacing.base }} />
              <Card>
                <View style={styles.statRow}>
                  <Stat label="Lowest" value={formatWeightForUnits(weight.lo, units)} />
                  <Stat label="Highest" value={formatWeightForUnits(weight.hi, units)} />
                  <Stat label="Weigh-ins" value={`${weight.days.length}`} sub={`${weight.perWeek}/week`} />
                </View>
              </Card>
              <View style={{ height: spacing.base }} />
              <Card>
                <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.sm }}>Recent weigh-ins</AppText>
                {[...weight.days].reverse().slice(0, 8).map((d, i, arr) => {
                  const prev = weight.days[weight.days.length - 2 - i];
                  const delta = prev ? d.lb - prev.lb : null;
                  return (
                    <View key={d.date} style={[styles.row, i < arr.length - 1 && styles.rowDivider]}>
                      <AppText variant="rowSubtitle" color="secondary" style={{ flex: 1 }}>{shortDate(d.date)}</AppText>
                      {delta != null && Math.abs(delta) >= 0.05 ? (
                        <AppText variant="label" style={{ color: delta < 0 ? colors.success : colors.rankGold, marginRight: spacing.md }}>
                          {delta > 0 ? '+' : ''}{formatDeltaForUnits(delta, units)}
                        </AppText>
                      ) : null}
                      <AppText variant="rowTitle" color="primary">{formatWeightForUnits(d.lb, units)}</AppText>
                    </View>
                  );
                })}
              </Card>
            </>
          )
        ) : null}

        {metric === 'workout' ? (
          workouts.count === 0 ? (
            <Card>{empty('workouts')}</Card>
          ) : (
            <>
              <Card>
                <View style={styles.statRow}>
                  <Stat label="Workouts" value={`${workouts.count}`} sub={`${workouts.days} days trained`} />
                  <Stat label="Total time" value={formatMinutesHM(workouts.minutes)} sub={`${formatMinutesHM(Math.round(workouts.minutes / Math.max(1, workouts.count)))} avg`} />
                  <Stat label="Per week" value={`${Math.round((workouts.days / Math.max(1, workouts.weeks.length)) * 10) / 10}`} sub={workouts.target ? `goal ${workouts.target}` : 'days'} />
                </View>
                <View style={{ height: spacing.base }} />
                <AppText variant="label" color="muted" style={{ marginBottom: spacing.sm }}>DAYS TRAINED PER WEEK</AppText>
                <WeekBars weeks={workouts.weeks} max={workouts.max} tint={colors.primary} format={(v) => `${v}`} />
                {workouts.target ? (
                  <AppText variant="label" color="muted" style={{ marginTop: spacing.sm }}>
                    {workouts.weeks.filter((w) => w.value >= (workouts.target ?? 0)).length} of {workouts.weeks.length} weeks hit your {workouts.target}-day goal
                  </AppText>
                ) : null}
              </Card>
              <View style={{ height: spacing.base }} />
              <Card>
                <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.sm }}>By type</AppText>
                {workouts.types.map(([t, e], i, arr) => (
                  <View key={t} style={[styles.row, i < arr.length - 1 && styles.rowDivider]}>
                    <AppText variant="rowSubtitle" color="primary" style={{ flex: 1 }}>{prettyWorkout(t)}</AppText>
                    <AppText variant="label" color="muted" style={{ marginRight: spacing.md }}>{formatMinutesHM(e.mins)}</AppText>
                    <AppText variant="rowTitle" color="primary">{e.n}</AppText>
                  </View>
                ))}
              </Card>
              <View style={{ height: spacing.base }} />
              <Card>
                <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.sm }}>Recent workouts</AppText>
                {workouts.recent.map((l, i, arr) => (
                  <View key={l.id} style={[styles.row, i < arr.length - 1 && styles.rowDivider]}>
                    <AppText variant="rowSubtitle" color="secondary" style={{ width: 64 }}>{shortDate(l.date)}</AppText>
                    <AppText variant="rowSubtitle" color="primary" style={{ flex: 1 }}>{prettyWorkout((l.payload as any)?.workoutType)}</AppText>
                    <AppText variant="rowTitle" color="primary">{formatMinutesHM(Number((l.payload as any)?.durationMinutes) || 0)}</AppText>
                  </View>
                ))}
              </Card>
            </>
          )
        ) : null}

        {metric === 'calories' ? (
          !calories ? (
            <Card>{empty('calories')}</Card>
          ) : (
            <>
              <Card>
                <View style={styles.statRow}>
                  <Stat label="Daily average" value={calories.avg.toLocaleString()} sub="kcal, logged days" />
                  {calories.goal ? (
                    <Stat label="On budget" value={`${calories.onBudget}/${calories.days.length}`} sub={`${Math.round(((calories.onBudget ?? 0) / calories.days.length) * 100)}% of days`} tint={colors.success} />
                  ) : (
                    <Stat label="Days logged" value={`${calories.days.length}`} />
                  )}
                  <Stat label="Goal" value={calories.goal ? calories.goal.toLocaleString() : '—'} sub={calories.goal ? `${calories.avg <= calories.goal ? '-' : '+'}${Math.abs(calories.avg - calories.goal).toLocaleString()} avg` : 'not set'} />
                </View>
                <View style={{ height: spacing.base }} />
                {chart(calories.series, calories.goalLine, calories.yMin, calories.yMax, calories.firstDate, calories.lastDate, (v) => `${Math.round(v / 100) / 10}k`)}
              </Card>
              <View style={{ height: spacing.base }} />
              <Card>
                <AppText variant="rowTitle" color="primary" style={{ marginBottom: spacing.sm }}>Recent days</AppText>
                {calories.recent.map((d, i, arr) => {
                  const over = calories.goal ? d.kcal > calories.goal : false;
                  return (
                    <View key={d.date} style={[styles.row, i < arr.length - 1 && styles.rowDivider]}>
                      <AppText variant="rowSubtitle" color="secondary" style={{ flex: 1 }}>{shortDate(d.date)}</AppText>
                      {calories.goal ? (
                        <AppText variant="label" style={{ color: over ? colors.rankGold : colors.success, marginRight: spacing.md }}>
                          {over ? `+${(d.kcal - calories.goal).toLocaleString()}` : 'on budget'}
                        </AppText>
                      ) : null}
                      <AppText variant="rowTitle" color="primary">{d.kcal.toLocaleString()} kcal</AppText>
                    </View>
                  );
                })}
              </Card>
            </>
          )
        ) : null}
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
  ranges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.base },
  rangeChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface2 },
  rangeChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.tile, padding: spacing.md },
  empty: { height: 180, alignItems: 'center', justifyContent: 'center' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingHorizontal: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 118 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 10, marginBottom: 3 },
  barAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
});
