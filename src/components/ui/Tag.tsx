import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

type TagProps = {
  label: string;
  variant?: 'default' | 'subtle' | 'noLog';
};

export default function Tag({ label, variant = 'default' }: TagProps) {
  const isSubtle = variant === 'subtle';
  const isNoLog = variant === 'noLog';
  
  // "No log" pill: blue-gray background, primary/high-secondary text, no border (Apple Health style)
  if (isNoLog) {
    return (
      <View
        style={[
          styles.tag,
          {
            backgroundColor: colors.pillNoLog,
            borderWidth: 0,
          },
        ]}
      >
        <Text
          variant="labelSmall"
          style={{
            color: colors.textPrimary, // Primary text for better contrast
            fontWeight: '500',
          }}
        >
          {label}
        </Text>
      </View>
    );
  }
  
  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: isSubtle ? colors.surface2 : colors.surface,
          borderWidth: isSubtle ? 1 : 0,
          borderColor: isSubtle ? colors.divider : undefined,
        },
      ]}
    >
      <Text
        variant="labelSmall"
        style={{
          color: isSubtle ? colors.textSecondary : colors.textPrimary,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
});
