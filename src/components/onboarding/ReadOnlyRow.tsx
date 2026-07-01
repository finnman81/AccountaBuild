import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

type ReadOnlyRowProps = {
  label: string;
  value: string;
};

export default function ReadOnlyRow({ label, value }: ReadOnlyRowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.row}>
        <Text variant="bodyMedium" style={[styles.label, { color: theme.colors.onSurface }]}>
          {label}
        </Text>
        <Text variant="bodyMedium" style={[styles.value, { color: theme.colors.onSurfaceVariant }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontWeight: '500',
  },
  value: {
    opacity: 0.7,
  },
});
