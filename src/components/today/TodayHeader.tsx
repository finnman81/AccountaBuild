import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { colors } from '../../theme/colors';

type Props = {
  groupName: string;
  groupLogoURL?: string | null;
  userName: string;
  dateLabel: string;
  greeting: string;
  unreadCount?: number;
  onSwitchGroup: () => void;
  onBell: () => void;
};

function GroupTile({ name, logoURL }: { name: string; logoURL?: string | null }) {
  if (logoURL) {
    return <Image source={{ uri: logoURL }} style={styles.tileImg} resizeMode="cover" />;
  }
  const initials = name.trim().slice(0, 2).toUpperCase();
  return (
    <View style={[styles.tileImg, styles.tilePlaceholder]}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

export default function TodayHeader({ groupName, groupLogoURL, userName, dateLabel, greeting, unreadCount = 0, onSwitchGroup, onBell }: Props) {
  return (
    <View>
      <View style={styles.topRow}>
        <Pressable onPress={onSwitchGroup} style={styles.groupChip} accessibilityRole="button">
          <GroupTile name={groupName} logoURL={groupLogoURL} />
          <Text style={styles.groupName} numberOfLines={1}>
            {groupName}
          </Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
        <Pressable onPress={onBell} style={styles.bell} accessibilityRole="button">
          <Text style={{ fontSize: 20, color: colors.textSecondary }}>♪</Text>
          {unreadCount > 0 && <View style={styles.bellDot} />}
        </Pressable>
      </View>
      <Text style={styles.dateEyebrow}>{dateLabel.toUpperCase()}</Text>
      <Text style={styles.greeting}>
        {greeting}, {userName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupChip: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  tileImg: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.surface2 },
  tilePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  groupName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginLeft: 10, maxWidth: 180 },
  chevron: { fontSize: 16, color: colors.textMuted, marginLeft: 4, marginTop: -4 },
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  dateEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted, marginTop: 18 },
  greeting: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary, marginTop: 4 },
});
