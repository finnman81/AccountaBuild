import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Text from './Text';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../../theme/colors';
import { display } from '../../theme/fonts';
import { duration, easing } from '../../theme/motion';
import { useCountTo } from './AnimatedNumber';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** 0–1 fraction, or 0–100 percent (auto-detected: values > 1 treated as percent). */
  pct: number;
  size?: number;
  strokeWidth?: number;
  /** Show the "NN%" label in the center. */
  showLabel?: boolean;
};

/**
 * Weekly-compliance ring: track + progress arc. Green at/above 60%, amber below.
 */
export default function ComplianceRing({ pct, size = 64, strokeWidth = 6, showLabel = true }: Props) {
  const frac = Math.max(0, Math.min(1, pct > 1 ? pct / 100 : pct));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  // The arc glides to a new value in step with the label (first paint is
  // instant). SVG stroke props can't use the native driver; this is one small
  // prop on one node, and it only runs when the value changes.
  const anim = useRef(new Animated.Value(frac)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const run = Animated.timing(anim, { toValue: frac, duration: duration.count, easing: easing.enter, useNativeDriver: false });
    run.start();
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frac]);
  const label = useCountTo(Math.round(frac * 100));
  const color = frac >= 0.6 ? colors.success : colors.warning;
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={colors.surface2} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={anim.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
          // Start the arc at 12 o'clock.
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      {showLabel && (
        <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: size * 0.28, fontFamily: display.bold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
            {label}%
          </Text>
        </View>
      )}
    </View>
  );
}
