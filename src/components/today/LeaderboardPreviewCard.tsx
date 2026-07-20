import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import Card from '../ui/Card';
import RankEmblem from '../ui/RankEmblem';
import { colors } from '../../theme/colors';
import type { LeaderboardPreviewRow } from '../../viewmodels/today';

export default function LeaderboardPreviewCard({ rows, onViewAll }: { rows: LeaderboardPreviewRow[]; onViewAll: () => void }) {
  return (
    <Card style={{ marginTop: 16 }}>
      <View style={styles.header}>
        <Text style={styles.cardLabel}>This week's race</Text>
        <Pressable onPress={onViewAll} accessibilityRole="button">
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 8 }}>
        {rows.map((r, i) => (
          <View key={r.uid} style={[styles.row, i > 0 && styles.rowBorder]}>
            <Text style={styles.rank}>{r.isTied ? `T-${r.rank}` : r.rank}</Text>
            <View style={styles.emblem}>{r.tier ? <RankEmblem tier={r.tier} size={22} inline /> : null}</View>
            <Text style={[styles.name, r.isMe && { color: colors.primaryOnDark }]} numberOfLines={1}>
              {r.name}
              {r.isMe ? ' (You)' : ''}
            </Text>
            <Text style={[styles.mmr, r.weekDelta != null && r.weekDelta > 0 ? { color: colors.success } : null]}>
              {r.weekDelta != null ? `+${r.weekDelta} FP` : r.mmr == null ? '—' : Math.round(r.mmr).toLocaleString()}
            </Text>
          </View>
        ))}
        {rows.length === 0 && <Text style={styles.empty}>No ranked members yet.</Text>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  viewAll: { fontSize: 13, fontWeight: '600', color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  rank: { width: 28, fontSize: 13, fontWeight: '600', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  emblem: { width: 30, alignItems: 'center' },
  name: { flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.textPrimary, marginLeft: 4 },
  mmr: { fontSize: 14.5, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  empty: { fontSize: 13, color: colors.textMuted, paddingVertical: 8 },
});
