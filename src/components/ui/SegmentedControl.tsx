import React from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Text from './Text';

import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import PressableScale from './PressableScale';

export type SegmentOption<T extends string = string> = { value: T; label: string };

type Props<T extends string> = {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** 'surface' = active segment reads as a raised chip; 'primary' = active segment is a blue fill. */
  variant?: 'surface' | 'primary';
  style?: ViewStyle;
};

export default function SegmentedControl<T extends string>({ options, value, onChange, variant = 'surface', style }: Props<T>) {
  return (
    <View style={[styles.track, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        const activeStyle = active ? (variant === 'primary' ? styles.activePrimary : styles.activeSurface) : null;
        const textColor = active ? (variant === 'primary' ? colors.onPrimary : colors.textPrimary) : colors.textSecondary;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => {
              if (!active) void Haptics.selectionAsync().catch(() => {});
              onChange(opt.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, activeStyle]}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: textColor }}>{opt.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSurface: {
    backgroundColor: '#2A2E38',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  activePrimary: {
    backgroundColor: colors.primary,
  },
});
