import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../../theme/colors';

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
  const arc = c * frac;
  const color = frac >= 0.6 ? colors.success : colors.warning;
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={r} stroke={colors.surface2} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c - arc}`}
          // Start the arc at 12 o'clock.
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      {showLabel && (
        <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: size * 0.24, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
            {Math.round(frac * 100)}%
          </Text>
        </View>
      )}
    </View>
  );
}
