import React, { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import Card from '../ui/Card';
import Text from '../ui/Text';

import { easing } from '../../theme/motion';

type Props = {
  title?: string;
  message?: string;
  skeletonCount?: number;
};

function SkeletonCard() {
  const theme = useTheme();
  const block = (h: number, w: DimensionValue, r: number = 8) => (
    <View
      style={{
        height: h,
        width: w,
        borderRadius: r,
        backgroundColor: theme.colors.surfaceVariant,
        opacity: 0.65,
      }}
    />
  );

  // A slow breath, so a loading card reads as "working", not "stuck".
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: easing.breathe, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: easing.breathe, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Card flush>
      <Card.Content>
        <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {block(44, 44, 22)}
          <View style={{ flex: 1, gap: 8 }}>
            {block(14, '55%')}
            {block(12, '35%')}
          </View>
        </View>
        <View style={{ height: 12 }} />
        {block(90, '100%', 12)}
        </Animated.View>
      </Card.Content>
    </Card>
  );
}

export default function LoadingState({ title = 'Loading', message = 'Please wait…', skeletonCount }: Props) {
  if (skeletonCount && skeletonCount > 0) {
    return (
      <View style={{ gap: 12 }}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 12 }}>
      <ActivityIndicator />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text variant="titleMedium">{title}</Text>
        <Text variant="bodySmall" style={{ opacity: 0.75 }}>
          {message}
        </Text>
      </View>
    </View>
  );
}

