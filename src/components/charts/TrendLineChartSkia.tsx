import React, { useMemo } from 'react';
import { View } from 'react-native';
import { CartesianChart, Line, Area } from 'victory-native';
import { Circle, LinearGradient, Text as SkiaText, useFont, vec } from '@shopify/react-native-skia';

import { colors } from '../../theme';

const INTER_SEMIBOLD = require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf');

type Props = {
  values: number[];
  height?: number;
  width?: number;
  color?: string;
  /** Draw a value label above each point (only sensible for short series). */
  showPointLabels?: boolean;
  formatPointLabel?: (v: number) => string;
  labelColor?: string;
  yMin?: number;
  yMax?: number;
};

/**
 * Production-grade trend chart (Victory Native XL on Skia): smooth curve,
 * gradient area fill, highlighted latest point. Drop-in replacement for the
 * old hand-rolled SVG SimpleLineChart (same props).
 */
export default function TrendLineChartSkia({
  values,
  height = 160,
  width,
  color = colors.primary,
  showPointLabels = false,
  formatPointLabel,
  labelColor = colors.textPrimary,
  yMin,
  yMax,
}: Props) {
  const font = useFont(INTER_SEMIBOLD, 11);

  const data = useMemo(
    () => values.map((y, x) => ({ x, y: Number.isFinite(y) ? y : 0 })),
    [values],
  );

  const domainY = useMemo((): [number, number] => {
    const vals = values.filter((n) => Number.isFinite(n));
    if (!vals.length) return [0, 1];
    const lo = yMin ?? Math.min(...vals);
    const hi = yMax ?? Math.max(...vals);
    return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
  }, [values, yMin, yMax]);

  if (data.length < 2) return <View style={{ height, width: width ?? '100%' }} />;

  const fmt = formatPointLabel ?? ((v: number) => `${Math.round(v)}`);

  return (
    <View style={{ height, width: width ?? '100%' }}>
      <CartesianChart
        data={data}
        xKey="x"
        yKeys={['y']}
        domain={{ y: domainY }}
        domainPadding={{ left: 10, right: 14, top: showPointLabels ? 24 : 14, bottom: 8 }}
      >
        {({ points, chartBounds }) => {
          const pts = points.y.filter((p) => p.y != null);
          const last = pts[pts.length - 1];
          return (
            <>
              <Area points={points.y} y0={chartBounds.bottom} curveType="monotoneX" animate={{ type: 'timing', duration: 400 }}>
                <LinearGradient
                  start={vec(0, chartBounds.top)}
                  end={vec(0, chartBounds.bottom)}
                  colors={[`${color}55`, `${color}08`]}
                />
              </Area>
              <Line points={points.y} color={color} strokeWidth={3} curveType="monotoneX" animate={{ type: 'timing', duration: 400 }} />
              {last ? (
                <>
                  <Circle cx={last.x} cy={last.y as number} r={7} color={`${color}44`} />
                  <Circle cx={last.x} cy={last.y as number} r={4} color={color} />
                </>
              ) : null}
              {showPointLabels && font
                ? pts.map((p, i) => {
                    const label = fmt(Number(p.yValue));
                    const w = font.measureText(label).width;
                    const x = Math.min(Math.max(p.x - w / 2, chartBounds.left), chartBounds.right - w);
                    return (
                      <SkiaText
                        key={`lbl-${i}`}
                        x={x}
                        y={Math.max((p.y as number) - 10, chartBounds.top + 10)}
                        text={label}
                        font={font}
                        color={labelColor}
                      />
                    );
                  })
                : null}
            </>
          );
        }}
      </CartesianChart>
    </View>
  );
}
