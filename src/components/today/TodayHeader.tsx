import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Icon } from 'react-native-paper';

import RankEmblem from '../ui/RankEmblem';
import { colors } from '../../theme/colors';
import type { Tier } from '../../mmr/types';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

type Props = {
  groupName: string;
  groupLogoURL?: string | null;
  userName: string;
  dateLabel: string;
  greeting: string;
  unreadCount?: number;
  unreadChat?: number;
  rankTier?: Tier | null;
  rankDivision?: number | null;
  onSwitchGroup: () => void;
  onChat: () => void;
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

function RankChip({ tier, division }: { tier: Tier; division?: number | null }) {
  return (
    <View style={styles.rankChip}>
      <RankEmblem tier={tier} inline size={16} />
      <Text style={styles.rankChipText}>
        {tier}{division ? ` ${ROMAN[division]}` : ''}
      </Text>
    </View>
  );
}

export default function TodayHeader({
  groupName,
  groupLogoURL,
  userName,
  dateLabel,
  greeting,
  unreadCount = 0,
  unreadChat = 0,
  rankTier,
  rankDivision,
  onSwitchGroup,
  onChat,
  onBell,
}: Props) {
  return (
    <View>
      <View style={styles.topRow}>
        <Pressable onPress={onSwitchGroup} style={styles.groupChip} accessibilityRole="button">
          <GroupTile name={groupName} logoURL={groupLogoURL} />
          <Text style={styles.groupName} numberOfLines={1}>
            {groupName}
          </Text>
          <Icon source="chevron-down" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={styles.actions}>
          {rankTier ? <RankChip tier={rankTier} division={rankDivision} /> : null}
          <Pressable onPress={onChat} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Group chat">
            <Icon source="chat-outline" size={22} color={colors.textSecondary} />
            {unreadChat > 0 && <View style={styles.dot} />}
          </Pressable>
          <Pressable onPress={onBell} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Notifications">
            <Icon source="bell-outline" size={22} color={colors.textSecondary} />
            {unreadCount > 0 && <View style={styles.dot} />}
          </Pressable>
        </View>
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
  groupName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginLeft: 10, maxWidth: 120 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface2,
    borderRadius: 999,
    paddingLeft: 5,
    paddingRight: 9,
    paddingVertical: 4,
    marginRight: 4,
  },
  rankChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  dateEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted, marginTop: 18 },
  greeting: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary, marginTop: 4 },
});
