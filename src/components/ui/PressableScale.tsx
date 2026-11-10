import React, { useRef } from 'react';
import { Animated, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { pressScale, spring } from '../../theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Use ~0.94 for small icon buttons. */
  scaleTo?: number;
};

/**
 * Pressable that dips slightly while held, on the native driver. A drop-in
 * for <Pressable>: same props, no wrapper view, so layout is unchanged.
 * Not for backdrops or full-screen dismiss areas.
 */
export default function PressableScale({ style, scaleTo = pressScale, onPressIn, onPressOut, disabled, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (toValue: number) => Animated.spring(scale, { toValue, ...spring.press, useNativeDriver: true }).start();

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        if (!disabled) to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        to(1);
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }] }]}
    />
  );
}
