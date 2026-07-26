import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';
import type { GroupMessage } from '../../services/chat';

/** Same quick set as LogCard, plus celebration-flavoured options. */
const QUICK_EMOJIS = ['🎉', '💪', '🔥', '👏'];

type Props = {
  msg: GroupMessage;
  myUid: string;
  onToggleReaction: (messageId: string, emoji: string, mine: boolean) => void;
};

/**
 * A celebration posted into the group feed (goal reached, streak milestone).
 * Unlike the plain grey system notice, this is a card the whole crew can react
 * to — the reaction write is the one field non-authors may touch on a message
 * (see firestore.rules), which is what lets everyone cheer a server-posted card.
 */
export default function MilestoneCard({ msg, myUid, onToggleReaction }: Props) {
  const m = msg.milestone;
  const reactions = msg.reactions ?? {};
  const mineEmoji = reactions[myUid] ?? null;

  const counts: Record<string, number> = {};
  for (const emoji of Object.values(reactions)) {
    if (emoji) counts[emoji] = (counts[emoji] ?? 0) + 1;
  }
  const pills = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText variant="pageTitle" style={styles.emoji}>{m?.emoji ?? '🎉'}</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="rowTitle" color="primary">{m?.title ?? msg.text}</AppText>
          {m?.body ? (
            <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>{m.body}</AppText>
          ) : null}
        </View>
      </View>

      <View style={styles.reactions}>
        {pills.map(([emoji, count]) => {
          const mine = mineEmoji === emoji;
          return (
            <TouchableOpacity
              key={emoji}
              onPress={() => onToggleReaction(msg.id, emoji, mine)}
              style={[styles.pill, mine && styles.pillMine]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${emoji} ${count}`}
            >
              <AppText variant="rowSubtitle" color={mine ? 'accent' : 'secondary'}>{emoji} {count}</AppText>
            </TouchableOpacity>
          );
        })}
        {QUICK_EMOJIS.filter((e) => !counts[e]).map((emoji) => (
          <TouchableOpacity
            key={emoji}
            onPress={() => onToggleReaction(msg.id, emoji, false)}
            style={styles.pill}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`React ${emoji}`}
          >
            <AppText variant="rowSubtitle" color="muted">{emoji}</AppText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.rankGold,
    padding: spacing.base,
    marginHorizontal: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emoji: { fontSize: 30, lineHeight: 36 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  pillMine: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
});
