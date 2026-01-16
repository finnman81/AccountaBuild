import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Text as SvgText, ClipPath, Rect } from 'react-native-svg';

type Insets = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type Props = {
  values: number[];
  height?: number;
  width?: number;
  color?: string;
  showPointLabels?: boolean;
  formatPointLabel?: (v: number) => string;
  pointLabelPlacement?: 'auto' | 'above';
  labelColor?: string;
  yMin?: number;
  yMax?: number;
  insets?: Insets;
  xDomainPadding?: number;
  yFormatter?: (v: number) => string;
  theme?: {
    colors?: {
      primary?: string;
      text?: string;
    };
    fonts?: {
      label?: number;
    };
  };
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function SimpleLineChart({
  values,
  height = 140,
  width: widthOverride,
  color = '#2563EB',
  showPointLabels = false,
  formatPointLabel,
  pointLabelPlacement = 'auto',
  labelColor = '#E8E8E8',
  yMin,
  yMax,
  insets,
  xDomainPadding = 14,
  yFormatter,
  theme,
}: Props) {
  const [containerWidth, setContainerWidth] = useState(0);

  // Default insets as specified
  const paddingLeft = insets?.left ?? 18;
  const paddingRight = insets?.right ?? 26;
  const paddingTop = insets?.top ?? 20;
  const paddingBottom = insets?.bottom ?? 22;

  // Calculate chart width: use override if provided, otherwise measure container
  const chartWidth = widthOverride ?? (containerWidth || 320);

  const { path, points, plotW, plotH } = useMemo(() => {
    if (values.length === 0) return { path: '', points: [] as { x: number; y: number }[], plotW: 0, plotH: 0 };

    const computedMin = Math.min(...values);
    const computedMax = Math.max(...values);
    const min = Number.isFinite(yMin ?? NaN) ? (yMin as number) : computedMin;
    const max = Number.isFinite(yMax ?? NaN) ? (yMax as number) : computedMax;
    const range = max - min || 1;

    // Calculate plot area (excluding insets)
    const plotW = chartWidth - paddingLeft - paddingRight;
    const plotH = height - paddingTop - paddingBottom;

    // Map points with x domain padding and proper plot area mapping
    const pts = values.map((v, idx) => {
      // t ∈ [0,1] for position in data array
      const t = values.length === 1 ? 0.5 : idx / (values.length - 1);
      // Apply x domain padding so first/last points aren't on edge
      const x = paddingLeft + xDomainPadding + t * (plotW - 2 * xDomainPadding);
      // Map y value to plot area (inverted: top is max, bottom is min)
      const y = paddingTop + plotH - ((v - min) / range) * plotH;
      return { x, y };
    });

    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return { path: d, points: pts, plotW, plotH };
  }, [chartWidth, height, values, yMax, yMin, paddingLeft, paddingRight, paddingTop, paddingBottom, xDomainPadding]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  if (values.length === 0) return null;

  // Only render SVG when we have a valid width
  if (chartWidth === 0 || !chartWidth) {
    return <View style={{ width: widthOverride || '100%', height }} onLayout={handleLayout} />;
  }

  const clipPathId = 'chart-clip';

  return (
    <View style={{ width: chartWidth, height }} onLayout={handleLayout}>
      <Svg width={chartWidth} height={height}>
        <Defs>
          <ClipPath id={clipPathId}>
            <Rect x={paddingLeft} y={paddingTop} width={plotW} height={plotH} />
          </ClipPath>
        </Defs>

        {/* Clipped layer: Path and circles only */}
        <G clipPath={`url(#${clipPathId})`}>
          <Path d={path} stroke={color} strokeWidth={3} fill="none" />
          {points.map((p, idx) => (
            <Circle key={idx} cx={p.x} cy={p.y} r={3.5} fill={color} />
          ))}
        </G>

        {/* Unclipped layer: Labels (can escape plot bounds) */}
        {showPointLabels && values.length <= 10
          ? points.map((p, idx) => {
              const v = values[idx];
              const label = formatPointLabel ? formatPointLabel(v) : String(v);
              const isForcedAbove = pointLabelPlacement === 'above';
              const fontSize = theme?.fonts?.label ?? 10;

              // Smart vertical placement: put label below if point is near top
              const topThreshold = paddingTop + 20;
              const isNearTop = p.y < topThreshold;
              const isNearBottom = p.y > height - paddingBottom - 20;
              
              let labelY: number;
              if (isForcedAbove) {
                labelY = p.y - 12; // Always above when forced
              } else if (isNearTop) {
                labelY = p.y + 18; // Below when near top
              } else if (isNearBottom) {
                labelY = p.y - 12; // Above when near bottom
              } else {
                labelY = p.y - 12; // Default: above
              }

              // Horizontal clamping to prevent labels from going off-screen
              // More accurate width estimation (accounts for decimal points, % signs, etc.)
              const charWidth = fontSize * 0.6; // More accurate per-char width
              const estimatedLabelWidth = label.length * charWidth;
              let labelX = p.x;
              let anchor: 'start' | 'middle' | 'end' = 'middle';

              // Clamp x position with better margins
              const leftMargin = paddingLeft + 4; // Small buffer from left edge
              const rightMargin = paddingRight + 4; // Small buffer from right edge
              const minX = leftMargin;
              const maxX = chartWidth - rightMargin;
              
              // For leftmost points, align to start
              if (idx === 0 && labelX - estimatedLabelWidth / 2 < minX) {
                labelX = minX;
                anchor = 'start';
              }
              // For rightmost points, align to end
              else if (idx === values.length - 1 && labelX + estimatedLabelWidth / 2 > maxX) {
                labelX = maxX;
                anchor = 'end';
              }
              // For middle points, center but clamp if needed
              else {
                if (labelX - estimatedLabelWidth / 2 < minX) {
                  labelX = minX + estimatedLabelWidth / 2;
                  anchor = 'start';
                } else if (labelX + estimatedLabelWidth / 2 > maxX) {
                  labelX = maxX - estimatedLabelWidth / 2;
                  anchor = 'end';
                }
              }

              // Final y clamping to stay within SVG bounds with padding
              const topBound = fontSize + 4;
              const bottomBound = height - 4;
              const clampedY = clamp(labelY, topBound, bottomBound);

              return (
                <SvgText
                  key={`lbl-${idx}`}
                  x={labelX}
                  y={clampedY}
                  fontSize={fontSize}
                  fill={labelColor}
                  opacity={0.85}
                  textAnchor={anchor}
                >
                  {label}
                </SvgText>
              );
            })
          : null}
      </Svg>
    </View>
  );
}


