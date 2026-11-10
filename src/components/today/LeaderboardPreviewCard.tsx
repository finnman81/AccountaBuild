import React from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../ui/Text';

import Card from '../ui/Card';
import RankEmblem from '../ui/RankEmblem';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { LeaderboardPreviewRow } from '../../viewmodels/today';
import PressableScale from '../ui/PressableScale';

export default function LeaderboardPreviewCard({ rows, onViewAll }: { rows: LeaderboardPreviewRow[]; onViewAll: () => void }) {
  return (
    <Card style={{ marginTop: 16 }}>
      <View style={styles.header}>
        <Text style={styles.cardLabel}>This week's race</Text>
        <PressableScale onPress={onViewAll} hitSlop={14} accessibilityRole="button" accessibilityLabel="View the full leaderboard">
          <Text style={styles.viewAll}>Full board</Text>
        </PressableScale>
      </View>
      <View style={{ marginTop: 8 }}>
        {rows.map((r, i) => (
          <View key={r.uid} style={[styles.row, i > 0 && styles.rowBorder]}>
            <Text style={[styles.rank, r.rank === 1 && { color: colors.rankGold }]}>{r.isTied ? `T${r.rank}` : r.rank}</Text>
            <View style={styles.emblem}>{r.tier ? <RankEmblem tier={r.tier} size={22} inline /> : null}</View>
            <Text style={[styles.name, r.isMe && { color: colors.primaryOnDark }]} numberOfLines={1}>
              {r.name}
              {r.isMe ? ' (you)' : ''}
            </Text>
            <Text style={[styles.mmr, r.weekDelta != null && r.weekDelta > 0 ? { color: colors.success } : null]}>
              {r.weekDelta != null ? `+${r.weekDelta}` : r.mmr == null ? '' : Math.round(r.mmr).toLocaleString()}
            </Text>
          </View>
        ))}
        {rows.length === 0 && <Text style={styles.empty}>Nobody on the board yet. Log to get on it.</Text>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { ...typography.eyebrow, color: colors.textMuted },
  viewAll: { fontSize: 13, fontWeight: '600', color: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  rank: { ...typography.stat, width: 30, fontSize: 22, lineHeight: 24, color: colors.textSecondary },
  emblem: { width: 30, alignItems: 'center' },
  name: { flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.textPrimary, marginLeft: 4 },
  mmr: { ...typography.stat, color: colors.textPrimary },
  empty: { fontSize: 13, color: colors.textMuted, paddingVertical: 8 },
});
