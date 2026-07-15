import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { subscribeFirstLog } from '../../services/fpEvents';
import { colors } from '../../theme/colors';
import AppText from '../ui/AppText';

/**
 * A one-time, full-screen "you're on the board" moment the very first time a
 * user ever logs. Fired by LogComposer via subscribeFirstLog (guarded by a
 * per-user AsyncStorage flag), so this plays at most once per account.
 *
 * Deliberately dependency-free: a scale/fade card with a burst of emoji dots
 * rather than a confetti library, to avoid adding native deps for a moment.
 */
const DOTS = ['🎉', '💪', '🔥', '⭐️', '🏆', '✨'];

export default function FirstLogCelebration() {
  const [visible, setVisible] = useState(false);
  const backdrop = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.7)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = subscribeFirstLog(() => {
      setVisible(true);
      backdrop.setValue(0);
      scale.setValue(0.7);
      burst.setValue(0);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => {
        Animated.timing(backdrop, {
          toValue: 0,
          duration: 380,
          delay: 2200,
          useNativeDriver: true,
        }).start(() => setVisible(false));
      });
    });
    return unsub;
  }, [backdrop, scale, burst]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdrop }]}>
      <View style={styles.burstLayer}>
        {DOTS.map((d, i) => {
          const angle = (i / DOTS.length) * Math.PI * 2;
          const tx = burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 120] });
          const ty = burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 120] });
          const op = burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1, 0] });
          return (
            <Animated.Text key={i} style={[styles.dot, { opacity: op, transform: [{ translateX: tx }, { translateY: ty }] }]}>
              {d}
            </Animated.Text>
          );
        })}
      </View>
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <AppText variant="pageTitle" color="primary" style={{ textAlign: 'center' }}>
          You&apos;re on the board! 🎉
        </AppText>
        <AppText variant="body" color="secondary" style={{ textAlign: 'center', marginTop: 8 }}>
          First log in the books. This is where your streak — and your Fitness Points — start.
        </AppText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,14,26,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  burstLayer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', fontSize: 30 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(233,181,66,0.5)',
    paddingHorizontal: 26,
    paddingVertical: 28,
    marginHorizontal: 32,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
});
