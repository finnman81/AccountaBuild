import React, { useEffect, useState } from 'react';
import { Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import { buildInviteMessage } from '../../services/groups';
import { colors } from '../../theme/colors';

/**
 * Two Today cards that turn one member into a group.
 *
 * InviteFirstCard: the group is just you. A solo group is a dead end (no
 * cheers, no race, no check-ins); 4 of the first 14 App Store signups never
 * got past it. Not dismissible: it goes away when someone joins.
 *
 * ChallengeStartCard: admins of a real group with no challenge running.
 * Winter Arc was BPM's best stretch, and a named challenge is the easiest
 * reason to text someone an invite. "Not now" snoozes 14 days.
 */

export function InviteFirstCard({ groupName, joinCode }: { groupName: string; joinCode: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    await Share.share({ message: buildInviteMessage(groupName, joinCode) }).catch(() => {});
  };
  const copy = async () => {
    await Clipboard.setStringAsync(joinCode).catch(() => {});
    void Haptics.selectionAsync().catch(() => {});
    setCopied(true);
  };
  return (
    <View style={[styles.wrap, { borderColor: colors.primary }]}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Icon source="account-multiple-plus-outline" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>It's just you in {groupName}</Text>
          <Text style={styles.sub}>Streaks last longer when someone's watching. Invite one person to get it going.</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => void copy()} style={styles.code} activeOpacity={0.8} accessibilityLabel="Copy join code">
          <Text style={styles.codeText}>{joinCode}</Text>
          <Icon source={copied ? 'check' : 'content-copy'} size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void share()} style={styles.btn} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.btnText}>Share invite</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SNOOZE_PREFIX = 'challengePromptSnoozedUntil';

export function ChallengeStartCard({ groupId, groupName, onStart }: { groupId: string; groupName: string; onStart: () => void }) {
  const key = `${SNOOZE_PREFIX}:${groupId}`;
  const [snoozed, setSnoozed] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((v) => setSnoozed(!!v && Date.now() < Number(v)))
      .catch(() => setSnoozed(false));
  }, [key]);
  if (snoozed !== false) return null;
  const later = () => {
    setSnoozed(true);
    void AsyncStorage.setItem(key, String(Date.now() + 14 * 24 * 60 * 60 * 1000)).catch(() => {});
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: 'rgba(233,181,66,0.14)' }]}>
          <Icon source="flag-checkered" size={22} color={colors.rankGold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Start a group challenge</Text>
          <Text style={styles.sub}>
            Name it, pick how many weeks, and everyone in {groupName} is in. It's the easiest reason to invite someone.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={later} style={styles.later} activeOpacity={0.8} accessibilityRole="button">
          <Text style={styles.laterText}>Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onStart} style={styles.btn} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.btnText}>Start one</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderCard, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 14 },
  code: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface2, marginRight: 'auto' },
  codeText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  btnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  later: { paddingHorizontal: 12, paddingVertical: 9 },
  laterText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
