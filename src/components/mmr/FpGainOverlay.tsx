import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMyMmrProjection } from '../../services/mmrProjection';
import { subscribeLogSaved, type SavedLogInfo } from '../../services/fpEvents';
import { setLogFpDelta } from '../../services/logs';
import { colors } from '../../theme/colors';

/**
 * Floats feedback after EVERY manual log: "+N FP" when the projected week
 * score moved, or a neutral "Logged ✓" when the gain was under 1 FP (e.g. a
 * weigh-in with no weight goal) — a save should never feel ignored.
 *
 * The projection stream and the "log saved" event can arrive in either order
 * (Firestore latency compensation fires snapshots before the write promise
 * resolves), so we track the most recent projected increase AND stay "armed"
 * for a window after each save, with a timer fallback when no gain arrives.
 */
const PAIR_WINDOW_MS = 5000; // increase that already happened counts for a save this recent
const ARM_WINDOW_MS = 15000; // after a save, the next increase within this window floats
const FALLBACK_MS = 3500; // no gain by then -> show the neutral confirmation

type Toast = { kind: 'gain'; delta: number } | { kind: 'logged' };

export default function FpGainOverlay() {
  const { user } = useContext(AuthContext);
  const [toast, setToast] = useState<Toast | null>(null);

  const baseline = useRef<number | null>(null);
  const lastIncrease = useRef<{ delta: number; at: number } | null>(null);
  const armedUntil = useRef(0);
  // The log doc awaiting an FP stamp (set on save, consumed when a gain pairs).
  const pendingStamp = useRef<SavedLogInfo | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;

  const clearFallback = () => {
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  };

  const show = (next: Toast) => {
    setToast(next);
    opacity.setValue(0);
    rise.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]),
      Animated.timing(rise, { toValue: 1, duration: 2040, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const showGain = (delta: number) => {
    clearFallback();
    // Sub-1 gains still deserve acknowledgement — round up to +1 rather than
    // staying silent (the projection genuinely moved).
    const rounded = delta >= 0.5 ? Math.max(1, Math.round(delta)) : null;
    show(rounded != null ? { kind: 'gain', delta: rounded } : { kind: 'logged' });
    // Persist the toast value onto the log so entries/history can show what
    // each log earned. Same number the user just saw — approximate by design.
    const target = pendingStamp.current;
    pendingStamp.current = null;
    if (rounded != null && target) {
      void setLogFpDelta(target.groupId, target.logId, rounded).catch(() => {});
    }
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
        showGain(delta);
      }
    });
    const unsubSaved = subscribeLogSaved((info) => {
      const now = Date.now();
      pendingStamp.current = info ?? null;
      const inc = lastIncrease.current;
      if (inc && now - inc.at <= PAIR_WINDOW_MS) {
        lastIncrease.current = null;
        showGain(inc.delta);
        return;
      }
      armedUntil.current = now + ARM_WINDOW_MS;
      // Guarantee feedback: if no projected gain lands shortly, confirm the
      // log anyway (weight logs without a weight goal move nothing, etc).
      clearFallback();
      fallbackTimer.current = setTimeout(() => {
        fallbackTimer.current = null;
        if (armedUntil.current > 0) {
          armedUntil.current = 0;
          show({ kind: 'logged' });
        }
      }, FALLBACK_MS);
    });
    return () => {
      unsubProj();
      unsubSaved();
      clearFallback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  if (!toast) return null;

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, -56] });
  const isGain = toast.kind === 'gain';

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, isGain ? styles.wrapGain : styles.wrapLogged, { opacity, transform: [{ translateY }] }]}
    >
      <Animated.Text style={[styles.text, { color: isGain ? colors.rankGold : colors.success }]}>
        {isGain ? `+${toast.delta} FP` : 'Logged ✓'}
      </Animated.Text>
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
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  wrapGain: { borderColor: 'rgba(233,181,66,0.5)' },
  wrapLogged: { borderColor: 'rgba(74,222,128,0.45)' },
  text: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
