import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import AppText from '../ui/AppText';
import { colors, spacing } from '../../theme';

export type ComplianceBar = {
  label: string;
  pct: number;
  ratio: string;
  /** Goal days still outstanding (goal - done). */
  missed?: number;
};

/**
 * Weekly goal completion, as horizontal rows on a SHARED track.
 *
 * Was three tall vertical bars, one per goal, each in its own column. At the
 * values this group actually produces (84 / 75 / 84) they rendered as three
 * near-identical green slabs filling a third of the card: a lot of ink, almost
 * no information, and no way to see that one was 9 points behind because
 * nothing lined up. Rows on one rail make the difference legible at a glance,
 * cost a quarter of the height, and leave room for a line naming the problem.
 *
 * COLOR IS PACE-RELATIVE, not absolute. Colouring by raw percent painted the
 * entire card red every Monday — on day 1 of 7 the group is at ~8% by
 * definition, which is on pace, not a crisis (caught against live data before
 * this shipped). A row is judged against how much of the week has elapsed.
 */
function ComplianceRow({ bar, elapsedDays, isWorst }: { bar: ComplianceBar; elapsedDays: number; isWorst: boolean }) {
  const pct = Math.max(0, Math.min(100, bar.pct));
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animating width
    }).start();
  }, [pct, anim]);

  const width = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  const days = Math.max(1, Math.min(7, elapsedDays));
  const expected = (days / 7) * 100;
  const pace = expected > 0 ? pct / expected : 1;
  // Stepped, not a red->green blend: at 75% a continuous lerp lands on a muddy
  // yellow-green that reads as "fine". A step makes the laggard obvious.
  //
  // Green on EITHER a strong absolute finish or a healthy pace: pace alone
  // turned a completed 84% week amber, because at day 7 "pace" is just percent
  // against a 90% bar. Red needs a genuinely bad pace AND enough week elapsed
  // to mean it, so Monday morning is never a wall of red.
  const fill =
    pct >= 80 || pace >= 0.9
      ? colors.success
      : pace < 0.5 && days >= 3
        ? colors.danger
        : colors.warning;

  return (
    <View style={styles.row}>
      <AppText variant="rowSubtitle" color={isWorst ? 'primary' : 'secondary'} style={styles.label} numberOfLines={1}>
        {bar.label}
      </AppText>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width, backgroundColor: fill }]} />
        {/* Where the group SHOULD be by now. Without it a half-full bar on
            Wednesday is unreadable: ahead or behind? */}
        {days < 7 ? <View style={[styles.pace, { left: `${expected}%` }]} /> : null}
      </View>
      <AppText variant="rowSubtitle" color="primary" style={styles.ratio}>
        {bar.ratio}
      </AppText>
    </View>
  );
}

export default function ComplianceBars({ bars, elapsedDays = 7 }: { bars: ComplianceBar[]; elapsedDays?: number }) {
  const days = Math.max(1, Math.min(7, elapsedDays));
  const weekOver = days >= 7;

  // Worst by SHORTFALL, not by percent: 21/28 (7 outstanding) is a bigger hole
  // in the group's week than a lower percentage on a much smaller target.
  let worst: ComplianceBar | null = null;
  for (const b of bars) {
    if (b.missed == null || b.missed <= 0) continue;
    if (!worst || b.missed > (worst.missed ?? 0)) worst = b;
  }
  const others = bars.reduce((sum, b) => (b === worst ? sum : sum + Math.max(0, b.missed ?? 0)), 0);

  // Mid-week the same shortfall isn't a miss, it's work remaining — so the line
  // only says "missed" once the week is actually over.
  let line: string | null = null;
  if (worst) {
    if (weekOver) {
      const tail = (worst.missed ?? 0) > others ? ', more than the other two combined.' : '.';
      line = `${worst.label} is the gap. ${worst.missed} goal ${worst.missed === 1 ? 'day' : 'days'} missed across the group${tail}`;
    } else {
      const left = 7 - days;
      line = `${worst.label} has the most ground to make up: ${worst.missed} to go, ${left} ${left === 1 ? 'day' : 'days'} left.`;
    }
  }

  return (
    <View>
      <View style={styles.rows}>
        {bars.map((b) => (
          <ComplianceRow key={b.label} bar={b} elapsedDays={days} isWorst={b === worst} />
        ))}
      </View>
      {line ? (
        <>
          <View style={styles.divider} />
          <AppText variant="rowSubtitle" color="muted" style={styles.gap}>{line}</AppText>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { width: 62 },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  pace: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  ratio: { width: 52, textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'] },
  divider: { height: 1, backgroundColor: colors.divider, marginTop: spacing.base, marginBottom: spacing.md },
  gap: { lineHeight: 17 },
});
