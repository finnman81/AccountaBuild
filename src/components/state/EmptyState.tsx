import React from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

type Props = {
  title: string;
  message?: string;
  ctaLabel?: string;
  onCta?: () => void;
};

export default function EmptyState({ title, message, ctaLabel, onCta }: Props) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 10 }}>
      <Text variant="titleMedium">{title}</Text>
      {message ? (
        <Text variant="bodySmall" style={{ opacity: 0.75, textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {ctaLabel && onCta ? (
        <Button mode="contained" onPress={onCta} style={{ marginTop: 4 }}>
          {ctaLabel}
        </Button>
      ) : null}
    </View>
  );
}

