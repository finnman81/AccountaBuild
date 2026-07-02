import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../../theme/colors';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

/**
 * Full-bleed background with the "Midnight Blue" top radial glow used on the
 * Welcome and Sign-in screens: radial-gradient(100% 55% at 50% 0%, #1A2236, #0B0C10 70%).
 */
export default function GlowBackground({ children, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="0%" rx="100%" ry="55%">
            <Stop offset="0" stopColor="#1A2236" />
            <Stop offset="0.7" stopColor={colors.background} />
            <Stop offset="1" stopColor={colors.background} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
