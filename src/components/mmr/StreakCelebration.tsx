import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, AppState, StyleSheet, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
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
import { duration, easing, spring } from '../../theme/motion';
import { enqueueCelebration } from '../../services/celebrationQueue';
import ShareCardHost, { type ShareCardHandle } from '../share/ShareCard';
import { APP_STORE_URL, inviteUrl } from '../../constants/links';
import AppText from '../ui/AppText';
import ProgressBar from '../ui/ProgressBar';

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
/** Height of one number in the roll (also its line height). */
const NUM_H = 108;
/** Most numbers a milestone rolls through. */
const MAX_ROLL = 12;

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
 *  daily      the count rolls from yesterday's number to today's and lands
 *             with a thump; then the week stamps in, today last
 *  milestone  7/14/30/50/100...: a longer roll, gold, a burst, the group is told
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
  const { activeGroupId, groups } = useActiveGroup();
  const shareRef = useRef<ShareCardHandle>(null);
  const insets = useSafeAreaInsets();
  const [moment, setMoment] = useState<MyStreakMoment | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'daily' });
  const [barTo, setBarTo] = useState(0); // milestone bar target (glides after the roll lands)
  const roll = useRef(new Animated.Value(0)).current; // 0 = yesterday's number, 1 = today's
  const thump = useRef(new Animated.Value(1)).current;
  const textIn = useRef(new Animated.Value(0)).current;
  const days = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  const burst = useRef(new Animated.Value(0)).current;
  const queued = useRef<MyStreakMoment | null>(null); // a Day 1 waiting behind an "ended" screen
  const fade = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const suppressToday = useRef(false);

  // Take the shared celebration stage (after the FP toast, never over a
  // rank-up) and give it back when this screen closes.
  const stageDone = useRef<(() => void) | null>(null);
  const present = (showIt: () => void) =>
    enqueueCelebration((done) => {
      stageDone.current = done;
      showIt();
    });

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
        present(() => {
          setMode({ kind: 'ended', was: last });
          setMoment({ ...m, best: Math.max(m.best, last) });
        });
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
      present(() => {
        setMode(hit ? { kind: 'milestone', m: hit } : { kind: 'daily' });
        setMoment(m);
      });
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
    const big = mode.kind === 'milestone';
    const ended = mode.kind === 'ended';
    fade.setValue(0); roll.setValue(0); thump.setValue(1); burst.setValue(0);
    textIn.setValue(ended ? 1 : 0);
    days.forEach((d) => d.setValue(0));

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const anims: Animated.CompositeAnimation[] = [];
    const run = (a: Animated.CompositeAnimation) => { anims.push(a); a.start(); };
    const cleanup = () => { timers.forEach(clearTimeout); anims.forEach((a) => a.stop()); };

    run(Animated.timing(fade, { toValue: 1, duration: duration.base, easing: easing.enter, useNativeDriver: true }));
    if (ended) return cleanup; // a quiet screen: no roll, no stamps

    // The bar starts where yesterday left it and glides once the number lands.
    setBarTo(big ? 1 : nextStreakMilestone(Math.max(0, moment.streak - 1)).progress);

    // 1. The number rolls from yesterday's count to today's (further on a milestone).
    const rollMs = big ? duration.celebrate : duration.count;
    const landAt = 350 + rollMs;
    run(Animated.timing(roll, { toValue: 1, duration: rollMs, delay: 350, easing: easing.standard, useNativeDriver: true }));

    // 2. It lands: a thump you can feel.
    timers.push(setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      run(Animated.sequence([
        Animated.timing(thump, { toValue: big ? 1.14 : 1.08, duration: duration.instant, easing: easing.enter, useNativeDriver: true }),
        Animated.spring(thump, { toValue: 1, ...spring.pop, useNativeDriver: true }),
      ]));
      run(Animated.timing(textIn, { toValue: 1, duration: duration.base, easing: easing.enter, useNativeDriver: true }));
      if (big) run(Animated.timing(burst, { toValue: 1, duration: duration.celebrate, easing: easing.enter, useNativeDriver: true }));
      setBarTo(big ? 1 : Math.max(0.04, nextStreakMilestone(moment.streak).progress));
    }, landAt));

    // 3. The week stamps in, in order, with today last and hardest.
    const todayYmd = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
    const todayIdx = moment.week.findIndex((d) => d.date === todayYmd);
    const order = moment.week.map((_, i) => i).filter((i) => i !== todayIdx);
    order.forEach((i, n) => {
      run(Animated.timing(days[i], { toValue: 1, duration: duration.fast, delay: landAt + 250 + n * 90, easing: easing.enter, useNativeDriver: true }));
    });
    if (todayIdx >= 0) {
      const stampAt = landAt + 250 + order.length * 90 + 120;
      timers.push(setTimeout(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        run(Animated.spring(days[todayIdx], { toValue: 1, ...spring.pop, useNativeDriver: true }));
      }, stampAt));
    }
    return cleanup;
  }, [moment, mode, fade, roll, thump, textIn, days, burst]);

  if (!moment) return null;

  const close = () =>
    Animated.timing(fade, { toValue: 0, duration: duration.fast, easing: easing.exit, useNativeDriver: true }).start(() => {
      const next = queued.current;
      queued.current = null;
      if (next) {
        // The streak ended AND they logged today: Day 1 follows the goodbye.
        setMode({ kind: 'daily' });
        setMoment({ ...next });
      } else {
        setMoment(null);
        stageDone.current?.();
        stageDone.current = null;
      }
    });

  const ended = mode.kind === 'ended';
  const big = mode.kind === 'milestone';
  // The numbers the roll passes through: yesterday's, then today's (a
  // milestone spins through up to MAX_ROLL of them).
  const target = mode.kind === 'ended' ? mode.was : moment.streak;
  const rollFrom = ended ? target : Math.max(0, target - (big ? Math.min(target, MAX_ROLL) : 1));
  const numbers = Array.from({ length: target - rollFrom + 1 }, (_, i) => rollFrom + i);
  const rollY = roll.interpolate({ inputRange: [0, 1], outputRange: [0, -NUM_H * (numbers.length - 1)] });
  const todayYmd = yyyyMmDdInTz(new Date(), DEFAULT_TZ);
  const copy =
    mode.kind === 'ended'
      ? { title: `Streak ended at ${mode.was}.`, sub: `Your best: ${Math.max(moment.best, mode.was)}. Day 1 starts with your next log.` }
      : mode.kind === 'milestone'
        ? { title: streakMilestoneCopy(mode.m).title, sub: streakMilestoneCopy(mode.m).line }
        : lines(moment);
  const hasRest = !ended && moment.week.some((d) => d.state === 'rest');

  // Share as a story card. The message carries this group's invite link, so
  // every share is also a way in.
  const shareStreak = () => {
    const g = groups.find((x) => x.groupId === activeGroupId);
    const link = g?.joinCode ? inviteUrl(g.joinCode) : APP_STORE_URL;
    void shareRef.current?.share(
      {
        eyebrow: 'DAY STREAK',
        big: String(moment.streak),
        title: big ? copy.title : `${moment.streak} ${moment.streak === 1 ? 'day' : 'days'} straight.`,
        sub: big ? copy.sub : "Logged every day. Rest days count, excuses don't.",
        groupName: g?.name ?? null,
      },
      `${moment.streak}-day streak on AccountaBuild.${g?.name ? ` Join ${g.name}:` : ''} ${link}`,
    );
  };

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

        <AppText variant="eyebrow" color="muted">{ended ? 'DAYS' : 'DAY STREAK'}</AppText>
        <Animated.View style={[styles.rollClip, { transform: [{ scale: thump }] }]}>
          <Animated.View style={{ transform: [{ translateY: rollY }] }}>
            {numbers.map((n) => (
              <AppText key={n} variant="pageTitle" style={[styles.count, big && { color: colors.ringStreakLeader }, ended && { color: colors.textMuted }]}>
                {n}
              </AppText>
            ))}
          </Animated.View>
        </Animated.View>

        <Animated.View style={{ alignSelf: 'stretch', alignItems: 'center', opacity: textIn, transform: [{ translateY: textIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <AppText variant="pageTitle" color="primary" style={[styles.title, big && { color: colors.ringStreakLeader }]}>{copy.title}</AppText>
        <AppText variant="rowSubtitle" color="secondary" style={styles.sub}>{copy.sub}</AppText>
        {ended ? null : (
          <View style={styles.barWrap}>
            <ProgressBar progress={barTo} height={6} color={colors.ringStreakLeader} backgroundColor={colors.surface2} />
          </View>
        )}
        {mode.kind === 'milestone' ? (
          <AppText variant="cardLabel" color="muted" style={{ marginTop: spacing.md }}>
            {mode.m >= 30 ? 'Badge earned. Your group has been told.' : 'Your group has been told.'}
          </AppText>
        ) : null}
        </Animated.View>

        {ended ? null : (
          <View style={styles.weekCard}>
            <View style={styles.weekRow}>
              {moment.week.map((d, i) => (
                <View key={d.date} style={styles.dayCol}>
                  {/* Each day pops in; today drops in from large, like a stamp. */}
                  <Animated.View
                    style={{
                      opacity: days[i].interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
                      transform: [{ scale: days[i].interpolate({ inputRange: [0, 1], outputRange: [d.date === todayYmd ? 2.2 : 0.5, 1] }) }],
                    }}
                  >
                    <Dot state={d.state} />
                  </Animated.View>
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
      {ended ? null : (
        <TouchableOpacity onPress={shareStreak} activeOpacity={0.7} style={styles.shareBtn} accessibilityRole="button">
          <AppText variant="rowTitle" color="secondary">Share</AppText>
        </TouchableOpacity>
      )}
      <ShareCardHost ref={shareRef} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, paddingHorizontal: spacing.base, zIndex: 50, elevation: 50 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rollClip: { height: NUM_H, overflow: 'hidden', alignItems: 'center', marginTop: 4, alignSelf: 'stretch' },
  count: { fontSize: 96, lineHeight: NUM_H, height: NUM_H, fontWeight: '800', letterSpacing: -2, color: colors.textPrimary, textAlign: 'center', fontVariant: ['tabular-nums'] },
  barWrap: { alignSelf: 'stretch', marginTop: spacing.base, marginHorizontal: spacing.xl },
  burstLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ringStreakLeader },
  sparkSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F5D98A' },
  title: { marginTop: spacing.md, textAlign: 'center' },
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
  shareBtn: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
});
