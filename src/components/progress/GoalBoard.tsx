import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import AppText from '../ui/AppText';
import Card from '../ui/Card';
import { colors, radius, spacing } from '../../theme';

export type GoalChip = {
  key: 'workouts' | 'calories' | 'weight';
  /** Capped at goal: the board shows completion, not overtime. */
  done: number;
  goal: number;
};

export type GoalRow = {
  uid: string;
  name: string;
  isMe: boolean;
  chips: GoalChip[];
  done: number;
  goal: number;
};

type Status = 'done' | 'onPace' | 'offPace' | 'behind';

const EMOJI: Record<GoalChip['key'], string> = {
  workouts: String.fromCodePoint(0x1f4aa),
  calories: String.fromCodePoint(0x1f37d, 0xfe0f),
  weight: String.fromCodePoint(0x2696, 0xfe0f),
};

const ORDER: Record<Status, number> = { behind: 0, offPace: 1, onPace: 2, done: 3 };
const LABEL: Record<Status, string> = { behind: 'Behind', offPace: 'Off pace', onPace: 'On pace', done: 'Done' };

/**
 * PACE-RELATIVE, same thresholds as the old group bars: on Monday everyone is
 * at ~1/7 by definition, which is on pace, not a crisis. Red needs a genuinely
 * bad pace AND enough week elapsed to mean it.
 */
export function goalStatus(done: number, goal: number, elapsedDays: number): Status {
  if (goal <= 0) return 'onPace';
  if (done >= goal) return 'done';
  const days = Math.max(1, Math.min(7, elapsedDays));
  const pct = done / goal;
  const pace = pct / (days / 7);
  if (pct >= 0.8 || pace >= 0.9) return 'onPace';
  if (pace < 0.5 && days >= 3) return 'behind';
  return 'offPace';
}

function statusColor(s: Status): string {
  if (s === 'done' || s === 'onPace') return colors.success;
  if (s === 'behind') return colors.danger;
  return colors.warning;
}

/**
 * Weekly goals, one row per member. Replaces the three group-total bars,
 * which described nobody: "workouts 31/58" names no one to cheer or nudge.
 * A row shows THAT someone logged a weigh-in or a calorie day, never the
 * number, so there is no privacy surface beyond the consistency matrix.
 *
 * Behind first: the point of the page is who needs a hand this week.
 */
export default function GoalBoard({
  rows,
  noGoals,
  elapsedDays,
  onPressMember,
  onPressMe,
}: {
  rows: GoalRow[];
  /** Names of active members with no weekly targets set. */
  noGoals: string[];
  elapsedDays: number;
  onPressMember: (uid: string) => void;
  onPressMe: () => void;
}) {
  const withStatus = rows
    .map((r) => ({ row: r, status: goalStatus(r.done, r.goal, elapsedDays) }))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.row.done / a.row.goal - b.row.done / b.row.goal || a.row.name.localeCompare(b.row.name));
  const onTrack = withStatus.filter((x) => x.status === 'done' || x.status === 'onPace').length;

  return (
    <Card>
      <View style={styles.head}>
        <AppText variant="rowTitle" color="primary">Goal board</AppText>
        {withStatus.length ? (
          <AppText variant="rowSubtitle" color={onTrack === withStatus.length ? 'success' : 'muted'}>
            {`${onTrack} of ${withStatus.length} on pace`}
          </AppText>
        ) : null}
      </View>
      <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>
        {withStatus.length ? 'Weekly goals by member. Tap a name to send a nudge.' : 'No goals set yet. Members set weekly targets in Goals.'}
      </AppText>

      {withStatus.length ? (
        <View style={styles.rows}>
          {withStatus.map(({ row, status }) => (
            <TouchableOpacity
              key={row.uid}
              activeOpacity={0.7}
              onPress={() => (row.isMe ? onPressMe() : onPressMember(row.uid))}
              style={styles.row}
            >
              <View style={styles.nameCol}>
                <AppText variant="rowSubtitle" color={row.isMe ? 'accent' : 'primary'} numberOfLines={1}>
                  {row.isMe ? 'You' : row.name}
                </AppText>
              </View>
              <View style={styles.chips}>
                {row.chips.map((c) => {
                  const hit = c.done >= c.goal;
                  return (
                    <View key={c.key} style={[styles.chip, hit && styles.chipHit]}>
                      <AppText style={styles.chipEmoji}>{EMOJI[c.key]}</AppText>
                      <AppText variant="label" color={hit ? 'success' : 'primary'} style={styles.chipText}>
                        {`${c.done}/${c.goal}`}
                      </AppText>
                    </View>
                  );
                })}
              </View>
              <AppText variant="label" style={[styles.status, { color: statusColor(status) }]} numberOfLines={1}>
                {LABEL[status]}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {noGoals.length ? (
        <AppText variant="rowSubtitle" color="muted" style={styles.noGoals}>
          {`No goals yet: ${noGoals.join(', ')}`}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  rows: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.sm },
  nameCol: { width: 78 },
  chips: { flex: 1, flexDirection: 'row', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  chipHit: { backgroundColor: colors.successTint },
  chipEmoji: { fontSize: 11, lineHeight: 14 },
  chipText: { fontVariant: ['tabular-nums'] },
  status: { width: 58, textAlign: 'right', fontWeight: '700' },
  noGoals: { marginTop: spacing.md, lineHeight: 17 },
});
