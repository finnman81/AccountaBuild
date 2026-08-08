import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { AuthContext } from '../../store/AuthContext';
import { subscribeMyMmrProjection } from '../../services/mmrProjection';
import { subscribeLogSaved, type SavedLogInfo } from '../../services/fpEvents';
import { setLogFpDelta } from '../../services/logs';
import { colors } from '../../theme/colors';

/**
 * Floats feedback after EVERY manual log: "+N FP" for what THAT log is worth,
 * or a neutral "Logged ✓" when it's worth under 1 FP (e.g. a weigh-in with no
 * weight goal) — a save should never feel ignored.
 *
 * ATTRIBUTION, not observation. The old version watched for any increase in
 * projected FP within 15s of a save and credited it to that log. When the 4s
 * live-settle recompute landed in the same window carrying unrelated gains,
 * the toast bundled them: Regmong saw "+103 FP" for a workout genuinely worth
 * +5, the rest being his weigh-in and the week's multipliers settling
 * (prod, 2026-08-07). Users then calibrate on a number that isn't real.
 *
 * Now we read the log's OWN marginal value from the projection's what-if
 * engine — the same number "See the math" promises for your next workout —
 * captured from a snapshot taken BEFORE the save landed.
 */
const PRE_SAVE_GUARD_MS = 400; // a snapshot newer than this may already include the save
const SNAPSHOT_HISTORY = 4;

type Toast = { kind: 'gain'; delta: number } | { kind: 'logged' };

export default function FpGainOverlay() {
  const { user } = useContext(AuthContext);
  const [toast, setToast] = useState<Toast | null>(null);

  // Recent what-if snapshots, so a save can be valued against the state
  // BEFORE it landed (the projection stream and the save event race).
  const snaps = useRef<Array<{ whatIf: { workout: number; calorieDay: number; weighIn: number }; at: number }>>([]);
  const pendingStamp = useRef<SavedLogInfo | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;

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

    // Keep a short history of what-if values so a save can be priced against
    // the state BEFORE it landed — the projection stream and the save event
    // race, and a snapshot that already includes the new log would value it
    // at ~0.
    const unsubProj = subscribeMyMmrProjection(user.uid, (p) => {
      if (!p?.whatIf) return;
      snaps.current = [...snaps.current, { whatIf: p.whatIf, at: Date.now() }].slice(-SNAPSHOT_HISTORY);
    });

    const unsubSaved = subscribeLogSaved((info) => {
      pendingStamp.current = info ?? null;
      const now = Date.now();
      const pre =
        [...snaps.current].reverse().find((sn) => sn.at < now - PRE_SAVE_GUARD_MS) ??
        snaps.current[snaps.current.length - 1];

      // Photos have no scoring dimension, and an unknown kind can't be priced.
      const key =
        info?.kind === 'workout' ? 'workout'
        : info?.kind === 'calories' ? 'calorieDay'
        : info?.kind === 'weight' ? 'weighIn'
        : null;

      if (!pre || !key) {
        show({ kind: 'logged' });
        pendingStamp.current = null;
        return;
      }
      showGain(pre.whatIf[key] ?? 0);
    });

    return () => {
      unsubProj();
      unsubSaved();
    };
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
