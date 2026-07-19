import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

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

function rankLabel(r?: { tier: string; division?: 1 | 2 | 3 | 4 | null } | null): string {
  if (!r?.tier) return 'Unranked';
  return `${r.tier}${r.division ? ` ${ROMAN[r.division]}` : ''}`;
}

function weekNumber(weekId: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
  return m ? String(Number(m[2])) : weekId;
}

/** Animated count-up number (FP delta on the intro card). */
function CountUp({ to, color, prefix }: { to: number; color: string; prefix: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [val, setVal] = useState(0);

  useEffect(() => {
    const sub = anim.addListener(({ value }) => setVal(Math.round(value)));
    Animated.timing(anim, { toValue: to, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
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

type StoryCard = {
  key: string;
  eyebrow: string;
  render: () => React.ReactNode;
};

/**
 * "Your Week" — a tappable story-style week in review (Wrapped-style).
 * Auto-opened once per week by WeekReviewLauncher on the first app open after
 * the week rolls over; replayable from the Monday recap banner.
 */
export default function WeekReviewScreen({ route, navigation }: Props) {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();

  const [weeks, setWeeks] = useState<MmrWeeklySummary[] | null>(null); // null = still loading
  const [team, setTeam] = useState<Array<{ uid: string; name: string; delta: number }>>([]);
  const [index, setIndex] = useState(0);

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardRise = useRef(new Animated.Value(0)).current;

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

  // Card entrance animation on every card change.
  useEffect(() => {
    cardOpacity.setValue(0);
    cardRise.setValue(0);
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(cardRise, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, summary?.weekId]);

  const cards = useMemo<StoryCard[]>(() => {
    if (!summary) return [];
    const delta = Math.round(summary.deltaMMR);
    const deltaColor = delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.textSecondary;
    const statusLine = summary.completedWeek ? 'Week completed ✅' : summary.missedWeek ? 'Week missed' : 'Partial week';
    const tierAfter = asTier(summary.rankAfter?.tier);
    const promoted = !!summary.promotion;
    const demoted = !!summary.demotion;
    const myUid = user?.uid ?? '';
    const winner = team[0];
    const me = team.find((t) => t.uid === myUid);
    const myTeamRank = me ? team.indexOf(me) + 1 : null;

    const out: StoryCard[] = [
      {
        key: 'intro',
        eyebrow: `WEEK ${weekNumber(summary.weekId)} IS IN THE BOOKS`,
        render: () => (
          <>
            <CountUp to={delta} color={deltaColor} prefix={delta >= 0 ? '+' : '−'} />
            <Text style={styles.cardBody}>{statusLine}</Text>
            <Text style={styles.cardSub}>
              {Math.round(summary.mmrBefore)} → {Math.round(summary.mmrAfter)} FP
            </Text>
          </>
        ),
      },
      {
        key: 'training',
        eyebrow: 'TRAINING',
        render: () => (
          <>
            <Text style={styles.emoji}>💪</Text>
            <Text style={styles.bigStat}>{summary.workoutsDone}</Text>
            <Text style={styles.cardBody}>workout{summary.workoutsDone === 1 ? '' : 's'}</Text>
            <Text style={styles.cardSub}>
              {summary.minutesDone > 0
                ? `${summary.minutesDone} minutes${summary.workoutsDone > 0 ? ` · ~${Math.round(summary.minutesDone / Math.max(1, summary.workoutsDone))} min each` : ''}`
                : 'No sessions logged'}
            </Text>
          </>
        ),
      },
      {
        key: 'consistency',
        eyebrow: 'CONSISTENCY',
        render: () => (
          <>
            <Text style={styles.emoji}>{summary.streakAfter > 0 ? '🔥' : '🌱'}</Text>
            <Text style={styles.bigStat}>
              {summary.streakAfter > 0 ? `${summary.streakAfter}` : '0'}
              <Text style={styles.bigStatUnit}> wk streak</Text>
            </Text>
            <Text style={styles.cardBody}>
              {summary.calorieDaysHit} calorie day{summary.calorieDaysHit === 1 ? '' : 's'} · {summary.weighInsDone} weigh-in{summary.weighInsDone === 1 ? '' : 's'}
            </Text>
            <Text style={styles.cardSub}>
              {summary.streakAfter > 1
                ? 'The chain grows. Protect it.'
                : summary.completedWeek
                  ? 'A new chain begins.'
                  : 'A fresh week is a fresh chain.'}
            </Text>
          </>
        ),
      },
      {
        key: 'rank',
        eyebrow: 'RANK',
        render: () => (
          <>
            {tierAfter ? <RankEmblem tier={tierAfter} size={84} /> : <Text style={styles.emoji}>🎖️</Text>}
            <Text style={[styles.bigStat, { marginTop: spacing.md }]}>{rankLabel(summary.rankAfter)}</Text>
            <Text style={[styles.cardBody, promoted ? { color: colors.success } : demoted ? { color: colors.danger } : null]}>
              {promoted
                ? `Promoted from ${rankLabel(summary.promotion?.from)} 🎉`
                : demoted
                  ? `Dropped from ${rankLabel(summary.demotion?.from)}`
                  : `Held your ground`}
            </Text>
            {summary.streakMultiplier > 1 ? (
              <Text style={styles.cardSub}>Streak multiplier ×{summary.streakMultiplier.toFixed(2)}</Text>
            ) : null}
          </>
        ),
      },
    ];

    // WHERE IT CAME FROM — per-goal contribution. Only for weeks scored after
    // the breakdown started being persisted; older weeks simply skip the card.
    const breakdown = summary.goals ?? [];
    if (breakdown.length > 0) {
      const GOAL_LABEL: Record<string, string> = {
        workouts: 'Workouts',
        minutes: 'Active minutes',
        calorieDays: 'Calorie days',
        weightLoss: 'Weight loss',
        weightGain: 'Weight gain',
      };
      const fmtDone = (g: { id: string; done?: number; target?: number }) => {
        if (g.done == null || !g.target) return '';
        if (g.id === 'minutes') return `${Math.round(g.done)} / ${g.target} min`;
        if (g.id === 'weightLoss' || g.id === 'weightGain') return `${Math.round(g.done)} weigh-in${Math.round(g.done) === 1 ? '' : 's'}`;
        return `${Math.round(g.done * 10) / 10} / ${g.target}`;
      };
      const ranked = [...breakdown].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const best = ranked[0];
      const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
      out.push({
        key: 'breakdown',
        eyebrow: 'WHERE IT CAME FROM',
        render: () => (
          <>
            <Text style={styles.emoji}>🧮</Text>
            <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
              {ranked.map((g) => {
                const pct = Math.round(g.A * 100);
                const tint = pct >= 70 ? colors.success : pct >= 40 ? colors.textPrimary : colors.danger;
                return (
                  <View key={g.id} style={styles.breakdownRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.breakdownLabel}>{GOAL_LABEL[g.id] ?? g.id}</Text>
                      {fmtDone(g) ? <Text style={styles.breakdownSub}>{fmtDone(g)}</Text> : null}
                    </View>
                    <Text style={[styles.breakdownPct, { color: tint }]}>{pct}%</Text>
                  </View>
                );
              })}
            </View>
            <Text style={[styles.cardSub, { marginTop: spacing.md }]}>
              {worst && (worst.A ?? 0) < 0.7
                ? `${GOAL_LABEL[best.id] ?? best.id} carried the week. ${GOAL_LABEL[worst.id] ?? worst.id} is where the FP is hiding.`
                : 'Every goal pulled its weight.'}
            </Text>
          </>
        ),
      });
    }

    if (winner) {
      out.push({
        key: 'team',
        eyebrow: 'YOUR CREW',
        render: () => (
          <>
            <Text style={styles.emoji}>🏆</Text>
            <Text style={styles.bigStat}>{winner.uid === myUid ? 'You' : friendlyNameFromDisplayName(winner.name, winner.uid)}</Text>
            <Text style={styles.cardBody}>
              won the week ({winner.delta >= 0 ? '+' : ''}{winner.delta} FP)
            </Text>
            {myTeamRank && winner.uid !== myUid ? (
              <Text style={styles.cardSub}>You finished #{myTeamRank} of {team.length}</Text>
            ) : winner.uid === myUid && team.length > 1 ? (
              <Text style={styles.cardSub}>Top of {team.length} teammates. Defend it.</Text>
            ) : null}
          </>
        ),
      });
    }

    out.push({
      key: 'next',
      eyebrow: 'NEW WEEK',
      render: () => (
        <>
          <Text style={styles.emoji}>🚀</Text>
          <Text style={styles.bigStat}>Week {Number(weekNumber(summary.weekId)) + 1}</Text>
          <Text style={styles.cardBody}>starts now — the first log sets your pace.</Text>
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
        </>
      ),
    });

    return out;
  }, [summary, team, user?.uid, navigation]);

  // Nothing to review (no scored weeks, or the requested week is gone) —
  // close gracefully instead of stranding the user on a blank takeover.
  useEffect(() => {
    if (weeks !== null && !summary) navigation.goBack();
  }, [weeks, summary, navigation]);

  if (!summary || cards.length === 0) return <View style={styles.container} />;

  const card = cards[Math.min(index, cards.length - 1)]!;
  const advance = () => {
    if (index >= cards.length - 1) navigation.goBack();
    else setIndex(index + 1);
  };
  const retreat = () => setIndex(Math.max(0, index - 1));

  const translateY = cardRise.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Story progress bars */}
      <View style={styles.progressRow}>
        {cards.map((c, i) => (
          <View key={c.key} style={[styles.progressSeg, i <= index && styles.progressSegDone]} />
        ))}
      </View>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Your Week</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
          <Icon source="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tap left third = back, right two-thirds = next */}
      <View style={styles.body}>
        <Pressable style={styles.tapBack} onPress={retreat} />
        <Pressable style={styles.tapNext} onPress={advance} />
        <Animated.View pointerEvents="box-none" style={[styles.card, { opacity: cardOpacity, transform: [{ translateY }] }]}>
          <Text style={styles.eyebrow}>{card.eyebrow}</Text>
          {card.render()}
        </Animated.View>
      </View>

      <Text style={styles.hint}>{index < cards.length - 1 ? 'Tap to continue' : 'Tap to finish'}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  progressRow: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  progressSeg: { flex: 1, height: 3, borderRadius: 999, backgroundColor: colors.surface2 },
  progressSegDone: { backgroundColor: colors.primary },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  topTitle: { flex: 1, color: colors.textMuted, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  closeBtn: { width: 34, height: 34, borderRadius: 999, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tapBack: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '33%', zIndex: 2 },
  tapNext: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '67%', zIndex: 2 },
  card: { alignItems: 'center', paddingHorizontal: spacing.xl },

  eyebrow: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: spacing.lg },
  emoji: { fontSize: 44, marginBottom: spacing.md },
  bigNumber: { fontSize: 72, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  bigNumberUnit: { fontSize: 28, fontWeight: '800', letterSpacing: 0 },
  bigStat: { color: colors.textPrimary, fontSize: 40, fontWeight: '800', letterSpacing: -1, textAlign: 'center' },
  bigStatUnit: { fontSize: 20, fontWeight: '700', color: colors.textSecondary },
  cardBody: { color: colors.textPrimary, fontSize: 17, fontWeight: '600', marginTop: spacing.md, textAlign: 'center' },
  cardSub: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },

  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  breakdownLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  breakdownSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  breakdownPct: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  ctaBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.xl,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingBottom: spacing.md },
});
