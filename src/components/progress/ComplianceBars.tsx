import React, { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { colors } from '../../theme';

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

/** Weekly group-compliance bars (weight/calories/workouts % toward goals). */
export default function ComplianceBars({ bars, height = 150 }: { bars: ComplianceBar[]; height?: number }) {
  const [chartWidth, setChartWidth] = useState(0);

  const paddingLeft = 8;
  const paddingRight = 8;
  const paddingTop = 20;
  const paddingBottom = 40;
  const xDomainPadding = 8;

  const plotW = chartWidth > 0 ? chartWidth - paddingLeft - paddingRight : 0;
  const maxH = height - paddingTop - paddingBottom;
  const baseline = height - paddingBottom;

  const barCount = bars.length;
  const gap = Math.max(12, Math.round(plotW * 0.06));
  const availableWidth = plotW - 2 * xDomainPadding;
  const barW = barCount > 0 ? Math.max(48, Math.floor((availableWidth - gap * (barCount - 1)) / barCount)) : 0;

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== chartWidth) setChartWidth(width);
  };

  return (
    <View style={{ width: '100%', height }} onLayout={handleLayout}>
      {chartWidth > 0 && (
        <Svg width={chartWidth} height={height}>
          {bars.map((b, idx) => {
            const startX = paddingLeft + xDomainPadding;
            const x = startX + idx * (barW + gap);
            const h = Math.max(2, Math.round((Math.max(0, Math.min(100, b.pct)) / 100) * maxH));
            const y = baseline - h;
            const fill = colorForPercent(b.pct, colors.danger, colors.success);
            return (
              <React.Fragment key={b.label}>
                <Rect x={x} y={baseline - maxH} width={barW} height={maxH} rx={10} ry={10} fill={colors.surface2} />
                <Rect x={x} y={y} width={barW} height={h} rx={10} ry={10} fill={fill} />
                <SvgText x={x + barW / 2} y={y - 6} fontSize="12" fontWeight="700" fill={colors.textPrimary} textAnchor="middle">
                  {b.pct}%
                </SvgText>
                <SvgText x={x + barW / 2} y={baseline + 18} fontSize="12" fill={colors.textPrimary} textAnchor="middle">
                  {b.label}
                </SvgText>
                <SvgText x={x + barW / 2} y={baseline + 34} fontSize="11" fill={colors.textMuted} textAnchor="middle">
                  {b.ratio}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      )}
    </View>
  );
}
