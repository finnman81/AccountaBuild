import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useTheme } from 'react-native-paper';

import SimpleLineChart from '../components/charts/SimpleLineChart';
import PlaceholderLineChart from '../components/charts/PlaceholderLineChart';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import StatTile from '../components/ui/StatTile';
import Tag from '../components/ui/Tag';
import { AuthContext } from '../store/AuthContext';
import { subscribeMmrWeeklyHistory, type MmrWeeklySummary } from '../services/mmrWeekly';
import { colors, radius, spacing } from '../theme';

function weekLabel(weekId: string) {
  // weekId is "YYYY-WNN"
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekId).trim());
  if (!m) return weekId;
  return `W${m[2]} '${m[1]?.slice(2) ?? ''}`;
}

export default function MMRHistoryScreen() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { user } = useContext(AuthContext);

  const [weeks, setWeeks] = useState<MmrWeeklySummary[]>([]); // newest-first from query

  useEffect(() => {
    if (!user) return;
    return subscribeMmrWeeklyHistory(user.uid, 26, setWeeks);
  }, [user]);

  const weeksAsc = useMemo(() => [...weeks].reverse(), [weeks]);

  const series = useMemo(() => weeksAsc.map((w) => w.mmrAfter), [weeksAsc]);
  const labels = useMemo(() => weeksAsc.map((w) => weekLabel(w.weekId)), [weeksAsc]);

  const yAxis = useMemo(() => {
    const vals = series.filter((n) => Number.isFinite(n));
    if (!vals.length) return { yMin: undefined as number | undefined, yMax: undefined as number | undefined };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max(50, Math.round((max - min) * 0.15));
    return { yMin: Math.max(0, min - pad), yMax: max + pad };
  }, [series]);

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.signedOut}>
          <AppText variant="body" color="secondary">You must be signed in.</AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <AppText variant="cardLabel" color="primary">FP history</AppText>
          <AppText variant="rowSubtitle" color="muted" style={styles.subLine}>Weekly (global)</AppText>
          <AppText variant="rowSubtitle" color="secondary" style={styles.blurb}>
            Shows your end-of-week Fitness Points after scoring. Pull-to-refresh on Profile updates the latest week.
          </AppText>
          {series.length === 0 ? (
            <PlaceholderLineChart height={160} />
          ) : (
            <>
              <AppText variant="eyebrow" color="muted" style={styles.chartLabel}>FP</AppText>
              <SimpleLineChart
                values={series}
                height={160}
                width={Math.max(260, windowWidth - spacing.lg * 2 - spacing.base * 2)}
                showPointLabels={series.length <= 10}
                formatPointLabel={(v) => `${Math.round(v)}`}
                labelColor={theme.colors.onSurface}
                color={colors.primary}
                yMin={yAxis.yMin}
                yMax={yAxis.yMax}
              />
              <View style={styles.axisRow}>
                {labels.slice(Math.max(0, labels.length - 5)).map((l, i) => (
                  <AppText key={`${l}-${i}`} variant="rowSubtitle" color="muted">
                    {l}
                  </AppText>
                ))}
              </View>
            </>
          )}
        </Card>

        <AppText variant="eyebrow" color="muted" style={styles.sectionLabel}>Weekly recaps</AppText>
        {weeks.length === 0 ? (
          <Card>
            <AppText variant="body" color="secondary">No weeks scored yet.</AppText>
          </Card>
        ) : (
          <View style={styles.list}>
            {weeks.map((w) => {
              const status = w.missedWeek ? 'Missed' : w.completedWeek ? 'Completed' : 'Partial';
              const delta = Math.round(w.deltaMMR);
              const deltaTxt = `${delta >= 0 ? '+' : ''}${delta}`;
              const legacyDeltaLP = (w as any).deltaLP;
              const deltaMP = typeof w.deltaMP === 'number' ? Math.round(w.deltaMP) : typeof legacyDeltaLP === 'number' ? Math.round(legacyDeltaLP) : null; // Backward compat
              const deltaMPTxt = deltaMP == null ? null : `${deltaMP >= 0 ? '+' : ''}${deltaMP} MP`;
              const promo = w.promotion ? 'Promotion' : w.demotion ? 'Demotion' : null;
              const deltaColor = delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.textSecondary;
              return (
                <Card key={w.weekId}>
                  <View style={styles.recapHeader}>
                    <AppText variant="rowTitle" color="primary">{w.weekId}</AppText>
                    <Tag label={status} variant="subtle" />
                  </View>
                  <View style={styles.tiles}>
                    <StatTile label="ΔMMR" value={deltaTxt} unit={deltaMPTxt ?? undefined} delta={`${Math.round(w.mmrBefore)} → ${Math.round(w.mmrAfter)}`} deltaColor={colors.textMuted} style={styles.tile} />
                    <StatTile label="Streak" value={`×${w.streakMultiplier.toFixed(2)}`} delta={`Bonus ${Math.round(w.bonus)} · Penalty ${Math.round(w.penalty)}`} deltaColor={colors.textMuted} style={styles.tile} />
                  </View>
                  {promo ? (
                    <AppText variant="rowSubtitle" color={promo === 'Promotion' ? 'success' : 'danger'} style={styles.promo}>
                      {promo}
                    </AppText>
                  ) : null}
                  <View style={styles.deltaAccent}>
                    <AppText variant="rowSubtitle" style={{ color: deltaColor }}>FP change {deltaTxt}</AppText>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.base, paddingBottom: spacing.xxl },
  signedOut: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  subLine: { marginTop: 2 },
  blurb: { marginTop: spacing.md, marginBottom: spacing.base, lineHeight: 18 },
  chartLabel: { marginBottom: spacing.xs },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm, marginLeft: spacing.xs },
  list: { gap: spacing.md },
  recapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1 },
  promo: { marginTop: spacing.md },
  deltaAccent: { marginTop: spacing.md, borderRadius: radius.tile },
});
