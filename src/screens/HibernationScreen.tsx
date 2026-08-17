import React, { useContext, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';

import Screen from '../components/layout/Screen';
import AppText from '../components/ui/AppText';
import Card from '../components/ui/Card';
import PrimaryButton from '../components/ui/PrimaryButton';
import HibernationPod from '../components/ui/HibernationPod';
import { AuthContext } from '../store/AuthContext';
import { db } from '../firebase/firebase';
import { clearHibernation, setHibernation, HIBERNATION_MAX_WEEKS, HIBERNATION_MIN_WEEKS } from '../services/hibernation';
import { colors, radius, spacing } from '../theme';

const PRESETS = [2, 4, 6, 8, 12];

/**
 * Hibernation: the long-absence valve. Vacation covers one week twice a season;
 * this covers deployment, injury, or a month away — the cases where "log
 * something or lose rank" is the wrong thing for an app to say.
 */
export default function HibernationScreen() {
  const { user } = useContext(AuthContext);
  const [weeks, setWeeks] = useState(4);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ fromWeekId: string; untilWeekId: string; reason?: string | null } | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const h = snap.exists() ? (snap.data() as any)?.hibernation : null;
      setActive(h && h.untilWeekId && h.untilWeekId !== 'x' ? h : null);
    });
  }, [user?.uid]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await setHibernation({ weeks });
      Alert.alert('Hibernation on', `You're covered through ${res.untilWeekId}. Your score and streak hold until you're back.`);
    } catch (e) {
      Alert.alert('Could not start', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await clearHibernation();
    } catch (e) {
      Alert.alert('Could not wake', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Card>
        <View style={styles.podRow}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface2, overflow: 'hidden' }}>
            <HibernationPod size={64} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="rowTitle" color="primary">Hibernation</AppText>
            <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2 }}>
              For a real absence: deployment, injury, a long trip.
            </AppText>
          </View>
        </View>

        <AppText variant="body" color="secondary" style={{ marginTop: spacing.md, lineHeight: 21 }}>
          While you're under, nothing can hurt you. No missed-week penalty, your streak holds
          where it is, and your group sees 😴 instead of wondering if you quit. Anything you do
          log still earns FP. Your first week back is free too.
        </AppText>
      </Card>

      <View style={{ height: spacing.base }} />

      {active ? (
        <Card>
          <AppText variant="rowTitle" color="primary">You're hibernating</AppText>
          <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 4 }}>
            {active.fromWeekId} through {active.untilWeekId}
          </AppText>
          <PrimaryButton onPress={stop} loading={busy} disabled={busy} style={{ marginTop: spacing.md }}>
            Wake up now
          </PrimaryButton>
        </Card>
      ) : (
        <Card>
          <AppText variant="rowTitle" color="primary">How long?</AppText>
          <AppText variant="rowSubtitle" color="secondary" style={{ marginTop: 2, marginBottom: spacing.md }}>
            {HIBERNATION_MIN_WEEKS}–{HIBERNATION_MAX_WEEKS} weeks. You can wake up early any time.
          </AppText>
          <View style={styles.presets}>
            {PRESETS.map((w) => {
              const on = w === weeks;
              return (
                <TouchableOpacity
                  key={w}
                  onPress={() => setWeeks(w)}
                  activeOpacity={0.85}
                  style={[styles.preset, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                >
                  <AppText variant="rowSubtitle" style={{ color: on ? '#FFFFFF' : colors.textSecondary, fontWeight: '700' }}>
                    {w}w
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
          <PrimaryButton onPress={start} loading={busy} disabled={busy} style={{ marginTop: spacing.md }}>
            Start hibernating
          </PrimaryButton>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  podRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  presets: { flexDirection: 'row', gap: spacing.sm },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface2,
  },
});
