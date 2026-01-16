import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';

type ProgressBarProps = {
  progress: number; // 0 to 1
  height?: number;
  color?: string;
  backgroundColor?: string;
};

export default function ProgressBar({
  progress,
  height = 8,
  color = colors.primary,
  backgroundColor = colors.divider,
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  return (
    <View
      style={[
        styles.container,
        {
          height,
          backgroundColor,
          borderRadius: radius.pill,
        },
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${clampedProgress * 100}%`,
            height,
            backgroundColor: color,
            borderRadius: radius.pill,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
