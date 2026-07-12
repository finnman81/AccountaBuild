import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import AppText from '../ui/AppText';
import { colors, radius } from '../../theme';

export type ComplianceBar = { label: string; pct: number; ratio: string };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  const to = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
function colorForPercent(percent: number, redHex: string, greenHex: string) {
  const t = Math.max(0, Math.min(1, percent / 100));
  const a = hexToRgb(redHex);
  const b = hexToRgb(greenHex);
  return rgbToHex(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
}

function BarColumn({ bar, trackHeight }: { bar: ComplianceBar; trackHeight: number }) {
  const pct = Math.max(0, Math.min(100, bar.pct));
  const fill = colorForPercent(pct, colors.danger, colors.success);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animating height
    }).start();
  }, [pct, anim]);

  const fillHeight = anim.interpolate({ inputRange: [0, 100], outputRange: [4, trackHeight] });

  return (
    <View style={styles.col}>
      <AppText variant="rowTitle" color="primary" style={styles.pct}>{pct}%</AppText>
      <View style={[styles.track, { height: trackHeight }]}>
        <Animated.View style={[styles.fill, { height: fillHeight, backgroundColor: fill }]} />
      </View>
      <AppText variant="rowSubtitle" color="primary" style={styles.label}>{bar.label}</AppText>
      <AppText variant="label" color="muted">{bar.ratio}</AppText>
    </View>
  );
}

/** Weekly group-compliance bars (weight/calories/workouts % toward goals). */
export default function ComplianceBars({ bars, height = 150 }: { bars: ComplianceBar[]; height?: number }) {
  const trackHeight = Math.max(60, height - 76); // room for % above and labels below
  return (
    <View style={styles.row}>
      {bars.map((b) => (
        <BarColumn key={b.label} bar={b} trackHeight={trackHeight} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-end' },
  col: { flex: 1, alignItems: 'center' },
  pct: { marginBottom: 6, fontVariant: ['tabular-nums'] },
  track: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface2,
    borderRadius: radius.tile,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: { borderRadius: radius.tile },
  label: { marginTop: 8 },
});
