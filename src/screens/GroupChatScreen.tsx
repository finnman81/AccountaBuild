import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { Icon } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { collection, onSnapshot } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeStackParamList } from '../navigation/types';
import { db } from '../firebase/firebase';
import { AuthContext } from '../store/AuthContext';
import { GroupMessage, sendGroupMessage, setMessageReaction, subscribeGroupMessages } from '../services/chat';
import { markGroupChatSeen } from '../services/groups';
import { subscribeGroupLogs, setLogReaction, type GroupLog } from '../services/logs';
import { getHydrated, setHydrated } from '../services/hydrationCache';
import { enqueueSocialPush } from '../services/socialPush';
import { friendlyNameFromDisplayName } from '../utils/formatters';
import { subscribePublicUsers, type PublicUser } from '../services/publicUsers';
import { blockUser, reportContent, subscribeMyBlocks } from '../services/moderation';
import { subscribeMyCanSeeUids } from '../services/visibility';
import { todayYYYYMMDD } from '../utils/dates';
import AppText from '../components/ui/AppText';
import LogCard from '../components/chat/LogCard';
import MilestoneCard from '../components/chat/MilestoneCard';
import { colors, radius, spacing } from '../theme';

type FeedItem =
  | { kind: 'message'; id: string; ms: number; msg: GroupMessage }
  | { kind: 'log'; id: string; ms: number; log: GroupLog }
  | { kind: 'day'; id: string; ms: number; label: string };

function tsMs(ts: any): number {
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

type Props = NativeStackScreenProps<HomeStackParamList, 'GroupChat'>;

export default function GroupChatScreen({ route }: Props) {
  const { user } = useContext(AuthContext);
  const { groupId } = route.params;
  const nav = useNavigation();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  // Roster seeds from the shared hydration cache (same keys Today/Leaderboard
  // write). Before this, GroupChat had to resolve members -> canSee ->
  // publicUsers as a CHAINED set of round-trips before the feed could render
  // names or filter visibility — measured at 27s worst case in Sentry.
  // Messages/logs stay uncached (Firestore Timestamps don't round-trip), but
  // they now land into a screen that already knows who everyone is.
  const [memberUids, setMemberUids] = useState<string[]>(() => getHydrated<string[]>(`members:${groupId}`) ?? []);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>(
    () => getHydrated<Record<string, PublicUser>>(`publicUsers:${groupId}`) ?? {},
  );
  const [canSee, setCanSee] = useState<Set<string>>(() => new Set(user?.uid ? getHydrated<string[]>(`canSee:${user.uid}`) ?? [] : []));
  const [logs, setLogs] = useState<GroupLog[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [composerH, setComposerH] = useState(0);

  useEffect(() => subscribeGroupMessages(groupId, setMessages), [groupId]);
  useEffect(() => {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const uids = snap.docs.map((d) => String((d.data() as any)?.uid ?? d.id)).filter(Boolean);
      setMemberUids(uids);
      setHydrated(`members:${groupId}`, uids);
    });
  }, [groupId]);
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyCanSeeUids(user.uid, (set) => {
      setCanSee(set);
      setHydrated(`canSee:${user.uid}`, Array.from(set));
    });
  }, [user?.uid]);
  useEffect(() => {
    if (!user?.uid) return;
    const allowed = memberUids.filter((uid) => uid === user.uid || canSee.has(uid));
    return subscribePublicUsers(allowed, (map) => {
      setPublicUsers(map);
      setHydrated(`publicUsers:${groupId}`, map);
    });
  }, [canSee, memberUids, user?.uid, groupId]);
  // 100, not 200: the feed only renders the last 3 days of logs, so the extra
  // 100 docs were fetched and immediately filtered out on every open.
  useEffect(() => subscribeGroupLogs(groupId, setLogs, undefined, 100), [groupId]);
  useEffect(() => {
    if (!user?.uid) return;
    return subscribeMyBlocks(user.uid, setBlocked);
  }, [user?.uid]);

  /**
   * Long-press any message or log -> report / block. App Store Guideline 1.2
   * requires BOTH for user-generated content; blocking hides them from this
   * feed immediately and stops cheers/nudges in either direction (enforced
   * server-side in sendSocialPush, so it can't be routed around).
   */
  const moderate = (targetUid: string, kind: 'message' | 'log', contentId: string, text?: string) => {
    if (!user?.uid || targetUid === user.uid) return;
    const who = nameFor(targetUid);
    Alert.alert(who, 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          void reportContent({
            reporterUid: user.uid,
            targetUid,
            kind,
            reason: 'Reported from group chat',
            groupId,
            contentId,
            contentText: text ?? null,
          }).catch(() => {});
          Alert.alert('Reported', 'Thanks — this has been sent for review.');
        },
      },
      {
        text: `Block ${who}`,
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Block ${who}?`, `You won't see their messages or logs, and they can't cheer or nudge you.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Block', style: 'destructive', onPress: () => void blockUser(user.uid, targetUid).catch(() => {}) },
          ]),
      },
    ]);
  };

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

  // Merge messages with recent visible log-cards into one time-sorted feed
  // (newest first, for the inverted list). Logs are limited to the last few days
  // so the stream stays readable.
  const feed = useMemo<FeedItem[]>(() => {
    // Blocked users disappear from the feed entirely — messages AND logs.
    const allowed = new Set(
      memberUids.filter((u) => u === user?.uid || (canSee.has(u) && !blocked.has(u))),
    );
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

    const items: FeedItem[] = [];
    for (const m of messages) {
      if (blocked.has(m.uid)) continue;
      items.push({ kind: 'message', id: `m_${m.id}`, ms: tsMs(m.createdAt) || Date.now(), msg: m });
    }
    for (const l of logs) {
      if (!allowed.has(l.uid) || l.date < cutoffStr) continue;
      items.push({ kind: 'log', id: `l_${l.id}`, ms: tsMs(l.ts), log: l });
    }
    items.sort((a, b) => b.ms - a.ms);

    // Day separators. The list is inverted (data[0] renders at the bottom), so
    // a day's header must come AFTER its last (oldest) item in the array to
    // appear visually above the day's messages.
    const withDays: FeedItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      withDays.push(item);
      const next = items[i + 1];
      if (!next || dayKey(next.ms) !== dayKey(item.ms)) {
        withDays.push({ kind: 'day', id: `d_${dayKey(item.ms)}`, ms: item.ms, label: dayLabel(item.ms) });
      }
    }
    return withDays;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, logs, memberUids, canSee, user?.uid, blocked]);

  const toggleReaction = async (logId: string, emoji: string, mine: boolean) => {
    if (!user) return;
    try {
      // Notify the log's author on this user's FIRST reaction to the log
      // (adding, not removing/changing) — the Strava-kudos loop.
      const log = logs.find((l) => l.id === logId);
      const hadReacted = !!log?.reactions?.[user.uid];
      await setLogReaction(groupId, logId, user.uid, mine ? null : emoji);
      await Haptics.selectionAsync();
      if (!mine && !hadReacted && log && log.uid !== user.uid) {
        void enqueueSocialPush({
          toUid: log.uid,
          fromUid: user.uid,
          fromName: nameFor(user.uid),
          type: 'reaction',
          emoji,
          logType: log.type,
        }).catch(() => {});
      }
    } catch {
      /* non-fatal */
    }
  };

  // Milestone cards are posted by the server (uid 'system'), so the reaction
  // map is the only field a reader is allowed to write — no author push here.
  const toggleMessageReaction = async (messageId: string, emoji: string, mine: boolean) => {
    if (!user) return;
    try {
      await setMessageReaction(groupId, messageId, user.uid, mine ? null : emoji);
      await Haptics.selectionAsync();
    } catch {
      /* non-fatal */
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      if (!user) return;
      void markGroupChatSeen({ uid: user.uid, groupId });
    }, [groupId, user?.uid]),
  );

  const send = async () => {
    if (!user || !text.trim()) return;
    setIsSending(true);
    setSendFailed(false);
    try {
      await sendGroupMessage({ groupId, uid: user.uid, text });
      setText('');
    } catch {
      // Keep the text in the input so a retry is one tap away.
      setSendFailed(true);
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
          data={feed}
          keyExtractor={(item) => item.id}
          inverted
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: composerH + spacing.md + insets.bottom }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon source="chat-outline" size={32} color={colors.textMuted} />
              <AppText variant="rowTitle" color="secondary" style={{ marginTop: spacing.md }}>Say hi to the group</AppText>
              <AppText variant="rowSubtitle" color="muted" style={{ marginTop: 4, textAlign: 'center' }}>
                Messages and everyone's logs show up here.
              </AppText>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'day') {
              return (
                <View style={styles.dayRow}>
                  <View style={styles.dayLine} />
                  <AppText variant="label" color="muted" style={styles.dayText}>{item.label}</AppText>
                  <View style={styles.dayLine} />
                </View>
              );
            }
            if (item.kind === 'log') {
              return (
                <TouchableOpacity
                  style={styles.msgRow}
                  activeOpacity={1}
                  onLongPress={() => moderate(item.log.uid, 'log', item.log.id)}
                  delayLongPress={450}
                >
                  <LogCard log={item.log} name={nameFor(item.log.uid)} myUid={user?.uid ?? ''} onToggleReaction={toggleReaction} />
                </TouchableOpacity>
              );
            }
            const mine = user?.uid === item.msg.uid;
            const isSystem = (item.msg as any).system === true;
            if (item.msg.milestone) {
              return (
                <View style={styles.msgRow}>
                  <MilestoneCard msg={item.msg} myUid={user?.uid ?? ''} onToggleReaction={toggleMessageReaction} />
                </View>
              );
            }
            if (isSystem) {
              return (
                <View style={styles.systemRow}>
                  <AppText variant="rowSubtitle" color="secondary" style={styles.systemText}>{item.msg.text}</AppText>
                </View>
              );
            }
            return (
              <TouchableOpacity
                style={[styles.msgRow, { alignItems: mine ? 'flex-end' : 'flex-start' }]}
                activeOpacity={1}
                onLongPress={() => (mine ? undefined : moderate(item.msg.uid, 'message', item.msg.id, item.msg.text))}
                delayLongPress={450}
              >
                {!mine && (
                  <AppText variant="label" color="muted" style={styles.sender}>
                    {nameFor(item.msg.uid)}  ·  {timeLabel(item.ms)}
                  </AppText>
                )}
                <View
                  style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    { borderTopLeftRadius: mine ? 18 : 6, borderTopRightRadius: mine ? 6 : 18 },
                  ]}
                >
                  <AppText variant="body" style={{ color: mine ? '#FFFFFF' : colors.textPrimary }}>{item.msg.text}</AppText>
                </View>
                {mine && <AppText variant="label" color="muted" style={styles.mineTime}>{timeLabel(item.ms)}</AppText>}
              </TouchableOpacity>
            );
          }}
        />

        {sendFailed && (
          <TouchableOpacity onPress={send} style={styles.sendFailedRow} activeOpacity={0.85}>
            <Icon source="alert-circle-outline" size={16} color={colors.danger} />
            <AppText variant="rowSubtitle" style={{ color: colors.danger }}>Message failed to send — tap to retry</AppText>
          </TouchableOpacity>
        )}
        <View onLayout={(e) => setComposerH(e.nativeEvent.layout.height)} style={[styles.composer, { paddingBottom: insets.bottom || spacing.sm }]}>
          <TouchableOpacity
            onPress={() => (nav as any).navigate('AddPhoto', { groupId })}
            style={styles.plusCircle}
            accessibilityRole="button"
            accessibilityLabel="Add a progress photo"
          >
            <Icon source="camera-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
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
  mineTime: { marginTop: 3, marginRight: spacing.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.md },
  dayLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dayText: { letterSpacing: 0.4 },
  systemRow: {
    alignSelf: 'center',
    maxWidth: '92%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderCard,
    borderRadius: 14,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  systemText: { lineHeight: 19 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, transform: [{ scaleY: -1 }] },
  sendFailedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dangerTint,
  },
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
