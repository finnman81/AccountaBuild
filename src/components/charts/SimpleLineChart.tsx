import React, { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
  values: number[];
  height?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function SimpleLineChart({ values, height = 140 }: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = clamp(width - 32, 240, 520);

  const { path, points } = useMemo(() => {
    if (values.length === 0) return { path: '', points: [] as { x: number; y: number }[] };

    const min = Math.min(...values);
    const max = Math.max(...values);
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
  }, [chartWidth, height, values]);

  if (values.length === 0) return null;

  return (
    <View style={{ width: chartWidth, height }}>
      <Svg width={chartWidth} height={height}>
        <Path d={path} stroke="#2563EB" strokeWidth={3} fill="none" />
        {points.map((p, idx) => (
          <Circle key={idx} cx={p.x} cy={p.y} r={3.5} fill="#2563EB" />
        ))}
      </Svg>
    </View>
  );
}


