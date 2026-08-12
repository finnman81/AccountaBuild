import React from 'react';
import { StyleSheet, View } from 'react-native';

import AppText from '../ui/AppText';
import Card from '../ui/Card';
import { colors, radius, spacing } from '../../theme';
import { formatMinutesHM } from '../../utils/formatters';

export type CrewWeekStats = {
  workouts: number;
  minutes: number;
  /** Sum of per-member weight DROPPED this week (first→last weigh-in), lb. */
  lbDropped: number;
  longestSession: { name: string; minutes: number } | null;
  biggestDay: { label: string; minutes: number } | null;
  mostConsistent: { name: string; days: number } | null;
  deltas: { workouts: number | null; minutes: number | null };
};

function Tile({ emoji, tint, value, label, delta }: { emoji: string; tint: string; value: string; label: string; delta?: number | null }) {
  return (
    <View style={[styles.tile, { borderColor: `${tint}44` }]}>
      <View style={[styles.emblem, { backgroundColor: `${tint}1C` }]}>
        <AppText style={styles.emoji}>{emoji}</AppText>
      </View>
      <View style={styles.valueRow}>
        <AppText variant="numberMd" color="primary" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {value}
        </AppText>
        {delta != null && delta !== 0 ? (
          <AppText variant="label" style={{ color: delta > 0 ? colors.success : colors.danger }}>
            {delta > 0 ? '▲' : '▼'}
          </AppText>
        ) : null}
      </View>
      <AppText variant="label" color="muted">{label}</AppText>
    </View>
  );
}

/**
 * TOTALS, not averages. "The crew logged 2,140 minutes" scales with effort and
 * feels collective; "average 47m" describes nobody (and averaged calories
 * across cutters and bulkers was actively misleading — deliberately absent).
 */
export default function CrewWeekCard({ stats }: { stats: CrewWeekStats }) {
  const records: string[] = [];
  if (stats.longestSession) records.push(`🏆 Longest: ${stats.longestSession.name}, ${stats.longestSession.minutes}m`);
  if (stats.biggestDay) records.push(`🔥 Biggest day: ${stats.biggestDay.label}`);
  if (stats.mostConsistent) records.push(`📆 Most days logged: ${stats.mostConsistent.name} (${stats.mostConsistent.days})`);

  return (
    <Card>
      <AppText variant="rowTitle" color="primary">Your group this week</AppText>
      <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2, marginBottom: spacing.md }}>
        Combined totals · ▲▼ vs last week
      </AppText>
      <View style={styles.tiles}>
        <Tile emoji="💪" tint="#4ADE80" value={String(stats.workouts)} label="WORKOUTS" delta={stats.deltas.workouts} />
        <Tile emoji="⏱" tint="#38BDF8" value={formatMinutesHM(stats.minutes)} label="TRAINED" delta={stats.deltas.minutes} />
        <Tile
          emoji="⚖️"
          tint="#E9B542"
          value={stats.lbDropped > 0 ? `${Math.round(stats.lbDropped * 10) / 10} lb` : '—'}
          label="DROPPED"
        />
      </View>
      {records.length ? (
        <View style={styles.records}>
          {records.map((r) => (
            <AppText key={r} variant="rowSubtitle" color="secondary" style={styles.recordLine}>{r}</AppText>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.tile,
    borderWidth: 1,
    padding: spacing.md,
    gap: 4,
  },
  emblem: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 15, lineHeight: 20 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  records: { marginTop: spacing.md, gap: 4 },
  recordLine: { lineHeight: 19 },
});
