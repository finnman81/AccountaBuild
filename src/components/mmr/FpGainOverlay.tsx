import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMyMmrProjection } from '../../services/mmrProjection';
import { subscribeLogSaved } from '../../services/fpEvents';
import { colors } from '../../theme/colors';

/**
 * Floats a "+N FP" pill when a manual log bumps the projected week score.
 *
 * The projection stream and the "log saved" event can arrive in either order
 * (Firestore latency compensation fires snapshots before the write promise
 * resolves), so we track the most recent projected increase AND stay "armed"
 * for a window after each save.
 */
const PAIR_WINDOW_MS = 5000; // increase that already happened counts for a save this recent
const ARM_WINDOW_MS = 15000; // after a save, the next increase within this window floats

export default function FpGainOverlay() {
  const { user } = useContext(AuthContext);
  const [visibleDelta, setVisibleDelta] = useState<number | null>(null);

  const baseline = useRef<number | null>(null);
  const lastIncrease = useRef<{ delta: number; at: number } | null>(null);
  const armedUntil = useRef(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;

  const show = (delta: number) => {
    if (delta < 1) return;
    setVisibleDelta(Math.round(delta));
    opacity.setValue(0);
    rise.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]),
      Animated.timing(rise, { toValue: 1, duration: 2040, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => setVisibleDelta(null));
  };

  useEffect(() => {
    if (!user?.uid) return;
    const unsubProj = subscribeMyMmrProjection(user.uid, (p) => {
      if (!p) return;
      const val = p.mmrProjected;
      const prev = baseline.current;
      baseline.current = val;
      if (prev == null || val <= prev) return;
      const delta = val - prev;
      const now = Date.now();
      lastIncrease.current = { delta, at: now };
      if (now <= armedUntil.current) {
        armedUntil.current = 0;
        // Consume the increase so a rapid second save can't re-show it.
        lastIncrease.current = null;
        show(delta);
      }
    });
    const unsubSaved = subscribeLogSaved(() => {
      const now = Date.now();
      const inc = lastIncrease.current;
      if (inc && now - inc.at <= PAIR_WINDOW_MS) {
        lastIncrease.current = null;
        show(inc.delta);
      } else {
        armedUntil.current = now + ARM_WINDOW_MS;
      }
    });
    return () => {
      unsubProj();
      unsubSaved();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  if (visibleDelta == null) return null;

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, -56] });

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
      <Animated.Text style={styles.text}>+{visibleDelta} FP</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 130,
    alignSelf: 'center',
    backgroundColor: 'rgba(20,32,54,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(233,181,66,0.5)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  text: {
    color: colors.rankGold,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
