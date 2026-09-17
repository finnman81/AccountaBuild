import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthContext } from '../../store/AuthContext';
import { useActiveGroup } from '../../store/ActiveGroupContext';
import { subscribeFirstLog, subscribeLogSaved } from '../../services/fpEvents';
import { announceStreakMilestone, loadMyStreakMoment, type MyStreakMoment } from '../../services/streakMirror';
import {
  highestMilestoneAtOrBelow,
  milestoneToCelebrate,
  nextStreakMilestone,
  streakMilestoneCopy,
  type StreakDayState,
} from '../../viewmodels/today';
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
// Highest milestone THIS streak has celebrated. Seeded silently the first time
// (no retroactive parties for streaks that predate the feature); reset when a
// streak ends so the next run earns its 7 again.
const milestoneKey = (uid: string) => `streakMilestoneSeen:${uid}`;
// Last streak we showed, to notice the day it ends.
const lastKey = (uid: string) => `streakLast:${uid}`;
/** A lost streak shorter than this isn't worth a screen. */
const ENDED_MIN = 3;

/**
 * Three modes on one screen:
 *  daily      calm: ring breathes, count ticks up from yesterday
 *  milestone  7/14/30/50/100...: full ring, gold burst, the group is told
 *  ended      the streak broke: no red, no guilt, best streak on record
 */
type Mode = { kind: 'daily' } | { kind: 'milestone'; m: number } | { kind: 'ended'; was: number };

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
  const [mode, setMode] = useState<Mode>({ kind: 'daily' });
  const [shown, setShown] = useState(0); // the number on screen (counts up)
  const pulse = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const queued = useRef<MyStreakMoment | null>(null); // a Day 1 waiting behind an "ended" screen
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
      const [seenDay, seenMsRaw, lastRaw] = await Promise.all([
        AsyncStorage.getItem(seenKey(uid)).catch(() => null),
        AsyncStorage.getItem(milestoneKey(uid)).catch(() => null),
        AsyncStorage.getItem(lastKey(uid)).catch(() => null),
      ]);
      if (seenDay === today) return;
      const m = await loadMyStreakMoment(uid, activeGroupId);
      if (!m) return;

      // The streak ended since we last looked (today can't break it, so a
      // count below the last one means a real gap).
      const last = Number(lastRaw) || 0;
      if (last >= ENDED_MIN && m.streak < last && m.streak <= 1) {
        await Promise.all([
          AsyncStorage.setItem(lastKey(uid), String(m.streak)).catch(() => {}),
          AsyncStorage.setItem(milestoneKey(uid), '0').catch(() => {}),
        ]);
        queued.current = m.loggedToday && m.streak >= 1 ? m : null;
        if (queued.current) await AsyncStorage.setItem(seenKey(uid), today).catch(() => {});
        setMode({ kind: 'ended', was: last });
        setMoment({ ...m, best: Math.max(m.best, last) });
        return;
      }

      if (!m.loggedToday || m.streak < 1) return;
      const seenMs = seenMsRaw == null ? highestMilestoneAtOrBelow(m.streak - 1) : Number(seenMsRaw) || 0;
      const hit = milestoneToCelebrate(m.streak, seenMs);
      await Promise.all([
        AsyncStorage.setItem(seenKey(uid), today).catch(() => {}),
        AsyncStorage.setItem(lastKey(uid), String(m.streak)).catch(() => {}),
        AsyncStorage.setItem(milestoneKey(uid), String(hit ?? seenMs)).catch(() => {}),
      ]);
      if (hit) void announceStreakMilestone(hit);
      setMode(hit ? { kind: 'milestone', m: hit } : { kind: 'daily' });
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
    fade.setValue(0); pop.setValue(0.8); ring.setValue(0); pulse.setValue(0); burst.setValue(0);
    const big = mode.kind === 'milestone';
    if (mode.kind !== 'ended') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (big) setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 900);
    }
    // The count ticks up from yesterday's number: you watch today get added.
    const target = mode.kind === 'ended' ? mode.was : moment.streak;
    const from = mode.kind === 'ended' ? target : Math.max(0, target - (big ? Math.min(target, 12) : 1));
    setShown(from);
    const steps = target - from;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    for (let i = 1; i <= steps; i += 1) timers.push(setTimeout(() => setShown(from + i), 450 + (i * (big ? 700 : 350)) / steps));
    // The ring breathes for as long as the screen is up (bigger on milestones).
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    if (mode.kind !== 'ended') loop.start();
    if (big) Animated.timing(burst, { toValue: 1, duration: 1100, delay: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const cleanup = () => { loop.stop(); timers.forEach(clearTimeout); };
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 900, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
    return cleanup;
  }, [moment, mode, fade, pop, ring, pulse, burst]);

  if (!moment) return null;

  const close = () =>
    Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      const next = queued.current;
      queued.current = null;
      if (next) {
        // The streak ended AND they logged today: Day 1 follows the goodbye.
        setMode({ kind: 'daily' });
        setMoment({ ...next });
      } else setMoment(null);
    });

  const ended = mode.kind === 'ended';
  const big = mode.kind === 'milestone';
  const { progress } = nextStreakMilestone(moment.streak);
  const fill = ended ? 0 : big ? 1 : Math.max(0.04, progress);
  const dash = ring.interpolate({ inputRange: [0, 1], outputRange: [CIRC, CIRC * (1 - fill)] });
  const breathe = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, big ? 1.06 : 1.025] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [big ? 0.55 : 0.25, 1] });
  const copy =
    mode.kind === 'ended'
      ? { title: `Streak ended at ${mode.was}.`, sub: `Your best: ${Math.max(moment.best, mode.was)}. Day 1 starts with your next log.` }
      : mode.kind === 'milestone'
        ? { title: streakMilestoneCopy(mode.m).title, sub: streakMilestoneCopy(mode.m).line }
        : lines(moment);
  const hasRest = !ended && moment.week.some((d) => d.state === 'rest');
  const ringColor = ended ? colors.textMuted : colors.ringStreakLeader;

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.base }]}>
      <View style={styles.body}>
        {big ? (
          <View style={styles.burstLayer} pointerEvents="none">
            {Array.from({ length: 14 }).map((_, i) => {
              const angle = (i / 14) * Math.PI * 2;
              const dist = 150 + (i % 3) * 28;
              const tx = burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] });
              const ty = burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist] });
              const op = burst.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 0.9, 0] });
              return <Animated.View key={i} style={[styles.spark, i % 2 ? styles.sparkSmall : null, { opacity: op, transform: [{ translateX: tx }, { translateY: ty }] }]} />;
            })}
          </View>
        ) : null}

        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Animated.View style={[styles.ringWrap, { transform: [{ scale: breathe }] }]}>
            <Animated.View style={{ opacity: ended ? 1 : glow }}>
              <Svg width={RING} height={RING}>
                <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.surface2} strokeWidth={STROKE} fill="none" />
                <AnimatedCircle
                  cx={RING / 2} cy={RING / 2} r={R}
                  stroke={ringColor} strokeWidth={STROKE} strokeLinecap="round" fill="none"
                  strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={dash}
                  transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                />
              </Svg>
            </Animated.View>
            <View style={styles.ringCenter}>
              <AppText variant="pageTitle" style={[styles.count, big && styles.countBig, ended && { color: colors.textMuted }]}>{shown}</AppText>
              <AppText variant="eyebrow" color="muted">{ended ? 'DAYS' : 'DAY STREAK'}</AppText>
            </View>
          </Animated.View>
        </Animated.View>

        <AppText variant="pageTitle" color="primary" style={[styles.title, big && { color: colors.ringStreakLeader }]}>{copy.title}</AppText>
        <AppText variant="rowSubtitle" color="secondary" style={styles.sub}>{copy.sub}</AppText>
        {mode.kind === 'milestone' ? (
          <AppText variant="cardLabel" color="muted" style={{ marginTop: spacing.md }}>
            {mode.m >= 30 ? 'Badge earned. Your group has been told.' : 'Your group has been told.'}
          </AppText>
        ) : null}

        {ended ? null : (
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
        )}
      </View>

      <TouchableOpacity onPress={close} activeOpacity={0.85} style={styles.button} accessibilityRole="button">
        <AppText variant="rowTitle" style={{ color: '#FFFFFF' }}>{ended ? 'Start again' : 'Continue'}</AppText>
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
  countBig: { fontSize: 76, lineHeight: 82, color: colors.ringStreakLeader },
  burstLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ringStreakLeader },
  sparkSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F5D98A' },
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
