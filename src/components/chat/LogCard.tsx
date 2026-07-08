import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from 'react-native-paper';

import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';
import type { GroupLog } from '../../services/logs';
import { formatMinutesHM, formatWeightForUnits, type Units } from '../../utils/formatters';
import { useMyUnits } from '../../hooks/useMyUnits';

const QUICK_EMOJIS = ['💪', '🔥'];

const TYPE_ICON: Record<string, string> = { workout: 'dumbbell', calories: 'fire', weight: 'scale-bathroom', photo: 'image-outline' };

function titleFor(log: GroupLog, units: Units): string {
  const p = log.payload as any;
  if (log.type === 'workout') {
    const t = String(p?.workoutType ?? 'Workout');
    const label = t.charAt(0).toUpperCase() + t.slice(1);
    return p?.durationMinutes ? `${label} · ${formatMinutesHM(Number(p.durationMinutes))}` : label;
  }
  if (log.type === 'calories') {
    const kcal = Number(p?.calories) || 0;
    return `${kcal.toLocaleString()} kcal${p?.meal && p.meal !== 'all' ? ` · ${p.meal}` : ''}`;
  }
  // Weight is always displayed in the VIEWER's own unit preference, not the
  // logger's — a metric-preferring viewer sees teammates' weights in kg too.
  if (log.type === 'weight') return formatWeightForUnits(Number(p?.weight), units);
  return 'Progress photo';
}

type Props = {
  log: GroupLog;
  name: string;
  myUid: string;
  onToggleReaction: (logId: string, emoji: string, mine: boolean) => void;
};

/** A member's log rendered as a card in the chat stream, with cheer/reaction pills (design 10). */
export default function LogCard({ log, name, myUid, onToggleReaction }: Props) {
  const units = useMyUnits();
  const reactions = log.reactions ?? {};
  const mineEmoji = reactions[myUid];
  const counts: Record<string, number> = {};
  for (const emoji of Object.values(reactions)) {
    if (emoji) counts[emoji] = (counts[emoji] ?? 0) + 1;
  }
  const pills = Object.entries(counts);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <Icon source={TYPE_ICON[log.type] ?? 'check'} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="rowTitle" color="primary">{titleFor(log, units)}</AppText>
          <AppText variant="rowSubtitle" color="muted">{name} logged a {log.type === 'photo' ? 'photo' : log.type}</AppText>
        </View>
      </View>

      <View style={styles.pills}>
        {pills.map(([emoji, count]) => {
          const mine = mineEmoji === emoji;
          return (
            <TouchableOpacity key={emoji} onPress={() => onToggleReaction(log.id, emoji, mine)} style={[styles.pill, mine && styles.pillMine]} activeOpacity={0.7}>
              <AppText variant="rowSubtitle" color={mine ? 'accent' : 'secondary'}>{emoji} {count}</AppText>
            </TouchableOpacity>
          );
        })}
        {QUICK_EMOJIS.filter((e) => !counts[e]).map((emoji) => (
          <TouchableOpacity key={emoji} onPress={() => onToggleReaction(log.id, emoji, false)} style={styles.pill} activeOpacity={0.7}>
            <AppText variant="rowSubtitle" color="muted">{emoji}</AppText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderCard,
    padding: spacing.md,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconTile: { width: 38, height: 38, borderRadius: radius.tile, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  pillMine: { backgroundColor: colors.primaryTint },
});
