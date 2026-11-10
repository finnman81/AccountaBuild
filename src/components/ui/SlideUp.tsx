import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { duration, easing } from '../../theme/motion';

/**
 * A bottom-sheet panel that slides up when it mounts.
 *
 * Use inside <Modal animationType="fade">: the dim backdrop fades in place
 * and only the panel travels. With animationType="slide" the whole modal,
 * dim layer included, rode up from the bottom edge.
 */
export default function SlideUp({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const y = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(y, { toValue: 0, duration: duration.slow, easing: easing.standard, useNativeDriver: true }).start();
  }, [y]);

  return (
    <Animated.View style={[style, { transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 360] }) }] }]}>
      {children}
    </Animated.View>
  );
}
