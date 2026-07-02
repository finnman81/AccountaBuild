import React, { useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors } from '../../theme/colors';

type Props = {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** Every Nth step is a taller "major" tick. */
  majorEvery?: number;
};

const PX_PER_STEP = 12;
const TICKS_EACH_SIDE = 30;

/**
 * Horizontal ruler you drag to adjust a value. The ticks scroll under a fixed
 * blue center indicator; snaps to `step`; light haptic tick on each step change.
 * (A tap-to-type fallback lives in the composer, so precise entry never depends
 * on the gesture.)
 */
export default function RulerDial({ value, onChange, min, max, step, majorEvery = 10 }: Props) {
  const [width, setWidth] = useState(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const startValue = useRef(value);
  const lastStep = useRef(Math.round(value / step));

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const snap = (v: number) => clamp(Math.round(v / step) * step);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startValue.current = valueRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const snapped = snap(startValue.current - (g.dx / PX_PER_STEP) * step);
        if (snapped !== valueRef.current) {
          const s = Math.round(snapped / step);
          if (s !== lastStep.current) {
            lastStep.current = s;
            if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
          }
          onChange(snapped);
        }
      },
    }),
  ).current;

  const centerX = width / 2;
  const base = snap(value);
  const ticks: Array<{ x: number; major: boolean; key: number }> = [];
  for (let i = -TICKS_EACH_SIDE; i <= TICKS_EACH_SIDE; i += 1) {
    const tickValue = snap(base + i * step);
    if (tickValue < min || tickValue > max) continue;
    const x = centerX + (tickValue - value) * PX_PER_STEP;
    if (x < -20 || x > width + 20) continue;
    const stepIndex = Math.round(tickValue / step);
    ticks.push({ x, major: stepIndex % majorEvery === 0, key: stepIndex });
  }

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...responder.panHandlers}>
      {width > 0 &&
        ticks.map((t) => (
          <View key={t.key} style={[styles.tick, { left: t.x - 1, height: t.major ? 26 : 13, opacity: t.major ? 0.85 : 0.4 }]} />
        ))}
      <View style={[styles.center, { left: centerX - 1.5 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 56, justifyContent: 'center', overflow: 'hidden' },
  tick: { position: 'absolute', top: 15, width: 2, borderRadius: 1, backgroundColor: colors.ringNotLogged },
  center: { position: 'absolute', top: 8, width: 3, height: 40, borderRadius: 2, backgroundColor: colors.primary },
});
