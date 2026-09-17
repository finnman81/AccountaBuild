import React, { useContext, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMyMmrGoals } from '../../services/mmrGoals';
import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';
import { DEFAULT_TZ, yyyyMmDdInTz } from '../../mmr/time';

/**
 * "Your goal date passed. Set a new date or a new target."
 *
 * A weight goal's target date only ever set its pace; nothing happened when
 * the date went by. The goal stayed active, still demanding the original
 * lbs-per-week, and nobody was told (prod 2026-09-16: two members were past
 * their date with no signal). This card shows once the date is behind you
 * and the goal isn't done. "Not now" hides it for a week, not forever: the
 * goal is still dragging the outcome score until it's re-planned.
 */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type Overdue = { goalId: string; startWeight: number | null; goalWeight: number | null; targetEndDate: string };

function prettyDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.valueOf()) ? ymd : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function GoalDeadlineCard() {
  const { user } = useContext(AuthContext);
  const nav = useNavigation<any>();
  const [overdue, setOverdue] = useState<Overdue | null>(null);
  const [snoozed, setSnoozed] = useState(true); // assume hidden until proven otherwise

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyMmrGoals(user.uid, (goals) => {
      const today = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
      let hit: Overdue | null = null;
      for (const id of ['weightLoss', 'weightGain']) {
        const g = goals[id];
        if (!g || g.status !== 'active') continue;
        const end = String(g.targetEndDate ?? '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end >= today) continue;
        hit = {
          goalId: id,
          startWeight: Number(g.startWeight) || null,
          goalWeight: Number(g.goalWeight) || null,
          targetEndDate: end,
        };
      }
      setOverdue(hit);
    });
  }, [user?.uid]);

  const key = overdue ? `goalDeadline:${user?.uid}:${overdue.goalId}:${overdue.targetEndDate}` : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    AsyncStorage.getItem(key)
      .then((v) => alive && setSnoozed(!!v && Date.now() - Number(v) < SNOOZE_MS))
      .catch(() => alive && setSnoozed(false));
    return () => { alive = false; };
  }, [key]);

  if (!overdue || !key || snoozed) return null;

  const snooze = () => {
    setSnoozed(true);
    void AsyncStorage.setItem(key, String(Date.now())).catch(() => {});
  };
  const target =
    overdue.startWeight && overdue.goalWeight ? `${overdue.startWeight} → ${overdue.goalWeight} lb was due ${prettyDate(overdue.targetEndDate)}. ` : '';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <AppText variant="pageTitle" style={styles.emoji}>📅</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="rowTitle" color="primary">Your goal date passed</AppText>
          <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>
            {target}Set a new date or a new target. Until then it's still scored at the old pace.
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primary}
          activeOpacity={0.85}
          onPress={() => nav.navigate('MMRGoals', { focus: 'weight' })}
          accessibilityRole="button"
        >
          <AppText variant="rowTitle" style={{ color: '#FFFFFF' }}>Update goal</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} activeOpacity={0.85} onPress={snooze} accessibilityRole="button">
          <AppText variant="rowSubtitle" color="muted">Not now</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emoji: { fontSize: 28, lineHeight: 34 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  primary: {
    flex: 1,
    height: 44,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { paddingHorizontal: spacing.base, height: 44, alignItems: 'center', justifyContent: 'center' },
});
