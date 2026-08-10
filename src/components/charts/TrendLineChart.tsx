import type React from 'react';

export type TrendLineChartProps = {
  values: number[];
  /** Second muted series (Skia impl only; the legacy SVG fallback ignores it). */
  secondaryValues?: number[];
  height?: number;
  width?: number;
  color?: string;
  showPointLabels?: boolean;
  formatPointLabel?: (v: number) => string;
  labelColor?: string;
  yMin?: number;
  yMax?: number;
};

/**
 * Trend chart entry point with a runtime fallback.
 *
 * The Skia implementation (victory-native + @shopify/react-native-skia) needs
 * native modules that only exist in builds >= iOS 34 / Android vc14. OTA (EAS
 * Update) ships this SAME JS bundle to every SDK-54 build — including older
 * ones without Skia — where a static import would throw at startup and crash
 * the app. Requiring inside try/catch keeps old builds on the legacy SVG chart
 * until they update.
 */
function resolveImpl(): React.ComponentType<TrendLineChartProps> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./TrendLineChartSkia').default;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./SimpleLineChart').default;
  }
}

const TrendLineChart = resolveImpl();

export default TrendLineChart;
