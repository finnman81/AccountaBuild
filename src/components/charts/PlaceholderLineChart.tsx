import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from 'react-native-paper';

type Props = {
  height?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function PlaceholderLineChart({ height = 140 }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const chartWidth = clamp(width - 32, 240, 520);

  // Use same insets as SimpleLineChart for consistency
  const paddingLeft = 18;
  const paddingRight = 26;
  const paddingTop = 20;
  const paddingBottom = 22;
  const xDomainPadding = 12;

  const plotW = chartWidth - paddingLeft - paddingRight;
  const plotH = height - paddingTop - paddingBottom;

  const pts = [
    { x: paddingLeft + xDomainPadding + plotW * 0.0, y: paddingTop + plotH * 0.65 },
    { x: paddingLeft + xDomainPadding + plotW * 0.22, y: paddingTop + plotH * 0.55 },
    { x: paddingLeft + xDomainPadding + plotW * 0.45, y: paddingTop + plotH * 0.6 },
    { x: paddingLeft + xDomainPadding + plotW * 0.7, y: paddingTop + plotH * 0.42 },
    { x: paddingLeft + xDomainPadding + plotW * 1.0, y: paddingTop + plotH * 0.38 },
  ];
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <View style={{ width: chartWidth, height }}>
      <Svg width={chartWidth} height={height}>
        <Path d={d} stroke={theme.colors.outlineVariant} strokeWidth={3} fill="none" opacity={0.5} />
        {pts.map((p, idx) => (
          <Circle key={idx} cx={p.x} cy={p.y} r={3.5} fill={theme.colors.outlineVariant} opacity={0.7} />
        ))}
      </Svg>
    </View>
  );
}

