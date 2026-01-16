import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';

type RowProps = {
  title: string;
  icon?: string;
  onPress: () => void;
  showChevron?: boolean;
  rightElement?: React.ReactNode;
};

export default function Row({ title, icon, onPress, showChevron = true, rightElement }: RowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && (
        <IconButton
          icon={icon}
          size={20}
          iconColor={colors.textSecondary}
          style={styles.icon}
        />
      )}
      <View style={styles.content}>
        <Text variant="bodyMedium" style={{ color: colors.textPrimary }}>
          {title}
        </Text>
      </View>
      {rightElement || (showChevron && (
        <IconButton
          icon="chevron-right"
          size={20}
          iconColor={colors.textMuted}
          style={styles.chevron}
        />
      ))}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
  },
  icon: {
    margin: 0,
    marginRight: spacing.sm,
  },
  content: {
    flex: 1,
  },
  chevron: {
    margin: 0,
  },
});
