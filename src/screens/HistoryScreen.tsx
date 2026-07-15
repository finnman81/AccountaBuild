import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { useMyUnits } from '../hooks/useMyUnits';
import { fetchMyLogsInRange, type GroupLog, type LogType } from '../services/logs';
import { subscribeMmrWeeklyHistory, type MmrWeeklySummary } from '../services/mmrWeekly';
import { formatWeightForUnits } from '../utils/formatters';
import { todayYYYYMMDD } from '../utils/dates';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import Tag from '../components/ui/Tag';
import { colors, radius, spacing } from '../theme';
import type { ProgressStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<ProgressStackParamList, 'History'>;

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const TYPE_META: Record<string, { icon: string; tint: string; label: (l: GroupLog, units: 'imperial' | 'metric') => string }> = {
  workout: {
    icon: 'dumbbell',
    tint: colors.primary,
    label: (l) => {
      const mins = Number(l.payload?.durationMinutes) || 0;
      const t = String(l.payload?.workoutType ?? 'workout');
      return `${t.charAt(0).toUpperCase()}${t.slice(1)} · ${mins} min`;
    },
  },
  calories: {
    icon: 'silverware-fork-knife',
    tint: colors.rankGold,
    label: (l) => {
      const kcal = Number(l.payload?.calories) || 0;
      const meal = String(l.payload?.meal ?? 'all');
      return `${kcal.toLocaleString()} kcal${meal !== 'all' ? ` · ${meal}` : ''}`;
    },
  },
  weight: {
    icon: 'scale-bathroom',
    tint: colors.success,
    label: (l, units) => formatWeightForUnits(Number(l.payload?.weight) || null, units),
  },
  photo: { icon: 'camera', tint: colors.textSecondary, label: () => 'Progress photo' },
};

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthRange(year: number, month: number): { start: string; end: string; daysInMonth: number; firstWeekday: number } {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first weekday index of the 1st (JS getDay: 0=Sun).
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  return { start: ymd(year, month, 1), end: ymd(year, month, daysInMonth), daysInMonth, firstWeekday };
}

function prettyDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function tsMs(ts: any): number {
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

/**
 * History: browse past days and weeks (view-only). Month calendar with
 * activity dots, tap a day for that day's logs, and a weekly FP summary strip.
 */
export default function HistoryScreen({ navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const units = useMyUnits();
  const today = todayYYYYMMDD();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [weeks, setWeeks] = useState<MmrWeeklySummary[]>([]);
  const [expandedWeekId, setExpandedWeekId] = useState<string | null>(null);

  const { start, end, daysInMonth, firstWeekday } = useMemo(() => monthRange(year, month), [year, month]);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  useEffect(() => {
    if (!user?.uid || !activeGroupId) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMyLogsInRange({ groupId: activeGroupId, uid: user.uid, startDate: start, endDate: end })
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, activeGroupId, start, end]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMmrWeeklyHistory(user.uid, 12, setWeeks);
  }, [user?.uid]);

  const byDate = useMemo(() => {
    const map = new Map<string, GroupLog[]>();
    for (const l of logs) {
      const arr = map.get(l.date) ?? [];
      arr.push(l);
      map.set(l.date, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => tsMs(a.ts) - tsMs(b.ts));
    return map;
  }, [logs]);

  const dayTypes = useMemo(() => {
    const map = new Map<string, Set<LogType>>();
    for (const l of logs) {
      const set = map.get(l.date) ?? new Set<LogType>();
      set.add(l.type);
      map.set(l.date, set);
    }
    return map;
  }, [logs]);

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    if (d > now) return; // no future months
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const selectedLogs = byDate.get(selectedDate) ?? [];
  const selectedInMonth = selectedDate >= start && selectedDate <= end;

  // Calendar cells: leading blanks + days.
  const cells: Array<{ key: string; day?: number; date?: string }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ key: `blank-${i}` });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ key: `d-${d}`, day: d, date: ymd(year, month, d) });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <Icon source="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText variant="pageTitle" color="primary" style={styles.title}>History</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Month navigator */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => goMonth(-1)} hitSlop={10} style={styles.monthBtn} accessibilityLabel="Previous month">
            <Icon source="chevron-left" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
          <AppText variant="rowTitle" color="primary">{MONTHS[month]} {year}</AppText>
          <TouchableOpacity
            onPress={() => goMonth(1)}
            hitSlop={10}
            style={[styles.monthBtn, isCurrentMonth && { opacity: 0.3 }]}
            disabled={isCurrentMonth}
            accessibilityLabel="Next month"
          >
            <Icon source="chevron-right" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Calendar grid */}
        <View style={styles.weekdayRow}>
          {DAY_LABELS.map((l, i) => (
            <AppText key={`${l}-${i}`} variant="label" color="muted" style={styles.weekdayCell}>{l}</AppText>
          ))}
        </View>
        <View style={styles.grid}>
          {cells.map((c) => {
            if (!c.day || !c.date) return <View key={c.key} style={styles.dayCell} />;
            const isFuture = c.date > today;
            const isSelected = c.date === selectedDate;
            const isToday = c.date === today;
            const types = dayTypes.get(c.date);
            return (
              <TouchableOpacity
                key={c.key}
                style={styles.dayCell}
                disabled={isFuture}
                onPress={() => setSelectedDate(c.date!)}
                accessibilityLabel={prettyDay(c.date)}
              >
                <View style={[styles.dayInner, isSelected && styles.daySelected, isToday && !isSelected && styles.dayToday, isFuture && { opacity: 0.3 }]}>
                  <AppText variant="rowSubtitle" color={isSelected ? 'accent' : 'primary'} style={{ fontWeight: isToday ? '800' : '500' }}>
                    {c.day}
                  </AppText>
                  <View style={styles.dotRow}>
                    {types?.has('workout') && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
                    {types?.has('calories') && <View style={[styles.dot, { backgroundColor: colors.rankGold }]} />}
                    {(types?.has('weight') || types?.has('photo')) && <View style={[styles.dot, { backgroundColor: colors.success }]} />}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} /><AppText variant="label" color="muted">Workout</AppText>
          <View style={[styles.dot, { backgroundColor: colors.rankGold, marginLeft: spacing.md }]} /><AppText variant="label" color="muted">Calories</AppText>
          <View style={[styles.dot, { backgroundColor: colors.success, marginLeft: spacing.md }]} /><AppText variant="label" color="muted">Weigh-in / photo</AppText>
        </View>

        {/* Day detail */}
        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>{prettyDay(selectedDate)}</AppText>
        <Card>
          {loading && selectedInMonth ? (
            <AppText variant="rowSubtitle" color="muted">Loading…</AppText>
          ) : selectedLogs.length === 0 ? (
            <AppText variant="rowSubtitle" color="muted">
              {selectedInMonth ? 'Nothing logged this day.' : 'Pick a day in this month to see its logs.'}
            </AppText>
          ) : (
            selectedLogs.map((l, i) => {
              const meta = TYPE_META[l.type] ?? TYPE_META.workout!;
              return (
                <View key={l.id} style={[styles.logRow, i < selectedLogs.length - 1 && styles.logDivider]}>
                  <View style={[styles.logIcon, { backgroundColor: `${meta.tint}22` }]}>
                    <Icon source={meta.icon} size={18} color={meta.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="rowTitle" color="primary">{meta.label(l, units)}</AppText>
                    <AppText variant="rowSubtitle" color="muted" style={{ textTransform: 'capitalize' }}>{l.type}</AppText>
                  </View>
                  {typeof l.fpDelta === 'number' && l.fpDelta > 0 ? (
                    <AppText variant="rowSubtitle" style={{ color: colors.rankGold, fontWeight: '700' }}>{`+${l.fpDelta} FP`}</AppText>
                  ) : null}
                </View>
              );
            })
          )}
        </Card>

        {/* Weekly FP summaries */}
        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Past weeks</AppText>
        {weeks.length === 0 ? (
          <Card><AppText variant="rowSubtitle" color="muted">No scored weeks yet.</AppText></Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {weeks.map((w) => {
              const delta = Math.round(w.deltaMMR);
              const deltaTxt = `${delta >= 0 ? '+' : ''}${delta} FP`;
              const deltaColor = delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.textSecondary;
              const status = w.missedWeek ? 'Missed' : w.completedWeek ? 'Completed' : 'Partial';
              const expanded = expandedWeekId === w.weekId;
              return (
                <TouchableOpacity key={w.weekId} activeOpacity={0.85} onPress={() => setExpandedWeekId(expanded ? null : w.weekId)}>
                  <Card>
                    <View style={styles.weekRow}>
                      <AppText variant="rowTitle" color="primary">{w.weekId}</AppText>
                      <Tag label={status} variant="subtle" />
                      <View style={{ flex: 1 }} />
                      <AppText variant="rowTitle" style={{ color: deltaColor }}>{deltaTxt}</AppText>
                      <Icon source={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                    </View>
                    {expanded ? (
                      <View style={styles.weekDetail}>
                        <AppText variant="rowSubtitle" color="secondary">
                          FP {Math.round(w.mmrBefore)} → {Math.round(w.mmrAfter)} · streak ×{w.streakMultiplier.toFixed(2)}
                        </AppText>
                        <AppText variant="rowSubtitle" color="muted" style={{ marginTop: 2 }}>
                          Bonus {Math.round(w.bonus)} · Penalty {Math.round(w.penalty)}
                          {w.promotion ? ' · Promoted 🎉' : w.demotion ? ' · Demoted' : ''}
                        </AppText>
                      </View>
                    ) : null}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
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
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs, marginBottom: spacing.md },
  monthBtn: { width: 36, height: 36, borderRadius: 999, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },

  weekdayRow: { flexDirection: 'row', marginBottom: spacing.xs },
  weekdayCell: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayInner: { width: 40, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  daySelected: { backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: 'rgba(62,139,255,0.45)' },
  dayToday: { borderWidth: 1, borderColor: colors.faint, borderStyle: 'dashed' },
  dotRow: { flexDirection: 'row', gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.md },

  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  logDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  logIcon: { width: 36, height: 36, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },

  weekRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekDetail: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
});
