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
          <Pressable
            onPress={onChat}
            style={[styles.iconBtn, unreadChat > 0 && styles.iconBtnHighlight]}
            accessibilityRole="button"
            accessibilityLabel={unreadChat > 0 ? 'Group chat, new messages' : 'Group chat'}
          >
            <Icon source={unreadChat > 0 ? 'chat' : 'chat-outline'} size={26} color={unreadChat > 0 ? colors.primary : colors.textSecondary} />
            {unreadChat > 0 && <View style={styles.dot} />}
          </Pressable>
          <Pressable onPress={onBell} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={unreadCount > 0 ? `Activity, ${unreadCount} new` : 'Activity'}>
            <Icon source={unreadCount > 0 ? 'bell' : 'bell-outline'} size={26} color={unreadCount > 0 ? colors.primary : colors.textSecondary} />
            {unreadCount > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
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
  iconBtn: { width: 42, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  iconBtnHighlight: { backgroundColor: colors.primaryTint },
  dot: { position: 'absolute', top: 7, right: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, borderWidth: 1.5, borderColor: colors.background },
  countBadge: {
    position: 'absolute', top: 4, right: 3, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: colors.background,
  },
  countBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  dateEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted, marginTop: 18 },
  greeting: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.textPrimary, marginTop: 4 },
});
