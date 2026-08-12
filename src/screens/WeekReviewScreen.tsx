import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon, Text } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SHOWN_KEY_PREFIX } from '../components/mmr/WeekReviewLauncher';

import { AuthContext } from '../store/AuthContext';
import { useActiveGroup } from '../store/ActiveGroupContext';
import { subscribeMmrWeeklyHistory, type MmrWeeklySummary } from '../services/mmrWeekly';
import { fetchGroupWeekDeltas } from '../services/publicUsers';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import RankEmblem from '../components/ui/RankEmblem';
import { colors, radius, spacing } from '../theme';
import type { RootStackParamList } from '../navigation/types';
import type { Tier } from '../mmr/types';

type Props = NativeStackScreenProps<RootStackParamList, 'WeekReview'>;

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const TIERS: Tier[] = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Challenger'];
const asTier = (x: unknown): Tier | null => ((TIERS as string[]).includes(String(x ?? '').trim()) ? (String(x).trim() as Tier) : null);

const GOAL_LABEL: Record<string, string> = {
  workouts: 'Workouts',
  minutes: 'Active minutes',
  calorieDays: 'Calorie days',
  weightLoss: 'Weight loss',
  weightGain: 'Weight gain',
};

function rankLabel(r?: { tier: string; division?: 1 | 2 | 3 | 4 | null } | null): string {
  if (!r?.tier) return 'Unranked';
  return `${r.tier}${r.division ? ` ${ROMAN[r.division]}` : ''}`;
}

function weekNumber(weekId: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
  return m ? String(Number(m[2])) : weekId;
}

/** Animated count-up for the headline FP delta. */
function CountUp({ to, color, prefix }: { to: number; color: string; prefix: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [val, setVal] = useState(0);

  useEffect(() => {
    const sub = anim.addListener(({ value }) => setVal(Math.round(value)));
    Animated.timing(anim, { toValue: to, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  return (
    <Text style={[styles.bigNumber, { color }]}>
      {prefix}
      {Math.abs(val)}
      <Text style={[styles.bigNumberUnit, { color }]}> FP</Text>
    </Text>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/**
 * "Last week in review" — a single scrollable report of the week that just
 * ended. Auto-opened once per week by WeekReviewLauncher (Mon-Wed) and
 * replayable from the Monday recap banner.
 *
 * Presentation note: this was a tap-through story until 2026-07-20. It's a
 * full rundown now so the whole week is legible without tapping, and so the
 * per-goal breakdown sits directly beside the result it explains.
 */
export default function WeekReviewScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();

  const [weeks, setWeeks] = useState<MmrWeeklySummary[] | null>(null); // null = still loading
  const [team, setTeam] = useState<Array<{ uid: string; name: string; delta: number }>>([]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMmrWeeklyHistory(user.uid, 8, setWeeks);
  }, [user?.uid]);

  const summary = useMemo(() => {
    if (!weeks) return null;
    const wanted = route.params?.weekId;
    if (wanted) return weeks.find((w) => w.weekId === wanted) ?? null;
    return weeks[0] ?? null;
  }, [weeks, route.params?.weekId]);

  useEffect(() => {
    if (!summary || !activeGroupId) return;
    let cancelled = false;
    fetchGroupWeekDeltas(activeGroupId, summary.weekId)
      .then((rows) => {
        if (!cancelled) setTeam(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [summary?.weekId, activeGroupId]);

  // Nothing to review (no scored weeks, or the requested week is gone) —
  // close gracefully instead of stranding the user on a blank takeover.
  useEffect(() => {
    if (weeks !== null && !summary) navigation.goBack();
  }, [weeks, summary, navigation]);

  // Mark the week's report as SHOWN only now that it actually rendered — this
  // is what stops the Mon-Wed auto-open from repeating. (The launcher no
  // longer pre-marks; a failed navigation therefore retries next open.)
  useEffect(() => {
    if (!summary || !user?.uid) return;
    void AsyncStorage.setItem(`${SHOWN_KEY_PREFIX}:${user.uid}`, summary.weekId).catch(() => {});
  }, [summary?.weekId, user?.uid]);

  const breakdown = useMemo(
    () => [...(summary?.goals ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    [summary],
  );

  if (!summary) return <View style={styles.container} />;

  const delta = Math.round(summary.deltaMMR);
  const deltaColor = delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.textSecondary;
  const statusLabel = summary.completedWeek ? 'Week completed' : summary.missedWeek ? 'Week missed' : 'Partial week';
  const statusColor = summary.completedWeek ? colors.success : summary.missedWeek ? colors.danger : colors.textSecondary;
  const tierAfter = asTier(summary.rankAfter?.tier);
  const promoted = !!summary.promotion;
  const demoted = !!summary.demotion;

  const myUid = user?.uid ?? '';
  const winner = team[0];
  const me = team.find((t) => t.uid === myUid);
  const myTeamRank = me ? team.indexOf(me) + 1 : null;

  const best = breakdown[0];
  const worst = breakdown.length > 1 ? breakdown[breakdown.length - 1] : null;

  const fmtDone = (g: { id: string; done?: number; target?: number }) => {
    if (g.done == null || !g.target) return '';
    if (g.id === 'minutes') return `${Math.round(g.done)} of ${g.target} min`;
    if (g.id === 'weightLoss' || g.id === 'weightGain') {
      const n = Math.round(g.done);
      return `${n} weigh-in${n === 1 ? '' : 's'}`;
    }
    return `${Math.round(g.done * 10) / 10} of ${g.target}`;
  };

  const takeaway = summary.completedWeek
    ? 'Full week banked. Do it again and the streak multiplier starts paying.'
    : best && worst && (worst.A ?? 0) < 0.7
      ? `${GOAL_LABEL[best.id] ?? best.id} carried the week — ${GOAL_LABEL[worst.id] ?? worst.id} is where the FP is hiding.`
      : 'Close one. A little more consistency turns this into a completed week.';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>LAST WEEK IN REVIEW</Text>
          <Text style={styles.headerTitle}>Week {weekNumber(summary.weekId)}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
          <Icon source="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Headline */}
        <View style={styles.hero}>
          <CountUp to={delta} color={deltaColor} prefix={delta >= 0 ? '+' : '−'} />
          <View style={[styles.statusPill, { borderColor: `${statusColor}66` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={styles.heroSub}>
            {Math.round(summary.mmrBefore)} → {Math.round(summary.mmrAfter)} FP
          </Text>
        </View>

        {/* Rank */}
        <Section title="Rank">
          <View style={styles.rankRow}>
            {tierAfter ? <RankEmblem tier={tierAfter} size={54} /> : <Text style={{ fontSize: 40 }}>🎖️</Text>}
            <View style={{ flex: 1, marginLeft: spacing.base }}>
              <Text style={styles.rankLabel}>{rankLabel(summary.rankAfter)}</Text>
              <Text style={[styles.rankSub, promoted ? { color: colors.success } : demoted ? { color: colors.danger } : null]}>
                {promoted
                  ? `Promoted from ${rankLabel(summary.promotion?.from)} 🎉`
                  : demoted
                    ? `Dropped from ${rankLabel(summary.demotion?.from)}`
                    : 'Held your ground'}
              </Text>
            </View>
          </View>
        </Section>

        {/* Per-goal breakdown — the "why" behind the headline number. */}
        {breakdown.length > 0 ? (
          <Section title="Where it came from">
            {breakdown.map((g) => {
              const pct = Math.round((g.A ?? 0) * 100);
              const tint = pct >= 70 ? colors.success : pct >= 40 ? colors.textPrimary : colors.danger;
              return (
                <View key={g.id} style={styles.goalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.goalName}>{GOAL_LABEL[g.id] ?? g.id}</Text>
                    {fmtDone(g) ? <Text style={styles.goalSub}>{fmtDone(g)}</Text> : null}
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: tint }]} />
                    </View>
                  </View>
                  <Text style={[styles.goalPct, { color: tint }]}>{pct}%</Text>
                </View>
              );
            })}
          </Section>
        ) : null}

        {/* Raw totals */}
        <Section title="The numbers">
          <View style={styles.tileRow}>
            <StatTile value={String(summary.workoutsDone)} label={summary.workoutsDone === 1 ? 'workout' : 'workouts'} />
            <StatTile value={String(Math.round(summary.minutesDone))} label="minutes" />
          </View>
          <View style={styles.tileRow}>
            <StatTile value={String(Math.round(summary.calorieDaysHit * 10) / 10)} label="calorie days" />
            <StatTile value={String(summary.weighInsDone)} label={summary.weighInsDone === 1 ? 'weigh-in' : 'weigh-ins'} />
          </View>
        </Section>

        {/* Scoring math */}
        <Section title="How it added up">
          <View style={styles.mathRow}>
            <Text style={styles.mathLabel}>Week score</Text>
            <Text style={styles.mathValue}>{Math.round(summary.weekScore)}</Text>
          </View>
          {summary.streakMultiplier > 1 ? (
            <View style={styles.mathRow}>
              <Text style={styles.mathLabel}>Streak multiplier</Text>
              <Text style={styles.mathValue}>×{summary.streakMultiplier.toFixed(2)}</Text>
            </View>
          ) : null}
          {summary.bonus > 0 ? (
            <View style={styles.mathRow}>
              <Text style={styles.mathLabel}>Bonus</Text>
              <Text style={[styles.mathValue, { color: colors.success }]}>+{Math.round(summary.bonus)}</Text>
            </View>
          ) : null}
          {summary.penalty > 0 ? (
            <View style={styles.mathRow}>
              <Text style={styles.mathLabel}>{summary.missedWeek ? 'Missed-week penalty' : 'Partial-week penalty'}</Text>
              <Text style={[styles.mathValue, { color: colors.danger }]}>−{Math.round(summary.penalty)}</Text>
            </View>
          ) : null}
          <View style={[styles.mathRow, styles.mathTotal]}>
            <Text style={styles.mathTotalLabel}>Net</Text>
            <Text style={[styles.mathTotalValue, { color: deltaColor }]}>
              {delta >= 0 ? '+' : '−'}
              {Math.abs(delta)} FP
            </Text>
          </View>
          <Text style={styles.streakLine}>
            {summary.streakAfter > 0
              ? `🔥 ${summary.streakAfter}-week streak alive`
              : '🌱 Streak reset — a completed week starts a new one'}
          </Text>
        </Section>

        {/* Team standings for the week */}
        {team.length > 0 ? (
          <Section title="Your group">
            {team.slice(0, 8).map((t, i) => {
              const isMe = t.uid === myUid;
              return (
                <View key={t.uid} style={styles.crewRow}>
                  <Text style={[styles.crewRank, i === 0 ? { color: colors.rankGold } : null]}>{i === 0 ? '🏆' : `${i + 1}`}</Text>
                  <Text style={[styles.crewName, isMe ? { color: colors.primary, fontWeight: '700' } : null]} numberOfLines={1}>
                    {isMe ? 'You' : friendlyNameFromDisplayName(t.name, t.uid)}
                  </Text>
                  <Text style={[styles.crewDelta, { color: t.delta >= 0 ? colors.success : colors.danger }]}>
                    {t.delta >= 0 ? '+' : ''}
                    {t.delta} FP
                  </Text>
                </View>
              );
            })}
            {myTeamRank && winner && winner.uid !== myUid ? (
              <Text style={styles.crewFoot}>
                You finished #{myTeamRank} of {team.length}.
              </Text>
            ) : winner && winner.uid === myUid && team.length > 1 ? (
              <Text style={styles.crewFoot}>Top of {team.length}. Defend it.</Text>
            ) : null}
          </Section>
        ) : null}

        {/* Takeaway + CTA */}
        <View style={styles.takeawayCard}>
          <Text style={styles.takeawayText}>{takeaway}</Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.9}
            onPress={() => {
              navigation.goBack();
              (navigation as any).navigate('LogComposer');
            }}
          >
            <Text style={styles.ctaText}>Log today</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 999, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  bigNumber: { fontSize: 60, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  bigNumberUnit: { fontSize: 24, fontWeight: '800' },
  statusPill: { marginTop: spacing.sm, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  statusText: { fontSize: 13, fontWeight: '700' },
  heroSub: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.sm, fontVariant: ['tabular-nums'] },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
    marginTop: spacing.base,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  rankRow: { flexDirection: 'row', alignItems: 'center' },
  rankLabel: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  rankSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  goalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  goalName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  goalSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  barTrack: { height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 7, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 999 },
  goalPct: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'], marginLeft: spacing.base },

  tileRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tile: { flex: 1, backgroundColor: colors.surface2, borderRadius: 12, paddingVertical: spacing.base, alignItems: 'center' },
  tileValue: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  mathRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  mathLabel: { fontSize: 14, color: colors.textSecondary },
  mathValue: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  mathTotal: { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 4, paddingTop: 10 },
  mathTotalLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  mathTotalValue: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  streakLine: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },

  crewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  crewRank: { width: 26, fontSize: 14, fontWeight: '700', color: colors.textMuted },
  crewName: { flex: 1, fontSize: 15, color: colors.textPrimary },
  crewDelta: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  crewFoot: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },

  takeawayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(233,181,66,0.35)',
    padding: spacing.base,
    marginTop: spacing.base,
  },
  takeawayText: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  ctaBtn: { marginTop: spacing.base, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
