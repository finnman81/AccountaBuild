import React from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Card, Text, useTheme } from 'react-native-paper';

type Props = {
  title?: string;
  message?: string;
  skeletonCount?: number;
};

function SkeletonCard() {
  const theme = useTheme();
  const block = (h: number, w: string | number, r: number = 8) => (
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

  return (
    <Card>
      <Card.Content>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {block(44, 44, 22)}
          <View style={{ flex: 1, gap: 8 }}>
            {block(14, '55%')}
            {block(12, '35%')}
          </View>
        </View>
        <View style={{ height: 12 }} />
        {block(90, '100%', 12)}
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

