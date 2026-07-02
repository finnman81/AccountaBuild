import React, { useContext, useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { Icon } from 'react-native-paper';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, onSnapshot } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupMessage, sendGroupMessage, subscribeGroupMessages } from '../services/chat';
import { markGroupChatSeen } from '../services/groups';
import { subscribeGroupLogs, type GroupLog } from '../services/logs';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { todayYYYYMMDD } from '../utils/dates';
import AppText from '../components/ui/AppText';
import { colors, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupChat'>;

export default function GroupChatScreen({ route }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [memberUids, setMemberUids] = useState<string[]>([]);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [canSee, setCanSee] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [composerH, setComposerH] = useState(0);

  useEffect(() => subscribeGroupMessages(groupId, setMessages), [groupId]);
  useEffect(() => {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      setMemberUids(snap.docs.map((d) => String((d.data() as any)?.uid ?? d.id)).filter(Boolean));
    });
  }, [groupId]);
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyCanSeeUids(user.uid, setCanSee);
  }, [user?.uid]);
  useEffect(() => {
    if (!user?.uid) return;
    const allowed = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    return subscribePublicUsers(allowed, setPublicUsers);
  }, [canSee, memberUids, user?.uid]);
  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 200), [groupId]);

  const nameFor = (uid: string) => friendlyNameFromDisplayName(publicUsers[uid]?.displayName ?? null, uid);

  // Pinned status: who's logged today vs still to go (visible members).
  const pinned = useMemo(() => {
    const today = todayYYYYMMDD();
    const allowed = memberUids.filter((u) => u === user?.uid || canSee.has(u));
    const loggedToday = new Set(logs.filter((l) => l.date === today).map((l) => l.uid));
    const missing = allowed.filter((u) => !loggedToday.has(u));
    const loggedCount = allowed.filter((u) => loggedToday.has(u)).length;
    return { loggedCount, total: allowed.length, missingNames: missing.map(nameFor).slice(0, 3), missingCount: missing.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, memberUids, canSee, user?.uid, publicUsers]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user) return;
      void markGroupChatSeen({ uid: user.uid, groupId });
    }, [groupId, user?.uid]),
  );

  const send = async () => {
    if (!user || !text.trim()) return;
    setIsSending(true);
    try {
      await sendGroupMessage({ groupId, uid: user.uid, text });
      setText('');
    } finally {
      setIsSending(false);
    }
  };

  const missingLabel =
    pinned.missingCount === 0
      ? 'everyone logged today 🎉'
      : `${pinned.missingNames.join(', ')}${pinned.missingCount > pinned.missingNames.length ? ' +more' : ''} still to go`;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={headerHeight}>
      <View style={styles.container}>
        {pinned.total > 0 && (
          <View style={styles.pinned}>
            <Icon source="star" size={16} color={colors.rankGold} />
            <AppText variant="rowSubtitle" color="secondary" style={styles.pinnedText} numberOfLines={1}>
              <AppText variant="rowSubtitle" color="primary">{pinned.loggedCount}/{pinned.total} logged today</AppText>
              {`  ·  ${missingLabel}`}
            </AppText>
          </View>
        )}

        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          inverted
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: composerH + spacing.md + insets.bottom }}
          renderItem={({ item }) => {
            const mine = user?.uid === item.uid;
            return (
              <View style={[styles.msgRow, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
                {!mine && <AppText variant="label" color="muted" style={styles.sender}>{nameFor(item.uid)}</AppText>}
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    { borderTopLeftRadius: mine ? 18 : 6, borderTopRightRadius: mine ? 6 : 18 },
                  ]}
                >
                  <AppText variant="body" style={{ color: mine ? '#FFFFFF' : colors.textPrimary }}>{item.text}</AppText>
                </View>
              </View>
            );
          }}
        />

        <View onLayout={(e) => setComposerH(e.nativeEvent.layout.height)} style={[styles.composer, { paddingBottom: insets.bottom || spacing.sm }]}>
          <View style={styles.plusCircle}>
            <Icon source="plus" size={20} color={colors.textSecondary} />
          </View>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!isSending}
          />
          <TouchableOpacity onPress={send} disabled={!text.trim() || isSending} style={[styles.sendCircle, (!text.trim() || isSending) && styles.sendDisabled]}>
            <Icon source="arrow-up" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  pinnedText: { flex: 1 },
  msgRow: { marginBottom: spacing.sm },
  sender: { marginBottom: 3, marginLeft: spacing.sm },
  bubble: { maxWidth: '82%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleTheirs: { backgroundColor: colors.surface },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  plusCircle: { width: 38, height: 38, borderRadius: 999, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.base,
    paddingTop: Platform.OS === 'ios' ? 10 : 6,
    paddingBottom: Platform.OS === 'ios' ? 10 : 6,
    color: colors.textPrimary,
    fontSize: 15,
  },
  sendCircle: { width: 38, height: 38, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
});
