import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';

import AppText from './AppText';
import { colors, spacing } from '../../theme';

/**
 * JS stack header, used in place of the native one.
 *
 * WHY: on recent iOS the native header's back button (react-native-screens
 * 4.16) stopped responding to taps, and it labeled itself with the previous
 * route's internal name ("GroupInfo", "Today"). Members got stuck on Join
 * group, Leaderboard, Group settings. A JS header has none of that; the real
 * fix (a newer react-native-screens) needs a native build.
 */
export default function AppHeader({ navigation, options, route, back }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const title = typeof options.title === 'string' ? options.title : route.name;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {back ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <Icon source="chevron-left" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.spacer} />
        )}
        <AppText variant="rowTitle" color="primary" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        <View style={styles.spacer} />
      </View>
    </View>
  );
}

/** screenOptions entry: `header: appHeader`. */
export const appHeader = (props: NativeStackHeaderProps) => <AppHeader {...props} />;

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  row: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  spacer: { width: 40 },
  title: { flex: 1, textAlign: 'center' },
});
