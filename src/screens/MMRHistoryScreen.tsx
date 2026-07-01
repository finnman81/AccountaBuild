import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Card, Divider, List, Text, useTheme } from 'react-native-paper';

import Screen from '../components/layout/Screen';
import SimpleLineChart from '../components/charts/SimpleLineChart';
import PlaceholderLineChart from '../components/charts/PlaceholderLineChart';
import { AuthContext } from '../store/AuthContext';
import { subscribeMmrWeeklyHistory, type MmrWeeklySummary } from '../services/mmrWeekly';

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
      <Screen>
        <Text>You must be signed in.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Card.Title title="MMR history" subtitle="Weekly (global)" />
        <Card.Content>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Shows your end-of-week MMR after scoring. Pull-to-refresh on Profile updates the latest week.
          </Text>
          <View style={{ height: 12 }} />
          {series.length === 0 ? (
            <PlaceholderLineChart height={160} />
          ) : (
            <>
              <Text variant="labelSmall" style={{ opacity: 0.6 }}>
                MMR
              </Text>
              <SimpleLineChart
                values={series}
                height={160}
                width={Math.max(260, windowWidth - 32 - 32)}
                showPointLabels={series.length <= 10}
                formatPointLabel={(v) => `${Math.round(v)}`}
                labelColor={theme.colors.onSurface}
                color={theme.colors.primary}
                yMin={yAxis.yMin}
                yMax={yAxis.yMax}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
                {labels.slice(Math.max(0, labels.length - 5)).map((l, i) => (
                  <Text key={`${l}-${i}`} variant="labelSmall" style={{ opacity: 0.75 }}>
                    {l}
                  </Text>
                ))}
              </View>
            </>
          )}
        </Card.Content>
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Card.Title title="Weekly recaps" subtitle="Most recent first" />
        <Divider />
        {weeks.length === 0 ? (
          <Card.Content>
            <Text>No weeks scored yet.</Text>
          </Card.Content>
        ) : (
          weeks.map((w) => {
            const status = w.missedWeek ? 'Missed' : w.completedWeek ? 'Completed' : 'Partial';
            const delta = Math.round(w.deltaMMR);
            const deltaTxt = `${delta >= 0 ? '+' : ''}${delta}`;
            const legacyDeltaLP = (w as any).deltaLP;
            const deltaMP = typeof w.deltaMP === 'number' ? Math.round(w.deltaMP) : typeof legacyDeltaLP === 'number' ? Math.round(legacyDeltaLP) : null; // Backward compat
            const deltaMPTxt = deltaMP == null ? null : `${deltaMP >= 0 ? '+' : ''}${deltaMP} MP`;
            const promo = w.promotion ? 'Promotion' : w.demotion ? 'Demotion' : null;
            return (
              <List.Item
                key={w.weekId}
                title={`${w.weekId} • ${status}`}
                description={[
                  `ΔMMR: ${deltaTxt}${deltaMPTxt ? ` (${deltaMPTxt})` : ''}  (MMR: ${Math.round(w.mmrBefore)} → ${Math.round(w.mmrAfter)})`,
                  promo ? promo : null,
                  `Penalty: ${Math.round(w.penalty)} • Bonus: ${Math.round(w.bonus)} • Streak ×${w.streakMultiplier.toFixed(2)}`,
                ].join('\n')}
              />
            );
          })
        )}
      </Card>
    </Screen>
  );
}

