import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';

/**
 * "How Fitness Points work", in plain language.
 *
 * The 2026-08-25 survey found 4 of 5 members could not explain FP — including
 * people who named "Fitness Points and rank" as the reason they keep opening
 * the app. They are motivated by a scoreboard they cannot read. A full
 * breakdown already existed ("See the math" on the Profile trajectory card),
 * but nobody had found it, so this is deliberately reachable from the rank chip
 * on Today and from the Leaderboard — the two places the number is actually
 * looked at.
 *
 * Rules only, no live numbers: the personalised maths stays on "See the math",
 * and duplicating it here would be one more thing to keep in sync.
 */
const RULES: Array<{ title: string; body: string }> = [
  {
    title: 'You get points for hitting YOUR goals',
    body: 'Not for doing the most. The targets you set in Goals are what you are scored against, so nobody is punished for having a smaller week than someone else.',
  },
  {
    title: 'Harder targets are worth more',
    body: 'Five workouts a week pays more per week than three. Setting an easy goal and acing it will not out-earn someone chasing a hard one.',
  },
  {
    title: 'The week is the unit',
    body: 'Everything is scored Monday to Sunday. Miss the week and you lose points; hit it and you gain. A single big day does not carry a bad week.',
  },
  {
    title: 'Streaks multiply what you earn',
    body: 'Consecutive completed weeks raise your multiplier, so the same effort is worth more the longer you keep it up. Break the chain and it resets.',
  },
  {
    title: 'Rank follows the points',
    body: 'Iron up to Challenger, four divisions each. Climb by earning, slip by missing. A shield protects you from dropping a whole tier straight after promotion.',
  },
];

export default function FpExplainerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <AppText variant="pageTitle" color="primary" style={{ marginBottom: 4 }}>
          How Fitness Points work
        </AppText>
        <AppText variant="rowSubtitle" color="secondary" style={{ marginBottom: spacing.lg }}>
          Five rules. That is the whole system.
        </AppText>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {RULES.map((r, i) => (
            <View key={r.title} style={styles.rule}>
              <View style={styles.num}>
                <AppText variant="rowTitle" style={{ color: colors.primaryOnDark }}>{i + 1}</AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="rowTitle" color="primary">{r.title}</AppText>
                <AppText variant="rowSubtitle" color="secondary" style={styles.body}>{r.body}</AppText>
              </View>
            </View>
          ))}

          <AppText variant="rowSubtitle" color="muted" style={styles.foot}>
            Want your own numbers? Profile, then See the math. It shows every point you earned this
            week and why.
          </AppText>
        </ScrollView>

        <Pressable onPress={onClose} style={styles.cta} accessibilityRole="button">
          <AppText variant="rowTitle" style={{ color: '#FFFFFF' }}>Got it</AppText>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    maxHeight: '82%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderTopWidth: 1,
    borderColor: colors.borderCard,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.faint,
    marginBottom: spacing.base,
  },
  rule: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { marginTop: 3, lineHeight: 18 },
  foot: { lineHeight: 18, marginTop: spacing.xs },
  cta: {
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
});
