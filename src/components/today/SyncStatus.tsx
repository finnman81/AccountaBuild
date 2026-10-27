import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { subscribeHealthSettings } from '../../services/healthSettings';
import { subscribeSyncState, type SyncState } from '../../services/syncEvents';
import { colors } from '../../theme/colors';

function timeLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return t;
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `yesterday ${t}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * One quiet line on Today's log: "Syncing…" / "Synced 9:42 AM". Only for
 * members with health sync on. (The "· N new" count was dropped: the number
 * reflects writes, not workouts, and read as noise.)
 */
export default function SyncStatus({ uid }: { uid: string }) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<SyncState | null>(null);
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!uid) return;
    return subscribeHealthSettings(uid, (s) => setEnabled(!!s && (s.syncWorkouts || s.syncCalories || s.syncWeight)), () => setEnabled(false));
  }, [uid]);
  useEffect(() => subscribeSyncState(setState), []);

  useEffect(() => {
    if (state?.phase !== 'syncing') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state?.phase, pulse]);

  if (!enabled || !state) return null;
  const source = Platform.OS === 'ios' ? 'Health' : 'Health Connect';

  if (state.phase === 'syncing') {
    return (
      <View style={styles.row}>
        <Animated.View style={[styles.dot, { backgroundColor: colors.primary, opacity: pulse }]} />
        <Text style={styles.text}>Syncing {source}…</Text>
      </View>
    );
  }
  if (state.phase === 'error') {
    return (
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: colors.rankGold }]} />
        <Text style={styles.text}>{source} sync paused</Text>
      </View>
    );
  }
  if (!state.lastAt) return null;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: colors.success }]} />
      <Text style={styles.text}>
        Synced {timeLabel(state.lastAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600' },
});
