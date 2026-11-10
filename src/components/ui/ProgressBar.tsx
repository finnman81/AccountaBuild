import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, type LayoutChangeEvent } from 'react-native';

import { colors } from '../../theme/colors';
import { radius } from '../../theme/radius';
import { duration, easing } from '../../theme/motion';

type ProgressBarProps = {
  progress: number; // 0 to 1
  height?: number;
  color?: string;
  backgroundColor?: string;
};

/**
 * A bar that glides to its new value at the same pace the numbers beside it
 * count (duration.count). The first paint is instant; only changes animate.
 *
 * The fill is a full-width pill slid sideways inside a clipped track, so it
 * runs on the native driver (animating `width` re-lays-out every frame on the
 * JS thread). Until the track is measured it falls back to a plain width.
 */
export default function ProgressBar({
  progress,
  height = 8,
  color = colors.primary,
  backgroundColor = colors.divider,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const [trackW, setTrackW] = useState(0);
  const anim = useRef(new Animated.Value(clamped)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      anim.setValue(clamped);
      return;
    }
    Animated.timing(anim, { toValue: clamped, duration: duration.count, easing: easing.enter, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - trackW) > 0.5) setTrackW(w);
  };

  const pill = { height, backgroundColor: color, borderRadius: radius.pill };

  return (
    <View onLayout={onLayout} style={[styles.container, { height, backgroundColor, borderRadius: radius.pill }]}>
      {trackW > 0 ? (
        <Animated.View
          style={[
            styles.fill,
            pill,
            { width: trackW, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-trackW, 0] }) }] },
          ]}
        />
      ) : (
        <View style={[styles.fill, pill, { width: `${clamped * 100}%` }]} />
      )}
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
