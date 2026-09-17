import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { subscribeFirstLog, subscribeLogSaved } from '../../services/fpEvents';
import { loadMyStreakMoment, type MyStreakMoment } from '../../services/streakMirror';
import { nextStreakMilestone, type StreakDayState } from '../../viewmodels/today';
import { DEFAULT_TZ, yyyyMmDdInTz } from '../../mmr/time';
import { colors, radius, spacing } from '../../theme';
import AppText from '../ui/AppText';

/**
 * The daily streak moment.
 *
 * Logging was the one thing the app never answered: the streak chip ticked up
 * in silence. This plays ONCE a day, on the first log that counts (a manual
 * save, or a health-synced log noticed when the app comes to the front).
 * Later logs the same day stay quiet, or people learn to tap through it.
 *
 * The week row has a state most streak apps lack: a REST day the streak
 * survived. Rest is part of the plan here, and this is where members see it.
 *
 * Skipped on someone's first log ever: FirstLogCelebration owns that moment.
 */
const RING = 184;
const STROKE = 10;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const seenKey = (uid: string) => `streakCelebrated:${uid}`;

function lines(m: MyStreakMoment): { title: string; sub: string } {
  const n = m.streak;
  const rested = m.week.some((d) => d.state === 'rest');
  const { next } = nextStreakMilestone(n);
  const toGo = next - n;
  if (n === 1) return { title: 'Day 1.', sub: 'Every streak starts here. Same time tomorrow.' };
  if (toGo === 1) return { title: `${n} days.`, sub: `One more day to ${next}.` };
  if (rested) return { title: `${n} days.`, sub: `Rest days counted. Streak safe. ${toGo} to ${next}.` };
  return { title: `${n} days.`, sub: `Do it again tomorrow. ${toGo} to ${next}.` };
}

function Dot({ state }: { state: StreakDayState }) {
  if (state === 'logged') {
    return (
      <View style={[styles.dot, styles.dotLogged]}>
        <AppText variant="cardLabel" style={styles.check}>✓</AppText>
      </View>
    );
  }
  if (state === 'rest') return <View style={[styles.dot, styles.dotRest]}><View style={styles.restCore} /></View>;
  if (state === 'missed') return <View style={[styles.dot, styles.dotMissed]} />;
  if (state === 'today') return <View style={[styles.dot, styles.dotToday]} />;
  return <View style={[styles.dot, styles.dotAhead]} />;
}

export default function StreakCelebration() {
  const { user } = useContext(AuthContext);
  const { activeGroupId } = useActiveGroup();
  const insets = useSafeAreaInsets();
  const [moment, setMoment] = useState<MyStreakMoment | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.8)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const suppressToday = useRef(false);

  const maybeShow = useCallback(async () => {
    const uid = user?.uid;
    if (!uid || !activeGroupId || busy.current || suppressToday.current) return;
    busy.current = true;
    try {
      const today = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
      if ((await AsyncStorage.getItem(seenKey(uid)).catch(() => null)) === today) return;
      const m = await loadMyStreakMoment(uid, activeGroupId);
      if (!m || !m.loggedToday || m.streak < 1) return;
      await AsyncStorage.setItem(seenKey(uid), today).catch(() => {});
      setMoment(m);
    } finally {
      busy.current = false;
    }
  }, [user?.uid, activeGroupId]);

  useEffect(() => {
    // First log EVER has its own full-screen moment; don't stack a second one.
    const offFirst = subscribeFirstLog(() => {
      suppressToday.current = true;
      if (user?.uid) void AsyncStorage.setItem(seenKey(user.uid), yyyyMmDdInTz(new Date(), DEFAULT_TZ)).catch(() => {});
    });
    // Manual save: give the write a beat to land, and let the +FP toast go first.
    const offSaved = subscribeLogSaved(() => { setTimeout(() => void maybeShow(), 1400); });
    // Health-synced logs never fire a save event: catch them when the app comes forward.
    const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') setTimeout(() => void maybeShow(), 2500); });
    const onOpen = setTimeout(() => void maybeShow(), 4000);
    return () => { offFirst(); offSaved(); appSub.remove(); clearTimeout(onOpen); };
  }, [maybeShow, user?.uid]);

  useEffect(() => {
    if (!moment) return;
    fade.setValue(0); pop.setValue(0.8); ring.setValue(0);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 900, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, [moment, fade, pop, ring]);

  if (!moment) return null;

  const close = () => Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMoment(null));
  const { progress } = nextStreakMilestone(moment.streak);
  const dash = ring.interpolate({ inputRange: [0, 1], outputRange: [CIRC, CIRC * (1 - Math.max(0.04, progress))] });
  const copy = lines(moment);
  const hasRest = moment.week.some((d) => d.state === 'rest');

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.base }]}>
      <View style={styles.body}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <View style={styles.ringWrap}>
            <Svg width={RING} height={RING}>
              <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.surface2} strokeWidth={STROKE} fill="none" />
              <AnimatedCircle
                cx={RING / 2} cy={RING / 2} r={R}
                stroke={colors.ringStreakLeader} strokeWidth={STROKE} strokeLinecap="round" fill="none"
                strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={dash}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            <View style={styles.ringCenter}>
              <AppText variant="pageTitle" style={styles.count}>{moment.streak}</AppText>
              <AppText variant="eyebrow" color="muted">DAY STREAK</AppText>
            </View>
          </View>
        </Animated.View>

        <AppText variant="pageTitle" color="primary" style={styles.title}>{copy.title}</AppText>
        <AppText variant="rowSubtitle" color="secondary" style={styles.sub}>{copy.sub}</AppText>

        <View style={styles.weekCard}>
          <View style={styles.weekRow}>
            {moment.week.map((d) => (
              <View key={d.date} style={styles.dayCol}>
                <Dot state={d.state} />
                <AppText variant="cardLabel" style={{ color: d.state === 'logged' ? colors.textPrimary : colors.textMuted, marginTop: 6 }}>
                  {d.label}
                </AppText>
              </View>
            ))}
          </View>
          {hasRest ? (
            <AppText variant="cardLabel" color="muted" style={styles.legend}>Hollow ring: rest day, streak safe.</AppText>
          ) : null}
        </View>
      </View>

      <TouchableOpacity onPress={close} activeOpacity={0.85} style={styles.button} accessibilityRole="button">
        <AppText variant="rowTitle" style={{ color: '#FFFFFF' }}>Continue</AppText>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, paddingHorizontal: spacing.base, zIndex: 50, elevation: 50 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  count: { fontSize: 64, lineHeight: 70, fontWeight: '800', color: colors.textPrimary },
  title: { marginTop: spacing.xl, textAlign: 'center' },
  sub: { marginTop: 6, textAlign: 'center', paddingHorizontal: spacing.base },
  weekCard: {
    alignSelf: 'stretch', marginTop: spacing.xl, backgroundColor: colors.surface,
    borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderCard, padding: spacing.base,
  },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', flex: 1 },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dotLogged: { backgroundColor: colors.ringStreakLeader },
  check: { color: '#0B0C10', fontWeight: '800', fontSize: 16 },
  dotRest: { borderWidth: 2, borderColor: colors.ringStreakLeader },
  restCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ringStreakLeader },
  dotMissed: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.danger },
  dotToday: { borderWidth: 2, borderColor: colors.textMuted, borderStyle: 'dashed' },
  dotAhead: { backgroundColor: colors.surface2 },
  legend: { marginTop: spacing.md, textAlign: 'center' },
  button: { height: 52, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
