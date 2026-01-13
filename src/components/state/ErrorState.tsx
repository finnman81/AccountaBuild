import React from 'react';
import { View } from 'react-native';
import { Button, Text } from 'react-native-paper';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export default function ErrorState({ title = 'Something went wrong', message, onRetry }: Props) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 10 }}>
      <Text variant="titleMedium">{title}</Text>
      {message ? (
        <Text variant="bodySmall" style={{ opacity: 0.75, textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Button mode="outlined" onPress={onRetry}>
          Retry
        </Button>
      ) : null}
    </View>
  );
}

