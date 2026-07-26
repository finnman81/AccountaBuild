import React, { useContext, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { collection, onSnapshot } from 'firebase/firestore';

import { db } from '../../firebase/firebase';
import { AuthContext } from '../../store/AuthContext';
import AppText from '../ui/AppText';
import { colors, radius, spacing } from '../../theme';
import { DEFAULT_TZ, yyyyMmDdInTz } from '../../mmr/time';

/**
 * "You hit your goal — set the next one."
 *
 * Shows the day AFTER a weight goal completes, so the day you actually hit it
 * stays a celebration rather than an upsell. A completed goal keeps scoring
 * adherence but its outcome is finished, so leaving it in place quietly caps
 * how much FP the category can earn — hence the nudge.
 *
 * Dismissal is keyed by goal id + completion date, so a future goal gets a
 * fresh prompt instead of being permanently silenced.
 */
type Completed = { goalId: string; completedOn: string; goalWeight: number | null };

export default function GoalReachedCard() {
  const { user } = useContext(AuthContext);
  const nav = useNavigation<any>();
  const [done, setDone] = useState<Completed | null>(null);
  const [dismissed, setDismissed] = useState(true); // assume hidden until proven otherwise

  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(collection(db, 'users', user.uid, 'goals'), (snap) => {
      let hit: Completed | null = null;
      snap.docs.forEach((d) => {
        const g = d.data() as any;
        if (!d.id.startsWith('weight') || g?.status !== 'completed') return;
        const ts = g?.completionDate?.toDate?.();
        if (!ts) return;
        hit = { goalId: d.id, completedOn: yyyyMmDdInTz(ts, DEFAULT_TZ), goalWeight: Number(g?.goalWeight) || null };
      });
      setDone(hit);
    });
  }, [user?.uid]);

  const key = done ? `goalReached:${user?.uid}:${done.goalId}:${done.completedOn}` : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    AsyncStorage.getItem(key)
      .then((v) => alive && setDismissed(v === '1'))
      .catch(() => alive && setDismissed(false));
    return () => { alive = false; };
  }, [key]);

  if (!done || !key || dismissed) return null;
  // Not until tomorrow — today belongs to the celebration.
  if (yyyyMmDdInTz(new Date(), DEFAULT_TZ) <= done.completedOn) return null;

  const hide = () => {
    setDismissed(true);
    void AsyncStorage.setItem(key, '1').catch(() => {});
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <AppText variant="pageTitle" style={styles.emoji}>🏁</AppText>
        <View style={{ flex: 1 }}>
          <AppText variant="rowTitle" color="primary">Goal reached — what's next?</AppText>
          <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>
            {done.goalWeight ? `You hit ${done.goalWeight} lb. ` : ''}Set a new target so your weigh-ins keep earning FP.
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primary}
          activeOpacity={0.85}
          onPress={() => { hide(); nav.navigate('MMRGoals'); }}
          accessibilityRole="button"
        >
          <AppText variant="rowTitle" style={{ color: '#FFFFFF' }}>Set a new goal</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} activeOpacity={0.85} onPress={hide} accessibilityRole="button">
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
    borderColor: colors.rankGold,
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
