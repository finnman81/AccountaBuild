import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

type OnboardingSectionProps = {
  title: string;
  children: React.ReactNode;
  showDivider?: boolean;
};

export default function OnboardingSection({ title, children, showDivider = true }: OnboardingSectionProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text variant="labelSmall" style={[styles.title, { color: theme.colors.onSurfaceVariant }]}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.content}>{children}</View>
      {showDivider && <View style={[styles.divider, { backgroundColor: theme.colors.surfaceVariant }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 12,
    opacity: 0.7,
  },
  content: {
    gap: 12,
  },
  divider: {
    height: 1,
    marginTop: 16,
    opacity: 0.2,
  },
});
