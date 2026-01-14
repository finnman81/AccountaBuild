import React, { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

type Props = {
  values: number[];
  height?: number;
  width?: number;
  color?: string;
  showPointLabels?: boolean;
  formatPointLabel?: (v: number) => string;
  labelColor?: string;
  yMin?: number;
  yMax?: number;
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
  labelColor = '#E8E8E8',
  yMin,
  yMax,
}: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = clamp((widthOverride ?? (width - 32)), 240, 520);

  const { path, points } = useMemo(() => {
    if (values.length === 0) return { path: '', points: [] as { x: number; y: number }[] };

    const computedMin = Math.min(...values);
    const computedMax = Math.max(...values);
    const min = Number.isFinite(yMin ?? NaN) ? (yMin as number) : computedMin;
    const max = Number.isFinite(yMax ?? NaN) ? (yMax as number) : computedMax;
    const range = max - min || 1;

    const pad = 8;
    const w = chartWidth;
    const h = height;
    const usableW = w - pad * 2;
    const usableH = h - pad * 2;

    const pts = values.map((v, idx) => {
      const x = pad + (usableW * (values.length === 1 ? 0.5 : idx / (values.length - 1)));
      const y = pad + usableH - ((v - min) / range) * usableH;
      return { x, y };
    });

    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return { path: d, points: pts };
  }, [chartWidth, height, values, yMax, yMin]);

  if (values.length === 0) return null;

  return (
    <View style={{ width: chartWidth, height }}>
      <Svg width={chartWidth} height={height}>
        <Path d={path} stroke={color} strokeWidth={3} fill="none" />
        {showPointLabels && values.length <= 10
          ? points.map((p, idx) => {
              const v = values[idx];
              const label = formatPointLabel ? formatPointLabel(v) : String(v);
              // Place labels to the left/right of the dot to avoid overlapping axis tick labels.
              // Auto: leftmost points label to the right, rightmost points label to the left.
              const isLeft = p.x < chartWidth * 0.25;
              const isRight = p.x > chartWidth * 0.75;
              const anchor = isLeft ? 'start' : isRight ? 'end' : 'start';
              const dx = isLeft ? 7 : isRight ? -7 : 7;
              // Avoid drawing label on top of the line (especially for zeros on the baseline).
              const preferAbove = v === 0 || p.y > height * 0.8;
              const preferBelow = p.y < 18;
              const yRaw = preferAbove ? p.y - 10 : preferBelow ? p.y + 16 : p.y + 3;
              return (
                <SvgText
                  key={`lbl-${idx}`}
                  x={p.x + dx}
                  y={Math.min(height - 6, Math.max(12, yRaw))}
                  fontSize={10}
                  fill={labelColor}
                  opacity={0.85}
                  textAnchor={anchor as any}
                >
                  {label}
                </SvgText>
              );
            })
          : null}
        {points.map((p, idx) => (
          <Circle key={idx} cx={p.x} cy={p.y} r={3.5} fill={color} />
        ))}
      </Svg>
    </View>
  );
}


