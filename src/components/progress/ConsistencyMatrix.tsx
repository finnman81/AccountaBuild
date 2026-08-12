import React from 'react';
import { StyleSheet, View } from 'react-native';

import AppText from '../ui/AppText';
import Card from '../ui/Card';
import { colors, radius, spacing } from '../../theme';

export type MatrixRow = {
  uid: string;
  name: string;
  /** One entry per weekday (Mon..Sun): logged that day? */
  days: boolean[];
};

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The group's week as a picture: members down, days across, a lit dot per
 * logged day. Full columns are strong days; a row going dark shows someone
 * fading midweek. Shows THAT someone logged, never what — no privacy surface.
 */
export default function ConsistencyMatrix({ rows, todayIndex }: { rows: MatrixRow[]; todayIndex: number }) {
  if (!rows.length) return null;
  return (
    <Card>
      <AppText variant="rowTitle" color="primary">Group consistency</AppText>
      <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2, marginBottom: spacing.md }}>
        A dot for every day logged this week
      </AppText>

      {/* Header row: day letters, aligned with the dot columns. */}
      <View style={styles.row}>
        <View style={styles.nameCol} />
        {DAY_LABELS.map((d, i) => (
          <View key={`${d}-${i}`} style={styles.dotCol}>
            <AppText variant="label" color={i === todayIndex ? 'accent' : 'muted'}>{d}</AppText>
          </View>
        ))}
      </View>

      {rows.map((r) => {
        const count = r.days.filter(Boolean).length;
        return (
          <View key={r.uid} style={styles.row}>
            <View style={styles.nameCol}>
              <AppText variant="rowSubtitle" color="primary" numberOfLines={1}>{r.name}</AppText>
            </View>
            {r.days.map((logged, i) => {
              const future = i > todayIndex;
              return (
                <View key={i} style={styles.dotCol}>
                  <View
                    style={[
                      styles.dot,
                      logged && styles.dotOn,
                      !logged && i === todayIndex && styles.dotToday,
                      future && styles.dotFuture,
                    ]}
                  />
                </View>
              );
            })}
            <AppText variant="label" color={count >= 5 ? 'success' : 'muted'} style={styles.count}>
              {count}
            </AppText>
          </View>
        );
      })}
    </Card>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  nameCol: { width: 86 },
  dotCol: { flex: 1, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  dotOn: { backgroundColor: colors.success, borderColor: colors.success },
  dotToday: { borderColor: colors.primary, borderStyle: 'dashed' },
  dotFuture: { opacity: 0.35 },
  count: { width: 20, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
